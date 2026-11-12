import type { GoogleGenAI } from "@google/genai";
import type {
    ContextualVocabularyItemDTO,
    ProficiencyLevel,
    SpeakingSpeed,
    TutorPersonaId,
} from "@english-sathi/shared-types";
import {
    parseRawJsonObject,
    type TutorTurnResponse,
} from "../schemas/tutor-response.schema";
import { buildTutorSystemPrompt } from "../prompts/tutor.prompt";
import { resolvePersonaForScenario } from "../personas/tutor-personas";
import { findScenarioContext } from "../scenarios/conversation-scenarios";
import {
    shouldAllowHindiScaffolding,
    validateAndNormalizeTutorResponse,
} from "../validators/tutor-response.validator";
import {
    buildNormalizedTextContents,
    createGeminiClient,
    DEFAULT_GEMINI_MODEL,
    generateWithModelFallback,
    resolveModelChain,
} from "../utils/gemini-runner";

/**
 * Lesson content shape from seed / DB (typed for AI use).
 */
export interface LessonContext {
    title: string;
    category: string;
    promptStarter: string;
    objectives?: string[];
    keyPhrases?: string[];
    personaId?: TutorPersonaId;
    roleplayRole?: string;
    learnerRole?: string;
    vocabulary?: Array<{
        word: string;
        meaning: string;
        hindiMeaning?: string;
        example?: string;
    }>;
}

export interface LearnerContext {
    name?: string;
    level: ProficiencyLevel;
    nativeLanguage?: string;
    speakingSpeed?: SpeakingSpeed;
    recurringMistakes?: string[];
}

export interface VoiceScenarioParams {
    lesson: LessonContext;
    learner: LearnerContext;
    personaId?: TutorPersonaId | null;
}

export interface AudioTurnParams {
    /** Base64-encoded audio — Gemini inline data format. */
    audioBase64: string;
    mimeType: "audio/webm" | "audio/ogg" | "audio/wav";
    learner: LearnerContext;
    scenario: string;
    personaId?: TutorPersonaId | null;
    messageHistory?: Array<{ role: "user" | "model"; content: string }>;
}

const UNCLEAR_TRANSCRIPT_PATTERN =
    /^(\[?\s*(silence|silent|inaudible|unclear|unintelligible|noise|background noise|no speech|nothing heard|static|music|none|empty)\s*\]?|\.{2,}|-+)$/i;

export interface AudioTurnResult extends TutorTurnResponse {
    transcript?: string;
    usedFallback?: boolean;
}

/**
 * Voice Scenario Service — session-level AI helpers.
 *
 * Responsibilities:
 * 1. Generate a persona- & scenario-aware opening greeting with preview vocabulary.
 * 2. Process native audio turns via Gemini multimodal with strict clarity checks
 *    and validated pedagogical responses (grammar correction, Hindi tips, vocabulary).
 */
export class VoiceScenarioService {
    private ai: GoogleGenAI | null = null;
    private modelChain: string[];

    constructor(apiKey?: string, modelName = DEFAULT_GEMINI_MODEL) {
        this.modelChain = resolveModelChain(modelName);
        this.ai = createGeminiClient(apiKey);
    }

    // ─── Opening Greeting ────────────────────────────────────────────────────

