import { GoogleGenAI } from "@google/genai";
import type { ProficiencyLevel } from "@english-sathi/shared-types";
import {
    TutorTurnResponseSchema,
    type TutorTurnResponse,
} from "../schemas/tutor-response.schema";
import { buildTutorSystemPrompt } from "../prompts/tutor.prompt";

/**
 * Lesson content shape from seed / DB (typed for AI use).
 */
export interface LessonContext {
    title: string;
    category: string;
    promptStarter: string;
    objectives?: string[];
    keyPhrases?: string[];
}

export interface LearnerContext {
    name?: string;
    level: ProficiencyLevel;
    nativeLanguage?: string;
    recurringMistakes?: string[];
}

export interface VoiceScenarioParams {
    lesson: LessonContext;
    learner: LearnerContext;
}

export interface AudioTurnParams {
    /** Base64-encoded audio — Gemini inline data format. */
    audioBase64: string;
    mimeType: "audio/webm" | "audio/ogg" | "audio/wav";
    learner: LearnerContext;
    scenario: string;
    messageHistory?: Array<{ role: "user" | "model"; content: string }>;
}

/**
 * Voice Scenario Service — session-level AI helpers.
 *
 * Responsibilities:
 * 1. Generate a lesson-aware opening greeting (Sathi as the scenario participant).
 * 2. Process native audio turns via Gemini multimodal (falls back to transcription-less heuristic).
 */
export class VoiceScenarioService {
    private ai: GoogleGenAI | null = null;
    private modelName: string;

    constructor(apiKey?: string, modelName = "gemini-2.5-flash") {
        this.modelName = modelName;
        const key = apiKey || process.env.GEMINI_API_KEY;
        if (key && key !== "your-gemini-api-key" && key.trim().length > 0) {
            this.ai = new GoogleGenAI({ apiKey: key });
        }
    }

    // ─── Opening Greeting ────────────────────────────────────────────────────

    /**
     * Generates Sathi's opening message when a voice session starts.
     * Uses the lesson's `promptStarter` as the seed line and enriches it with
     * learner context. Falls back to a formatted version of promptStarter when
     * no API key is configured.
     */
    async generateOpeningGreeting(params: VoiceScenarioParams): Promise<TutorTurnResponse> {
        const { lesson, learner } = params;

        if (!this.ai) {
            return this.buildFallbackGreeting(lesson, learner);
        }

        try {
            const systemInstruction = buildTutorSystemPrompt({
                learnerLevel: learner.level,
                topic: `${lesson.category}: ${lesson.title}`,
                nativeLanguage: learner.nativeLanguage,
                learnerName: learner.name,
                recurringMistakes: learner.recurringMistakes,
            });

            const objectiveHint = lesson.objectives?.length
                ? `Session objectives: ${lesson.objectives.join("; ")}.`
                : "";

            const phrasesHint = lesson.keyPhrases?.length
                ? `Key phrases the learner should practise: ${lesson.keyPhrases.slice(0, 3).join(", ")}.`
                : "";

            const userPrompt = [
                `You are starting the session. Open with this scenario starter line, then invite the learner to respond:`,
                `"${lesson.promptStarter}"`,
                objectiveHint,
                phrasesHint,
                `Respond only with the JSON structure specified. Set 'feedback' to [] and 'score' to null — this is an opening, not an evaluation turn.`,
            ]
                .filter(Boolean)
                .join("\n");

            const response = await this.ai.models.generateContent({
                model: this.modelName,
                contents: [{ role: "user", parts: [{ text: userPrompt }] }],
                config: {
                    systemInstruction,
                    responseMimeType: "application/json",
                    temperature: 0.5,
                },
            });

            const rawText = response.text || "{}";
            const parsed = JSON.parse(rawText);
            const validated = TutorTurnResponseSchema.safeParse(parsed);
            if (validated.success) {
                return validated.data;
            }

            console.warn("[VoiceScenarioService] Opening greeting validation failed, using fallback:", validated.error);
        } catch (error) {
            console.warn("[VoiceScenarioService] Gemini API error for opening greeting:", error);
        }

        return this.buildFallbackGreeting(lesson, learner);
    }

    // ─── Audio Turn Processing ───────────────────────────────────────────────

    /**
     * Processes a base64-encoded audio turn through Gemini multimodal.
     *
     * When GEMINI_API_KEY is set Gemini performs built-in transcription +
     * pedagogical evaluation in one round-trip (no separate STT step needed
     * for MVP). Falls back to a text-mode heuristic response when no key is
     * configured or the API call fails.
     */
    async processAudioTurn(params: AudioTurnParams): Promise<TutorTurnResponse & { transcript?: string }> {
        const { audioBase64, mimeType, learner, scenario, messageHistory = [] } = params;

        if (!this.ai) {
            return {
                ...this.buildFallbackAudioResponse(scenario),
                transcript: undefined,
            };
        }

        try {
            const systemInstruction = buildTutorSystemPrompt({
                learnerLevel: learner.level,
                topic: scenario,
                nativeLanguage: learner.nativeLanguage,
                learnerName: learner.name,
                recurringMistakes: learner.recurringMistakes,
            });

            const historyContents = messageHistory.map((m) => ({
                role: m.role,
                parts: [{ text: m.content }],
            }));

            // The final user turn includes the audio blob
            const userTurnParts = [
                {
                    inlineData: {
                        mimeType,
                        data: audioBase64,
                    },
                },
                {
                    text: "Please transcribe what the learner said and then produce your pedagogical evaluation and reply as specified JSON.",
                },
            ];

            const response = await this.ai.models.generateContent({
                model: this.modelName,
                contents: [
                    ...historyContents,
                    { role: "user", parts: userTurnParts },
                ],
                config: {
                    systemInstruction,
                    responseMimeType: "application/json",
                    temperature: 0.6,
                },
            });

            const rawText = response.text || "{}";
            const parsed = JSON.parse(rawText);

            // The model may include a 'transcript' field even though our schema
            // doesn't require it — extract it before schema validation.
            const transcript: string | undefined =
                typeof parsed?.transcript === "string" ? parsed.transcript : undefined;

            const validated = TutorTurnResponseSchema.safeParse(parsed);
            if (validated.success) {
                return { ...validated.data, transcript };
            }

            console.warn("[VoiceScenarioService] Audio turn schema validation failed:", validated.error);
        } catch (error) {
            console.warn("[VoiceScenarioService] Gemini audio API error:", error);
        }

        return { ...this.buildFallbackAudioResponse(scenario), transcript: undefined };
    }

    // ─── Private fallbacks ───────────────────────────────────────────────────

    private buildFallbackGreeting(lesson: LessonContext, learner: LearnerContext): TutorTurnResponse {
        const name = learner.name ? `, ${learner.name}` : "";
        return {
            reply: `${lesson.promptStarter}`,
            feedback: [],
            score: undefined,
            encouragement: `Welcome${name}! Take your time — there are no wrong answers here.`,
            suggestedFollowUpQuestion: "Ready to begin? Just start talking when you feel comfortable!",
        };
    }

    private buildFallbackAudioResponse(scenario: string): TutorTurnResponse {
        return {
            reply: `I heard your response about ${scenario}. That was a great attempt! Let's keep practising together.`,
            feedback: [],
            score: 80,
            encouragement: "Every spoken word is a step forward — keep it up!",
            suggestedFollowUpQuestion: "Can you try saying that again, but a bit more slowly and clearly?",
        };
    }
}

