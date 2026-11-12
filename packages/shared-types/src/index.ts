export type ProficiencyLevel =
  | "A1"
  | "A2"
  | "B1"
  | "B2"
  | "C1"
  | "C2"
  | "UNKNOWN";

export type UserRole = "STUDENT" | "ADMIN";

export type LearningGoal =
  | "DAILY_CONVERSATION"
  | "JOB_INTERVIEW"
  | "BUSINESS_ENGLISH"
  | "TRAVEL"
  | "ACADEMIC"
  | "CONFIDENCE";

export type SpeakingSpeed = "SLOW" | "NORMAL" | "FAST";

export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELLED"
  | "EXPIRED";

export interface AuthUserDTO {
  id: string;
  email: string;
  role: UserRole;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface UserProfileDTO {
  id: string;
  userId: string;
  displayName: string;
  nativeLanguage: string;
  targetLanguage: string;
  explanationLanguage: string;
  proficiencyLevel: ProficiencyLevel;
  dailyGoalMinutes: number;
  speakingSpeed: SpeakingSpeed;
  learningGoals: LearningGoal[];
  timezone: string;
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokensDTO {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  tokenType: "Bearer";
}

export interface AuthSessionResponseDTO {
  user: AuthUserDTO;
  profile: UserProfileDTO;
  onboardingRequired: boolean;
  tokens: AuthTokensDTO;
}

export interface SubscriptionSummaryDTO {
  planName: string;
  status: SubscriptionStatus;
  dailyVoiceLimitSeconds: number;
  usedVoiceSecondsToday: number;
  remainingVoiceSecondsToday: number;
}

export interface StarterLessonSummaryDTO {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  level: ProficiencyLevel;
  category: string;
}

export interface DashboardSummaryDTO {
  user: AuthUserDTO;
  profile: UserProfileDTO;
  onboardingRequired: boolean;
  dailyGoal: {
    targetMinutes: number;
    completedMinutesToday: number;
    progressPercent: number;
  };
  subscription: SubscriptionSummaryDTO | null;
  recommendedLessons: StarterLessonSummaryDTO[];
}

// ─── Legacy / placeholder types (kept for backward compat) ──────────────────

export interface ConversationMessage {
  id: string;
  sender: "user" | "ai";
  content: string;
  timestamp: string;
  audioUrl?: string;
  grammarCorrections?: GrammarCorrection[];
}

export interface GrammarCorrection {
  original: string;
  suggestion: string;
  explanation: string;
}

export interface PracticeSessionDTO {
  id: string;
  userId: string;
  topic: string;
  messages: ConversationMessage[];
  score?: number;
  startedAt: string;
  endedAt?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ─── Milestone 3: Voice Session types ────────────────────────────────────────

/** Mirrors the Prisma `SessionStatus` enum. */
export type VoiceSessionStatus =
  | "CREATED"
  | "CONNECTING"
  | "ACTIVE"
  | "INTERRUPTED"
  | "COMPLETED"
  | "FAILED";

/** Mirrors the Prisma `MessageRole` enum for voice messages. */
export type VoiceMessageRole = "USER" | "ASSISTANT" | "SYSTEM";

/** Summary of a voice session returned by REST endpoints. */
export interface VoiceSessionDTO {
  id: string;
  userId: string;
  status: VoiceSessionStatus;
  provider: string;
  scenario: string | null;
  level: ProficiencyLevel | null;
  durationSeconds: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  lessonId: string | null;
  lessonTitle: string | null;
}

/** A single transcript message from a voice session. */
export interface VoiceMessageDTO {
  id: string;
  sessionId: string;
  role: VoiceMessageRole;
  content: string;
  sequence: number;
  language: string;
  createdAt: string;
}

/** Full transcript + metadata for a completed session. */
export interface VoiceSessionDetailDTO extends VoiceSessionDTO {
  messages: VoiceMessageDTO[];
  evaluation: SessionEvaluationDTO | null;
}

/** Server-side quota state sent on session:heartbeat WebSocket events. */
export interface VoiceQuotaSummaryDTO {
  dailyLimitSeconds: number;
  usedSecondsToday: number;
  remainingSecondsToday: number;
  sessionSeconds: number;
}

/** Full lesson detail including content (for launching practice). */
export interface LessonDetailDTO {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  level: ProficiencyLevel;
  category: string;
  content: LessonContentDTO;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Typed content block stored as JSON in the `Lesson` model. */
export interface LessonContentDTO {
  objectives: string[];
  keyPhrases: string[];
  promptStarter: string;
  /** Optional vocabulary hints for the AI tutor. */
  vocabulary?: Array<{ word: string; meaning: string }>;
}

/** Paginated list of lessons. */
export interface LessonsListDTO {
  data: StarterLessonSummaryDTO[];
  total: number;
  page: number;
  pageSize: number;
}

/** Session evaluation scores from async evaluation worker. */
export interface SessionEvaluationDTO {
  id: string;
  sessionId: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  grammarScore: number | null;
  vocabularyScore: number | null;
  fluencyScore: number | null;
  pronunciationScore: number | null;
  summary: string | null;
  strengths: string[];
  weaknesses: string[];
  corrections: GrammarCorrection[];
  evaluatedAt: string | null;
}

/** Result of one AI-processed voice turn returned over WebSocket. */
export interface VoiceTurnResultDTO {
  /** Transcript of what the learner said (returned for audio turns when available). */
  userTranscript?: string;
  /** False when the learner's speech was unclear/inaudible and Sathi asked them to repeat. */
  audioClear?: boolean;
  /** The AI tutor's textual reply (also synthesised as speech by the client). */
  reply: string;
  /** Pedagogical feedback items for the user's utterance. */
  feedback: VoiceFeedbackItemDTO[];
  /** Turn score 0-100 (optional — may be absent for opening greetings). */
  score?: number;
  /** Short encouraging phrase. */
  encouragement: string;
  /** The single follow-up question Sathi wants the learner to answer. */
  followUpQuestion: string;
  /** Sequence number of the AI message persisted to DB. */
  messageSequence: number;
  /** Updated quota after the turn. */
  quota: VoiceQuotaSummaryDTO;
}

/** Response returned by POST /api/v1/voice/sessions. */
export interface CreateVoiceSessionResponseDTO {
  session: VoiceSessionDTO;
  openingGreeting: VoiceTurnResultDTO;
  quota: VoiceQuotaSummaryDTO;
  wsNamespace: "/voice";
}

/** One feedback item within a voice turn result. */
export interface VoiceFeedbackItemDTO {
  category: "grammar" | "vocabulary" | "pronunciation_hint" | "natural_expression";
  original: string;
  suggestion: string;
  explanation: string;
  hindiExplanation?: string;
}

// ─── WebSocket event payload types ───────────────────────────────────────────

/** Client → Server: join an existing voice session. */
export interface WsJoinSessionPayload {
  sessionId: string;
}

/** Client → Server: submit a text-mode practice turn. */
export interface WsTextTurnPayload {
  sessionId: string;
  text: string;
  /** Client-measured audio duration in seconds (0 for text-mode). */
  audioDurationSeconds?: number;
}

/** Client → Server: submit an audio turn as base64-encoded PCM/webm. */
export interface WsAudioTurnPayload {
  sessionId: string;
  /** Base64-encoded audio blob. */
  audioBase64: string;
  mimeType: "audio/webm" | "audio/ogg" | "audio/wav";
  durationSeconds: number;
}

/** Client → Server: learner barged in (interrupted AI speech). */
export interface WsInterruptPayload {
  sessionId: string;
}

/** Client → Server: keepalive heartbeat. */
export interface WsHeartbeatPayload {
  sessionId: string;
}

/** Server → Client: session is ready, opening greeting included. */
export interface WsSessionReadyPayload {
  session: VoiceSessionDTO;
  openingGreeting: VoiceTurnResultDTO;
  quota: VoiceQuotaSummaryDTO;
}

/** Server → Client: a turn result (AI reply + feedback). */
export interface WsTurnResultPayload extends VoiceTurnResultDTO {
  sessionId: string;
}

/** Server → Client: session was ended (normally or by quota exhaustion). */
export interface WsSessionEndedPayload {
  sessionId: string;
  reason: "user_ended" | "quota_exceeded" | "error" | "inactivity_timeout";
  durationSeconds: number;
  evaluation: SessionEvaluationDTO | null;
}

/** Server → Client: an error occurred within the session. */
export interface WsSessionErrorPayload {
  sessionId: string;
  code: string;
  message: string;
}

/** Server → Client: live quota update on heartbeat response. */
export interface WsQuotaUpdatePayload {
  sessionId: string;
  quota: VoiceQuotaSummaryDTO;
}