    async generateOpeningGreeting(params: VoiceScenarioParams): Promise<TutorTurnResponse> {
        const { lesson, learner, personaId } = params;
        const resolvedPersona = resolvePersonaForScenario({
            personaId: personaId ?? lesson.personaId,
            category: lesson.category,
            topic: lesson.title,
            level: learner.level,
        });

        if (!this.ai) {
            return this.buildFallbackGreeting(lesson, learner, resolvedPersona.id);
        }

        try {
            const systemInstruction = buildTutorSystemPrompt({
                learnerLevel: learner.level,
                topic: `${lesson.category}: ${lesson.title}`,
                category: lesson.category,
                nativeLanguage: learner.nativeLanguage,
                learnerName: learner.name,
                speakingSpeed: learner.speakingSpeed,
                recurringMistakes: learner.recurringMistakes,
                personaId: resolvedPersona.id,
                scenarioSpec: {
                    aiRole: lesson.roleplayRole,
                    learnerRole: lesson.learnerRole,
                    objectives: lesson.objectives,
                    keyPhrases: lesson.keyPhrases,
                    vocabulary: lesson.vocabulary,
                },
            });

            const objectiveHint = lesson.objectives?.length
                ? `Session objectives: ${lesson.objectives.join("; ")}.`
                : "";

            const phrasesHint = lesson.keyPhrases?.length
                ? `Key phrases the learner should practise: ${lesson.keyPhrases.slice(0, 3).join(", ")}.`
                : "";

            const userPrompt = [
                `You are starting the session. Open warmly in character using this scenario starter line, then ask the learner's first turn in 'suggestedFollowUpQuestion':`,
                `"${lesson.promptStarter}"`,
                objectiveHint,
                phrasesHint,
                `Respond only with the JSON structure specified. Set 'feedback' to [] and 'score' to null — this is an opening, not an evaluation turn. You may include 1 helpful word in 'contextualVocabulary'.`,
            ]
                .filter(Boolean)
                .join("\n");

            const { text: rawText } = await generateWithModelFallback(this.ai, this.modelChain, {
                contents: [{ role: "user", parts: [{ text: userPrompt }] }],
                systemInstruction,
                temperature: 0.4,
            });

            const parsed = parseRawJsonObject(rawText);
            const validated = validateAndNormalizeTutorResponse(parsed, {
                learnerLevel: learner.level,
                nativeLanguage: learner.nativeLanguage,
                isOpeningGreeting: true,
            });
            if (validated.ok) {
                return validated.data;
            }

            console.warn("[VoiceScenarioService] Opening greeting validation failed, using fallback:", validated.reasons);
        } catch (error) {
            console.warn("[VoiceScenarioService] Gemini API error for opening greeting:", error);
        }

        return this.buildFallbackGreeting(lesson, learner, resolvedPersona.id);
    }

    // ─── Audio Turn Processing ───────────────────────────────────────────────

    async processAudioTurn(params: AudioTurnParams): Promise<AudioTurnResult> {
        const { audioBase64, mimeType, learner, scenario, personaId, messageHistory = [] } = params;

        if (!this.ai) {
            return {
                ...this.buildUnclearAudioResponse(scenario, messageHistory),
                transcript: undefined,
                usedFallback: true,
            };
        }

        try {
            const catalogMatch = findScenarioContext(scenario);
            const systemInstruction = buildTutorSystemPrompt({
                learnerLevel: learner.level,
                topic: scenario,
                category: catalogMatch?.category,
                nativeLanguage: learner.nativeLanguage,
                learnerName: learner.name,
                speakingSpeed: learner.speakingSpeed,
                recurringMistakes: learner.recurringMistakes,
                personaId: personaId ?? catalogMatch?.recommendedPersonaId,
            });

            const historyContents = buildNormalizedTextContents(
                messageHistory.map((m) => ({
                    role: m.role,
                    text: m.content,
                })),
                scenario,
            );
            if (historyContents.length > 0 && historyContents[historyContents.length - 1].role === "user") {
                historyContents.push({
                    role: "model",
                    parts: [{ text: "Please continue." }],
                });
            }

            const audioPrompt = [
                `AUDIO LISTENING & TRANSCRIPTION RULES (STRICT):`,
                `1. Listen VERY CAREFULLY word-for-word to the learner's speech. The learner speaks Indian English (native language: ${learner.nativeLanguage || "hindi"}) at CEFR ${learner.level}.`,
                `2. Pay close attention to Indian names, cities/states (e.g., Jabalpur, Madhya Pradesh, Ahmedabad, Jaipur), everyday vocabulary, and natural pauses — NEVER replace uncertain words with random unrelated words.`,
                `3. DO NOT GUESS OR INVENT WHAT WAS SAID. Only transcribe words you genuinely hear clearly in the audio.`,
                `4. CLARITY GATE: If the audio is silent, mostly background noise, too faint, muffled, cut off, or too unclear to understand confidently:`,
                `   - Set "audioClear": false`,
                `   - Set "transcript": ""`,
                `   - Set "feedback": [], "contextualVocabulary": [], and "score": null`,
                `   - In "reply", honestly tell the student their voice was not clear enough (say whether it sounded too quiet, noisy, or cut off) and politely ask them to repeat that response clearly — do NOT praise what wasn't heard and do NOT move on to a new question/topic.`,
                `   - In "suggestedFollowUpQuestion", gently ask them to try saying it again clearly.`,
                `5. If the audio IS clearly audible:`,
                `   - Set "audioClear": true`,
                `   - Set "transcript" to the exact verbatim words the learner spoke (preserve grammatical slips accurately so you can correct them without altering their meaning).`,
                `   - Provide your concise in-character reply, accurate intent-preserving feedback (with 'example'), 1-2 contextualVocabulary items, score, encouragement, and ONE relevant suggestedFollowUpQuestion.`,
            ].join("\n");

            const userTurnParts = [
                {
                    inlineData: {
                        mimeType,
                        data: audioBase64,
                    },
                },
                {
                    text: audioPrompt,
                },
            ];

            const { text: rawText } = await generateWithModelFallback(this.ai, this.modelChain, {
                contents: [
                    ...historyContents,
                    { role: "user", parts: userTurnParts },
                ],
                systemInstruction,
                temperature: 0.2,
            });

            const parsed = parseRawJsonObject(rawText);
            const rawTranscript =
                typeof parsed?.["transcript"] === "string" ? parsed["transcript"].trim() : "";

            const validated = validateAndNormalizeTutorResponse(parsed, {
                learnerLevel: learner.level,
                nativeLanguage: learner.nativeLanguage,
            });

            if (validated.ok) {
                if (
                    validated.data.audioClear === false ||
                    rawTranscript.length === 0 ||
                    UNCLEAR_TRANSCRIPT_PATTERN.test(rawTranscript)
                ) {
                    return {
                        ...this.buildUnclearAudioResponse(scenario, messageHistory),
                        transcript: undefined,
                        usedFallback: false,
                    };
                }

                return {
                    ...validated.data,
                    audioClear: true,
                    transcript: rawTranscript,
                    usedFallback: false,
                };
            }

            console.warn("[VoiceScenarioService] Audio turn validation failed:", validated.reasons);
        } catch (error) {
            console.warn("[VoiceScenarioService] Gemini audio API error:", error);
        }

        return {
            ...this.buildUnclearAudioResponse(scenario, messageHistory),
            transcript: undefined,
            usedFallback: true,
        };
    }

