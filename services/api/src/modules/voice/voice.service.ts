import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DEFAULT_GEMINI_MODEL,
  EnglishSathiAI,
  resolvePersonaForScenario,
  TUTOR_PERSONAS,
  VoiceScenarioService,
  type LessonContext,
  type PromptScenarioSpec,
  type TutorTurnResponse,
} from "@english-sathi/ai";
import type {
  ContextualVocabularyItemDTO,
  ConversationMessage,
  CreateVoiceSessionResponseDTO,
  LessonDetailDTO,
  ProficiencyLevel,
  SessionEvaluationDTO,
  SpeakingSpeed,
  TutorPersonaId,
  VoiceFeedbackItemDTO,
  VoiceMessageDTO,
  VoiceMessageRole,
  VoiceQuotaSummaryDTO,
  VoiceSessionDetailDTO,
  VoiceSessionDTO,
  VoiceSessionStatus,
  VoiceTurnResultDTO,
  WsSessionEndedPayload,
  WsSessionReadyPayload,
  WsTurnResultPayload,
} from "@english-sathi/shared-types";
import type {
  CreateVoiceSessionInput,
  EndVoiceSessionInput,
  VoiceTurnAudioInput,
  VoiceTurnTextInput,
} from "@english-sathi/validation";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { LessonsService } from "../lessons/lessons.service";
import { VoiceQuotaService } from "./voice-quota.service";

const MAX_AUDIO_BASE64_CHARS = 7 * 1024 * 1024; // ~5.2 MB decoded audio cap
const FREE_CONVERSATION_STARTER =
  "Hello! I'm Sathi, your English speaking partner. What topic would you like to talk about today?";