    // ─── Private fallbacks ───────────────────────────────────────────────────

    private buildFallbackGreeting(
        lesson: LessonContext,
        learner: LearnerContext,
        personaId: TutorPersonaId,
    ): TutorTurnResponse {
        const name = learner.name ? `, ${learner.name}` : "";
        const allowHindi = shouldAllowHindiScaffolding(learner.level, learner.nativeLanguage);
        const catalogMatch = findScenarioContext(lesson.title);

        const rawVocab =
            lesson.vocabulary?.length
                ? lesson.vocabulary.slice(0, 1).map(
                      (v): ContextualVocabularyItemDTO => ({
                          word: v.word,
                          meaning: v.meaning,
                          hindiMeaning: allowHindi ? v.hindiMeaning : undefined,
                          example: v.example ?? `Try using "${v.word}" in your reply today.`,
                      }),
                  )
                : catalogMatch?.targetVocabulary.slice(0, 1).map((v) => ({
                      ...v,
                      hindiMeaning: allowHindi ? v.hindiMeaning : undefined,
                  })) ?? [];

        const encouragementPrefix =
            personaId === "vikram_interviewer"
                ? "Let's focus on clear, confident communication"
                : "Take your time — there are no wrong answers here";

        return {
            reply: `${lesson.promptStarter}`,
            feedback: [],
            contextualVocabulary: rawVocab,
            score: undefined,
            encouragement: `Welcome${name}! ${encouragementPrefix}.`,
            suggestedFollowUpQuestion: "Ready to begin? Just start talking when you feel comfortable!",
        };
    }

    private buildUnclearAudioResponse(
        scenario: string,
        messageHistory: Array<{ role: "user" | "model"; content: string }>,
    ): TutorTurnResponse {
        const turnCount = messageHistory.filter((m) => m.role === "user").length;
        const replies = [
            `Sorry, I couldn't hear what you said clearly in "${scenario}". Please speak a little louder and closer to your microphone so I don't misunderstand you.`,
            `Your voice wasn't clear enough for me to catch your words accurately just now. Please say that sentence again clearly without rushing.`,
            `I couldn't clearly make out your response — there may have been low volume or background noise. Please repeat it one more time cleanly.`,
        ];
        const followUps = [
            "Could you please repeat your response clearly in English?",
            "Whenever you're ready, try saying that sentence again closer to the mic.",
            "Please speak again clearly (or type below if your mic is having trouble).",
        ];

        return {
            audioClear: false,
            reply: replies[turnCount % replies.length],
            feedback: [],
            contextualVocabulary: [],
            score: undefined,
            encouragement: "No worries — clear speech matters more than speed. Take a moment and try again!",
            suggestedFollowUpQuestion: followUps[turnCount % followUps.length],
        };
    }
}