const ALLOWED_TRANSITIONS: Record<VoiceSessionStatus, VoiceSessionStatus[]> = {
  CREATED: ["CONNECTING", "ACTIVE", "COMPLETED", "FAILED"],
  CONNECTING: ["ACTIVE", "FAILED"],
  ACTIVE: ["INTERRUPTED", "COMPLETED", "FAILED"],
  INTERRUPTED: ["ACTIVE", "COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
};

export class VoiceQuotaExceededException extends ForbiddenException {
  constructor(public readonly endedPayload: WsSessionEndedPayload) {
    super("Daily voice practice quota exhausted.");
  }
}

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly tutorAI: EnglishSathiAI;
  private readonly scenarioAI: VoiceScenarioService;
  private readonly providerName: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly lessonsService: LessonsService,
    private readonly quotaService: VoiceQuotaService,
  ) {
    const geminiKey = this.config.get<string>("GEMINI_API_KEY");
    const geminiModel = this.config.get<string>("GEMINI_MODEL", DEFAULT_GEMINI_MODEL);
    this.tutorAI = new EnglishSathiAI(geminiKey, geminiModel);
    this.scenarioAI = new VoiceScenarioService(geminiKey, geminiModel);
    this.providerName =
      geminiKey && geminiKey !== "your-gemini-api-key" && geminiKey.trim().length > 0
        ? geminiModel
        : "sathi-fallback";
  }

  // ─── Session Creation ────────────────────────────────────────────────────────

  async createSession(
    userId: string,
    dto: CreateVoiceSessionInput,
  ): Promise<CreateVoiceSessionResponseDTO> {
    const quota = await this.quotaService.assertCanStartSession(userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user || !user.profile) {
      throw new NotFoundException("Learner profile not found");
    }

    let lesson: LessonDetailDTO | null = null;
    if (dto.lessonId) {
      lesson = await this.lessonsService.getLessonBySlugOrId(dto.lessonId);
    }

    const scenario = dto.scenario ?? lesson?.title ?? "Free English Practice";
    const resolvedLevel = (
      dto.level ??
      lesson?.level ??
      (user.profile.proficiencyLevel === "UNKNOWN" ? "A1" : user.profile.proficiencyLevel)
    ) as ProficiencyLevel;

    const resolvedPersona = resolvePersonaForScenario({
      personaId: dto.personaId ?? lesson?.content.personaId,
      category: lesson?.category,
      topic: scenario,
      level: resolvedLevel,
    });
    const speakingSpeed = (user.profile.speakingSpeed as SpeakingSpeed | undefined) ?? "NORMAL";
    const recurringMistakes = await this.loadRecurringMistakes(userId);

    const sessionRecord = await this.prisma.voiceSession.create({
      data: {
        userId,
        status: "CREATED",
        provider: this.providerName,
        scenario,
        level: resolvedLevel as never,
        metadata: {
          lessonId: lesson?.id ?? null,
          lessonTitle: lesson?.title ?? null,
          lessonCategory: lesson?.category ?? "Free Practice",
          promptStarter: lesson?.content.promptStarter ?? FREE_CONVERSATION_STARTER,
          personaId: resolvedPersona.id,
          ...(lesson?.content.roleplayRole ? { roleplayRole: lesson.content.roleplayRole } : {}),
          ...(lesson?.content.learnerRole ? { learnerRole: lesson.content.learnerRole } : {}),
          ...(lesson?.content.objectives?.length ? { objectives: lesson.content.objectives } : {}),
          ...(lesson?.content.keyPhrases?.length ? { keyPhrases: lesson.content.keyPhrases } : {}),
          ...(lesson?.content.vocabulary?.length ? { vocabulary: lesson.content.vocabulary } : {}),
        },
      },
    });

    const lockAcquired = await this.quotaService.acquireSessionLock(
      userId,
      sessionRecord.id,
      quota.remainingSecondsToday,
    );

    if (!lockAcquired) {
      await this.prisma.voiceSession.update({
        where: { id: sessionRecord.id },
        data: { status: "FAILED", endedAt: new Date(), durationSeconds: 0 },
      });
      const conflictSessionId = await this.quotaService.getActiveOpenLockSessionId(userId);
      if (conflictSessionId) {
        this.quotaService.throwConcurrentConflict(conflictSessionId);
      }
      throw new BadRequestException("Could not acquire active voice session lock. Please retry.");
    }

    try {
      const lessonCtx: LessonContext = lesson
        ? {
            title: lesson.title,
            category: lesson.category,
            promptStarter: lesson.content.promptStarter,
            objectives: lesson.content.objectives,
            keyPhrases: lesson.content.keyPhrases,
            personaId: resolvedPersona.id,
            roleplayRole: lesson.content.roleplayRole,
            learnerRole: lesson.content.learnerRole,
            vocabulary: lesson.content.vocabulary,
          }
        : {
            title: scenario,
            category: "Free Conversation",
            promptStarter: FREE_CONVERSATION_STARTER,
            personaId: resolvedPersona.id,
          };

      const greeting = await this.scenarioAI.generateOpeningGreeting({
        lesson: lessonCtx,
        personaId: resolvedPersona.id,
        learner: {
          name: user.profile.displayName,
          level: resolvedLevel,
          nativeLanguage: this.resolveAiLanguage(
            user.profile.explanationLanguage,
            user.profile.nativeLanguage,
          ),
          speakingSpeed,
          recurringMistakes,
        },
      });

      const contextualVocabulary = greeting.contextualVocabulary ?? [];

      const openingMsg = await this.prisma.message.create({
        data: {
          sessionId: sessionRecord.id,
          role: "ASSISTANT",
          sequence: 1,
          language: "en",
          content: greeting.reply,
          metadata: {
            personaId: resolvedPersona.id,
            feedback: greeting.feedback,
            contextualVocabulary,
            encouragement: greeting.encouragement,
            followUpQuestion: greeting.suggestedFollowUpQuestion,
          } as never,
        },
      });

      const openingGreeting: VoiceTurnResultDTO = {
        personaId: resolvedPersona.id,
        reply: greeting.reply,
        feedback: [],
        contextualVocabulary,
        encouragement: greeting.encouragement,
        followUpQuestion: greeting.suggestedFollowUpQuestion,
        messageSequence: openingMsg.sequence,
        quota,
      };

      return {
        session: this.toSessionDTO(sessionRecord),
        openingGreeting,
        quota,
        wsNamespace: "/voice",
      };
    } catch (error) {
      // Failed creation never consumes quota
      await this.prisma.voiceSession.update({
        where: { id: sessionRecord.id },
        data: { status: "FAILED", endedAt: new Date(), durationSeconds: 0 },
      });
      await this.quotaService.releaseSessionLock(userId, sessionRecord.id);
      throw error;
    }
  }

  // ─── Session Listing & Detail ────────────────────────────────────────────────

  async listSessions(userId: string, limit = 20): Promise<VoiceSessionDTO[]> {
    const sessions = await this.prisma.voiceSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 50),
    });
    return sessions.map((s) => this.toSessionDTO(s));
  }

  async getSessionDetail(userId: string, sessionId: string): Promise<VoiceSessionDetailDTO> {
    const session = await this.prisma.voiceSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { sequence: "asc" } },
        evaluation: true,
      },
    });

    if (!session) {
      throw new NotFoundException("Voice session not found");
    }
    if (session.userId !== userId) {
      throw new ForbiddenException("You do not have access to this voice session");
    }

    return {
      ...this.toSessionDTO(session),
      messages: session.messages.map((m) => this.toMessageDTO(m)),
      evaluation: session.evaluation ? this.toEvaluationDTO(session.evaluation) : null,
    };
  }

  // ─── WebSocket Join & Lifecycle Transitions ──────────────────────────────────

  async joinSession(userId: string, sessionId: string): Promise<WsSessionReadyPayload> {
    const session = await this.loadOwnedSession(userId, sessionId);

    if (session.status === "COMPLETED" || session.status === "FAILED") {
      throw new BadRequestException(`Voice session has already ended (${session.status}).`);
    }

    let updated = session;
    if (session.status === "CREATED") {
      this.assertTransition("CREATED", "CONNECTING");
      this.assertTransition("CONNECTING", "ACTIVE");
      updated = await this.prisma.voiceSession.update({
        where: { id: sessionId },
        data: { status: "ACTIVE", startedAt: new Date() },
      });
    } else if (session.status === "CONNECTING" || session.status === "INTERRUPTED") {
      this.assertTransition(session.status as VoiceSessionStatus, "ACTIVE");
      updated = await this.prisma.voiceSession.update({
        where: { id: sessionId },
        data: {
          status: "ACTIVE",
          ...(session.startedAt ? {} : { startedAt: new Date() }),
        },
      });
    }

    const quota = await this.quotaService.getQuotaSummary(userId, updated.startedAt);
    if (quota.remainingSecondsToday <= 0) {
      const ended = await this.endSession(userId, sessionId, "quota_exceeded");
      throw new VoiceQuotaExceededException(ended);
    }

    await this.quotaService.refreshHeartbeat(userId, sessionId, quota.remainingSecondsToday, {
      allowReacquire: true,
    });

    const firstMsg = await this.prisma.message.findFirst({
      where: { sessionId, role: "ASSISTANT" },
      orderBy: { sequence: "asc" },
    });

    const meta = this.asRecord(firstMsg?.metadata);
    const sessionTeaching = this.extractSessionTeachingContext(updated.metadata);
    const personaId =
      this.parseValidPersonaId(meta["personaId"]) ??
      sessionTeaching.personaId ??
      resolvePersonaForScenario({
        category: sessionTeaching.category,
        topic: updated.scenario ?? undefined,
        level: (updated.level as ProficiencyLevel | null) ?? undefined,
      }).id;
    const contextualVocabulary = this.extractContextualVocabulary(meta["contextualVocabulary"]);

    const openingGreeting: VoiceTurnResultDTO = {
      personaId,
      reply: firstMsg?.content ?? FREE_CONVERSATION_STARTER,
      feedback: [],
      contextualVocabulary,
      encouragement:
        typeof meta["encouragement"] === "string"
          ? meta["encouragement"]
          : "Welcome! Take your time and speak naturally.",
      followUpQuestion:
        typeof meta["followUpQuestion"] === "string"
          ? meta["followUpQuestion"]
          : "How would you like to begin?",
      messageSequence: firstMsg?.sequence ?? 1,
      quota,
    };

    return {
      session: this.toSessionDTO(updated),
      openingGreeting,
      quota,
    };
  }

  async interruptSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.loadOwnedSession(userId, sessionId);
    if (session.status === "INTERRUPTED") return;
    if (session.status === "COMPLETED" || session.status === "FAILED") {
      return;
    }

    if (session.status === "ACTIVE") {
      this.assertTransition("ACTIVE", "INTERRUPTED");
      await this.prisma.voiceSession.update({
        where: { id: sessionId },
        data: { status: "INTERRUPTED" },
      });
    }
  }

  async heartbeat(
    userId: string,
    sessionId: string,
  ): Promise<{ quota: VoiceQuotaSummaryDTO; expired: boolean; endedPayload?: WsSessionEndedPayload }> {
    const session = await this.loadOwnedSession(userId, sessionId);
    if (session.status === "COMPLETED" || session.status === "FAILED") {
      const quota = await this.quotaService.getQuotaSummary(userId);
      return { quota, expired: true };
    }

    const quota = await this.quotaService.getQuotaSummary(userId, session.startedAt);
    if (quota.remainingSecondsToday <= 0) {
      const endedPayload = await this.endSession(userId, sessionId, "quota_exceeded");
      return { quota, expired: true, endedPayload };
    }

    await this.quotaService.refreshHeartbeat(userId, sessionId, quota.remainingSecondsToday);
    return { quota, expired: false };
  }

  // ─── Conversational Turns (Text & Audio) ─────────────────────────────────────

  async processTextTurn(
    userId: string,
    dto: VoiceTurnTextInput,
  ): Promise<WsTurnResultPayload> {
    return this.quotaService.withTurnLock(dto.sessionId, async () => {
      const { session, profile, history, quota, recurringMistakes } =
        await this.prepareTurnContext(userId, dto.sessionId);

      const teaching = this.resolveTurnTeachingConfig(session, profile);
      const aiResponse = await this.tutorAI.generateTurnResponse({
        userMessage: dto.text,
        learnerLevel: teaching.level,
        topic: teaching.topic,
        history: history.map((m): ConversationMessage => ({
          id: m.id,
          sender: m.role === "USER" ? "user" : "ai",
          content: m.content,
          timestamp: m.createdAt.toISOString(),
        })),
        nativeLanguage: teaching.nativeLanguage,
        learnerName: profile.displayName,
        personaId: teaching.personaId,
        speakingSpeed: teaching.speakingSpeed,
        scenarioSpec: teaching.scenarioSpec,
        recurringMistakes,
      });

      const assistantSeq = await this.persistTurnMessages(
        session.id,
        dto.text,
        { audioDurationSeconds: dto.audioDurationSeconds },
        aiResponse,
        teaching.personaId,
      );

      const updatedQuota = await this.quotaService.getQuotaSummary(userId, session.startedAt);
      await this.quotaService.refreshHeartbeat(
        userId,
        session.id,
        updatedQuota.remainingSecondsToday,
      );

      return {
        sessionId: session.id,
        personaId: teaching.personaId,
        reply: aiResponse.reply,
        feedback: aiResponse.feedback as VoiceFeedbackItemDTO[],
        contextualVocabulary: aiResponse.contextualVocabulary ?? [],
        ...(aiResponse.score !== undefined ? { score: aiResponse.score } : {}),
        encouragement: aiResponse.encouragement,
        followUpQuestion: aiResponse.suggestedFollowUpQuestion,
        messageSequence: assistantSeq,
        quota: updatedQuota.remainingSecondsToday < quota.remainingSecondsToday ? updatedQuota : quota,
      };
    });
  }

  async processAudioTurn(
    userId: string,
    dto: VoiceTurnAudioInput,
  ): Promise<WsTurnResultPayload> {
    if (dto.audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
      throw new BadRequestException("Audio payload exceeds maximum allowed size (5 MB).");
    }

    return this.quotaService.withTurnLock(dto.sessionId, async () => {
      const { session, profile, history, recurringMistakes } = await this.prepareTurnContext(
        userId,
        dto.sessionId,
      );

      const teaching = this.resolveTurnTeachingConfig(session, profile);

      const audioResult = await this.scenarioAI.processAudioTurn({
        audioBase64: dto.audioBase64,
        mimeType: dto.mimeType,
        scenario: teaching.topic,
        personaId: teaching.personaId,
        learner: {
          name: profile.displayName,
          level: teaching.level,
          nativeLanguage: teaching.nativeLanguage,
          speakingSpeed: teaching.speakingSpeed,
          recurringMistakes,
        },
        messageHistory: history.map((m) => ({
          role: m.role === "USER" ? ("user" as const) : ("model" as const),
          content: m.content,
        })),
      });

      let transcript = audioResult.audioClear === false ? undefined : audioResult.transcript?.trim();
      let finalResponse: TutorTurnResponse = audioResult;
      let audioClear: boolean = audioResult.audioClear !== false;

      // Only consult browser live captions when Gemini itself could not run (fallback mode).
      // Never override Gemini's own unclear-audio judgment with browser speech hints.
      const hint = dto.transcriptHint?.trim();
      if (audioResult.usedFallback && !transcript && hint) {
        if (this.isFallbackCaptionClear(hint, dto.durationSeconds, dto.transcriptConfidence)) {
          transcript = hint;
          audioClear = true;
          finalResponse = await this.tutorAI.generateTurnResponse({
            userMessage: hint,
            learnerLevel: teaching.level,
            topic: teaching.topic,
            history: history.map((m): ConversationMessage => ({
              id: m.id,
              sender: m.role === "USER" ? "user" : "ai",
              content: m.content,
              timestamp: m.createdAt.toISOString(),
            })),
            nativeLanguage: teaching.nativeLanguage,
            learnerName: profile.displayName,
            personaId: teaching.personaId,
            speakingSpeed: teaching.speakingSpeed,
            scenarioSpec: teaching.scenarioSpec,
            recurringMistakes,
          });
        } else {
          audioClear = false;
          transcript = undefined;
          finalResponse = {
            audioClear: false,
            reply: `Your voice wasn't completely clear just now (I only caught "${hint}"). Please say your full sentence again clearly closer to the mic so I can understand you accurately.`,
            feedback: [],
            contextualVocabulary: [],
            score: undefined,
            encouragement: "Take your time — speaking clearly is what we're practicing!",
            suggestedFollowUpQuestion: "Could you please repeat your full response cleanly?",
          };
        }
      }

      if (!audioClear || !transcript) {
        audioClear = false;
      }

      const persistedUserContent = audioClear && transcript
        ? transcript
        : "[Unclear audio — asked to repeat]";

      const assistantSeq = await this.persistTurnMessages(
        session.id,
        persistedUserContent,
        {
          mimeType: dto.mimeType,
          audioDurationSeconds: dto.durationSeconds,
          hasAudio: true,
          audioClear,
        },
        finalResponse,
        teaching.personaId,
      );

      const updatedQuota = await this.quotaService.getQuotaSummary(userId, session.startedAt);
      await this.quotaService.refreshHeartbeat(
        userId,
        session.id,
        updatedQuota.remainingSecondsToday,
      );

      return {
        sessionId: session.id,
        personaId: teaching.personaId,
        audioClear,
        ...(audioClear && transcript ? { userTranscript: transcript } : {}),
        reply: finalResponse.reply,
        feedback: finalResponse.feedback as VoiceFeedbackItemDTO[],
        contextualVocabulary: finalResponse.contextualVocabulary ?? [],
        ...(finalResponse.score !== undefined ? { score: finalResponse.score } : {}),
        encouragement: finalResponse.encouragement,
        followUpQuestion: finalResponse.suggestedFollowUpQuestion,
        messageSequence: assistantSeq,
        quota: updatedQuota,
      };
    });
  }

  // ─── Transactional Idempotent Session Completion ─────────────────────────────

  async endSession(
    userId: string,
    sessionId: string,
    reason: EndVoiceSessionInput["reason"] = "user_ended",
  ): Promise<WsSessionEndedPayload> {
    const session = await this.prisma.voiceSession.findUnique({
      where: { id: sessionId },
      include: { evaluation: true },
    });

    if (!session) {
      throw new NotFoundException("Voice session not found");
    }
    if (session.userId !== userId) {
      throw new ForbiddenException("You do not have access to this voice session");
    }

    // Idempotent: already completed or failed -> return existing state without re-billing
    if (session.status === "COMPLETED" || session.status === "FAILED") {
      await this.quotaService.releaseSessionLock(userId, sessionId);
      return {
        sessionId: session.id,
        reason,
        durationSeconds: session.durationSeconds,
        evaluation: session.evaluation ? this.toEvaluationDTO(session.evaluation) : null,
      };
    }

    const now = new Date();
    const failedBeforeActive =
      reason === "error" &&
      (session.status === "CREATED" || session.status === "CONNECTING") &&
      !session.startedAt;

    if (failedBeforeActive) {
      await this.prisma.voiceSession.update({
        where: { id: sessionId },
        data: {
          status: "FAILED",
          endedAt: now,
          durationSeconds: 0,
          metadata: { ...this.asRecord(session.metadata), endReason: reason } as never,
        },
      });
      await this.quotaService.releaseSessionLock(userId, sessionId);
      return {
        sessionId,
        reason,
        durationSeconds: 0,
        evaluation: null,
      };
    }

    // Server-side duration clamped to available quota before this session
    const [dailyLimit, completedBefore] = await Promise.all([
      this.quotaService.getDailyLimitSeconds(userId),
      this.quotaService.getCompletedUsedSecondsToday(userId),
    ]);
    const remainingBefore = Math.max(0, dailyLimit - completedBefore);
    const rawElapsed = session.startedAt
      ? Math.max(1, Math.floor((now.getTime() - session.startedAt.getTime()) / 1000))
      : 0;
    const durationSeconds = session.startedAt
      ? Math.min(rawElapsed, Math.max(1, remainingBefore))
      : 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.voiceSession.update({
        where: { id: sessionId },
        data: {
          status: "COMPLETED",
          endedAt: now,
          durationSeconds,
          metadata: { ...this.asRecord(session.metadata), endReason: reason } as never,
        },
      });

      if (durationSeconds > 0) {
        await tx.usageRecord.create({
          data: {
            userId,
            sessionId,
            usageType: "voice_session",
            quantity: durationSeconds,
            unit: "seconds",
            provider: session.provider,
          },
        });
      }
    });

    await this.quotaService.releaseSessionLock(userId, sessionId);
    this.logger.log(
      `Voice session ${sessionId} completed (reason=${reason}, duration=${durationSeconds}s)`,
    );

    return {
      sessionId,
      reason,
      durationSeconds,
      evaluation: null,
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private async prepareTurnContext(userId: string, sessionId: string) {
    let session = await this.loadOwnedSession(userId, sessionId);

    if (session.status === "COMPLETED" || session.status === "FAILED") {
      throw new BadRequestException(`Voice session has already ended (${session.status}).`);
    }

    // Transition CREATED / CONNECTING / INTERRUPTED -> ACTIVE when a turn arrives
    if (session.status !== "ACTIVE") {
      if (session.status === "CREATED") {
        this.assertTransition("CREATED", "ACTIVE");
      } else {
        this.assertTransition(session.status as VoiceSessionStatus, "ACTIVE");
      }
      session = await this.prisma.voiceSession.update({
        where: { id: sessionId },
        data: {
          status: "ACTIVE",
          ...(session.startedAt ? {} : { startedAt: new Date() }),
        },
      });
    }

    const quota = await this.quotaService.getQuotaSummary(userId, session.startedAt);
    if (quota.remainingSecondsToday <= 0) {
      const endedPayload = await this.endSession(userId, sessionId, "quota_exceeded");
      throw new VoiceQuotaExceededException(endedPayload);
    }

    const [profile, history, recurringMistakes] = await Promise.all([
      this.prisma.userProfile.findUniqueOrThrow({ where: { userId } }),
      this.prisma.message.findMany({
        where: { sessionId },
        orderBy: { sequence: "asc" },
        take: 24,
      }),
      this.loadRecurringMistakes(userId),
    ]);

    return { session, profile, history, quota, recurringMistakes };
  }

  private async persistTurnMessages(
    sessionId: string,
    userContent: string,
    userMetadata: Record<string, unknown>,
    aiResponse: TutorTurnResponse,
    personaId?: TutorPersonaId,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.voiceSession.findUnique({
        where: { id: sessionId },
        select: { status: true },
      });
      if (!current || current.status === "COMPLETED" || current.status === "FAILED") {
        throw new BadRequestException(
          `Voice session has already ended (${current?.status ?? "NOT_FOUND"}).`,
        );
      }

      const last = await tx.message.findFirst({
        where: { sessionId },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      const userSeq = (last?.sequence ?? 0) + 1;
      const assistantSeq = userSeq + 1;

      await tx.message.create({
        data: {
          sessionId,
          role: "USER",
          sequence: userSeq,
          language: "en",
          content: userContent,
          metadata: userMetadata as never,
        },
      });

      await tx.message.create({
        data: {
          sessionId,
          role: "ASSISTANT",
          sequence: assistantSeq,
          language: "en",
          content: aiResponse.reply,
          metadata: {
            ...(personaId ? { personaId } : {}),
            feedback: aiResponse.feedback,
            contextualVocabulary: aiResponse.contextualVocabulary ?? [],
            score: aiResponse.score,
            encouragement: aiResponse.encouragement,
            followUpQuestion: aiResponse.suggestedFollowUpQuestion,
          } as never,
        },
      });

      await tx.voiceSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });

      return assistantSeq;
    });
  }

  private async loadOwnedSession(userId: string, sessionId: string) {
    const session = await this.prisma.voiceSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException("Voice session not found");
    }
    if (session.userId !== userId) {
      throw new ForbiddenException("You do not have access to this voice session");
    }
    return session;
  }

  private assertTransition(from: VoiceSessionStatus, to: VoiceSessionStatus): void {
    const allowed = ALLOWED_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      throw new BadRequestException(`Invalid voice session state transition: ${from} -> ${to}`);
    }
  }

  private isFallbackCaptionClear(
    caption: string,
    durationSeconds: number,
    confidence?: number,
  ): boolean {
    if (confidence !== undefined && confidence > 0 && confidence < 0.6) {
      return false;
    }
    const wordCount = caption.trim().split(/\s+/).filter(Boolean).length;
    if (durationSeconds >= 5 && wordCount <= 2) {
      return false;
    }
    if (durationSeconds >= 7 && wordCount / durationSeconds < 0.45) {
      return false;
    }
    return wordCount >= 1;
  }

  private resolveAiLanguage(explanationLanguage: string, nativeLanguage: string): string {
    const code = (explanationLanguage || nativeLanguage || "hi").toLowerCase();
    return code === "hi" || code === "hindi" ? "hindi" : "english";
  }

  private async loadRecurringMistakes(userId: string): Promise<string[]> {
    const rows = await this.prisma.learningMemory.findMany({
      where: {
        userId,
        memoryType: { in: ["recurring_mistake", "grammar_weakness", "mistake"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: { content: true },
    });

    const mistakes: string[] = [];
    for (const row of rows) {
      if (typeof row.content === "string" && row.content.trim()) {
        mistakes.push(row.content.trim());
        continue;
      }
      const rec = this.asRecord(row.content);
      const text = rec["description"] ?? rec["pattern"] ?? rec["mistake"];
      if (typeof text === "string" && text.trim()) {
        mistakes.push(text.trim());
      }
    }
    return mistakes;
  }

  private parseValidPersonaId(raw: unknown): TutorPersonaId | undefined {
    if (typeof raw === "string" && Object.prototype.hasOwnProperty.call(TUTOR_PERSONAS, raw)) {
      return raw as TutorPersonaId;
    }
    return undefined;
  }

  private extractSessionTeachingContext(rawMetadata: unknown): {
    personaId?: TutorPersonaId;
    category?: string;
    scenarioSpec?: PromptScenarioSpec;
  } {
    const meta = this.asRecord(rawMetadata);
    const personaId = this.parseValidPersonaId(meta["personaId"]);
    const category =
      typeof meta["lessonCategory"] === "string" && meta["lessonCategory"].trim().length > 0
        ? meta["lessonCategory"].trim()
        : undefined;

    const aiRole =
      typeof meta["roleplayRole"] === "string" ? meta["roleplayRole"].trim() : undefined;
    const learnerRole =
      typeof meta["learnerRole"] === "string" ? meta["learnerRole"].trim() : undefined;
    const objectives = Array.isArray(meta["objectives"])
      ? meta["objectives"].filter((x): x is string => typeof x === "string")
      : undefined;
    const keyPhrases = Array.isArray(meta["keyPhrases"])
      ? meta["keyPhrases"].filter((x): x is string => typeof x === "string")
      : undefined;
    const vocabulary = Array.isArray(meta["vocabulary"])
      ? meta["vocabulary"].flatMap((item) => {
          const rec = this.asRecord(item);
          const word = typeof rec["word"] === "string" ? rec["word"].trim() : "";
          const meaning = typeof rec["meaning"] === "string" ? rec["meaning"].trim() : "";
          if (!word || !meaning) return [];
          return [
            {
              word,
              meaning,
              ...(typeof rec["hindiMeaning"] === "string"
                ? { hindiMeaning: rec["hindiMeaning"] }
                : {}),
              ...(typeof rec["example"] === "string" ? { example: rec["example"] } : {}),
            },
          ];
        })
      : undefined;

    const hasSpec =
      Boolean(aiRole) ||
      Boolean(learnerRole) ||
      Boolean(objectives && objectives.length > 0) ||
      Boolean(keyPhrases && keyPhrases.length > 0) ||
      Boolean(vocabulary && vocabulary.length > 0);

    return {
      ...(personaId ? { personaId } : {}),
      ...(category ? { category } : {}),
      ...(hasSpec
        ? {
            scenarioSpec: {
              ...(aiRole ? { aiRole } : {}),
              ...(learnerRole ? { learnerRole } : {}),
              ...(objectives && objectives.length > 0 ? { objectives } : {}),
              ...(keyPhrases && keyPhrases.length > 0 ? { keyPhrases } : {}),
              ...(vocabulary && vocabulary.length > 0 ? { vocabulary } : {}),
            },
          }
        : {}),
    };
  }

  private resolveTurnTeachingConfig(
    session: { level: string | null; scenario: string | null; metadata: unknown },
    profile: {
      proficiencyLevel: string;
      explanationLanguage: string;
      nativeLanguage: string;
      speakingSpeed: string;
    },
  ): {
    level: ProficiencyLevel;
    topic: string;
    nativeLanguage: string;
    speakingSpeed: SpeakingSpeed;
    personaId: TutorPersonaId;
    scenarioSpec?: PromptScenarioSpec;
  } {
    const level = (
      session.level ??
      (profile.proficiencyLevel === "UNKNOWN" ? "A1" : profile.proficiencyLevel)
    ) as ProficiencyLevel;
    const topic = session.scenario ?? "English Conversation";
    const teachingCtx = this.extractSessionTeachingContext(session.metadata);
    const persona = resolvePersonaForScenario({
      personaId: teachingCtx.personaId,
      category: teachingCtx.category,
      topic,
      level,
    });

    return {
      level,
      topic,
      nativeLanguage: this.resolveAiLanguage(
        profile.explanationLanguage,
        profile.nativeLanguage,
      ),
      speakingSpeed: (profile.speakingSpeed as SpeakingSpeed | undefined) ?? "NORMAL",
      personaId: persona.id,
      scenarioSpec: teachingCtx.scenarioSpec,
    };
  }

  private extractContextualVocabulary(raw: unknown): ContextualVocabularyItemDTO[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      const rec = this.asRecord(item);
      const word = typeof rec["word"] === "string" ? rec["word"].trim() : "";
      const meaning = typeof rec["meaning"] === "string" ? rec["meaning"].trim() : "";
      const example = typeof rec["example"] === "string" ? rec["example"].trim() : "";
      if (!word || !meaning || !example) return [];
      return [
        {
          word,
          meaning,
          example,
          ...(typeof rec["partOfSpeech"] === "string"
            ? { partOfSpeech: rec["partOfSpeech"] }
            : {}),
          ...(typeof rec["hindiMeaning"] === "string"
            ? { hindiMeaning: rec["hindiMeaning"] }
            : {}),
        },
      ];
    });
  }

  private asRecord(val: unknown): Record<string, unknown> {
    return val && typeof val === "object" && !Array.isArray(val)
      ? (val as Record<string, unknown>)
      : {};
  }

  private toSessionDTO(s: {
    id: string;
    userId: string;
    status: string;
    provider: string;
    scenario: string | null;
    level: string | null;
    durationSeconds: number;
    startedAt: Date | null;
    endedAt: Date | null;
    createdAt: Date;
    metadata: unknown;
  }): VoiceSessionDTO {
    const meta = this.asRecord(s.metadata);
    const personaId = this.parseValidPersonaId(meta["personaId"]);
    return {
      id: s.id,
      userId: s.userId,
      status: s.status as VoiceSessionStatus,
      provider: s.provider,
      scenario: s.scenario,
      level: (s.level as ProficiencyLevel | null) ?? null,
      ...(personaId ? { personaId } : {}),
      durationSeconds: s.durationSeconds,
      startedAt: s.startedAt?.toISOString() ?? null,
      endedAt: s.endedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      lessonId: typeof meta["lessonId"] === "string" ? meta["lessonId"] : null,
      lessonTitle: typeof meta["lessonTitle"] === "string" ? meta["lessonTitle"] : null,
    };
  }

  private toMessageDTO(m: {
    id: string;
    sessionId: string;
    role: string;
    content: string;
    sequence: number;
    language: string;
    createdAt: Date;
  }): VoiceMessageDTO {
    return {
      id: m.id,
      sessionId: m.sessionId,
      role: m.role as VoiceMessageRole,
      content: m.content,
      sequence: m.sequence,
      language: m.language,
      createdAt: m.createdAt.toISOString(),
    };
  }

  private toEvaluationDTO(e: {
    id: string;
    sessionId: string;
    status: string;
    grammarScore: number | null;
    vocabularyScore: number | null;
    fluencyScore: number | null;
    pronunciationScore: number | null;
    summary: string | null;
    strengths: unknown;
    weaknesses: unknown;
    corrections: unknown;
    evaluatedAt: Date | null;
  }): SessionEvaluationDTO {
    return {
      id: e.id,
      sessionId: e.sessionId,
      status: e.status as SessionEvaluationDTO["status"],
      grammarScore: e.grammarScore,
      vocabularyScore: e.vocabularyScore,
      fluencyScore: e.fluencyScore,
      pronunciationScore: e.pronunciationScore,
      summary: e.summary,
      strengths: Array.isArray(e.strengths) ? (e.strengths as string[]) : [],
      weaknesses: Array.isArray(e.weaknesses) ? (e.weaknesses as string[]) : [],
      corrections: Array.isArray(e.corrections)
        ? (e.corrections as SessionEvaluationDTO["corrections"])
        : [],
      evaluatedAt: e.evaluatedAt?.toISOString() ?? null,
    };
  }
}

