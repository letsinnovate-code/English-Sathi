import type { GoogleGenAI } from "@google/genai";
import type { ProficiencyLevel } from "@english-sathi/shared-types";
import {
    parseRawJsonObject,
    TutorTurnResponseSchema,
    type TutorTurnResponse,
} from "../schemas/tutor-response.schema";
import { buildTutorSystemPrompt } from "../prompts/tutor.prompt";
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
 * 1. Generate a lesson-aware opening greeting (Sathi as the scenario participant).
 * 2. Process native audio turns via Gemini multimodal with strict clarity checks
 *    (asks learner to repeat cleanly instead of guessing unclear/inaudible audio).
 */
export class VoiceScenarioService {
    private ai: GoogleGenAI | null = null;
    private modelChain: string[];

    constructor(apiKey?: string, modelName = DEFAULT_GEMINI_MODEL) {
        this.modelChain = resolveModelChain(modelName);
        this.ai = createGeminiClient(apiKey);
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

            const { text: rawText } = await generateWithModelFallback(this.ai, this.modelChain, {
                contents: [{ role: "user", parts: [{ text: userPrompt }] }],
                systemInstruction,
                temperature: 0.4,
            });

            const parsed = parseRawJsonObject(rawText);
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
     * Tuned for high-accuracy Indian English listening and strict anti-guessing:
     * if audio is muffled, quiet, cut off, or noisy, Gemini returns `audioClear: false`
     * and asks the learner to repeat instead of fabricating words or advancing the topic.
     */
    async processAudioTurn(params: AudioTurnParams): Promise<AudioTurnResult> {
        const { audioBase64, mimeType, learner, scenario, messageHistory = [] } = params;

        if (!this.ai) {
            return {
                ...this.buildUnclearAudioResponse(scenario, messageHistory),
                transcript: undefined,
                usedFallback: true,
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

            const historyContents = buildNormalizedTextContents(
                messageHistory.map((m) => ({
                    role: m.role,
                    text: m.content,
                })),
                scenario,
            );
            // If history ended on a "user" message before our new audio user turn,
            // append a neutral separator so roles still alternate cleanly.
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
                `   - Set "feedback": [] and "score": null`,
                `   - In "reply", honestly tell the student their voice was not clear enough (say whether it sounded too quiet, noisy, or cut off) and politely ask them to repeat that response clearly — do NOT praise what wasn't heard and do NOT move on to a new question/topic.`,
                `   - In "suggestedFollowUpQuestion", gently ask them to try saying it again clearly.`,
                `5. If the audio IS clearly audible:`,
                `   - Set "audioClear": true`,
                `   - Set "transcript" to the exact verbatim words the learner spoke (preserve grammatical slips accurately so you can correct them).`,
                `   - Provide your concise reply, accurate feedback on what they actually said, score, encouragement, and ONE relevant suggestedFollowUpQuestion.`,
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

            const validated = TutorTurnResponseSchema.safeParse(parsed);
            if (validated.success) {
                const rawTranscript =
                    typeof parsed?.["transcript"] === "string" ? parsed["transcript"].trim() : "";

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

            console.warn("[VoiceScenarioService] Audio turn schema validation failed:", validated.error);
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
            score: undefined,
            encouragement: "No worries — clear speech matters more than speed. Take a moment and try again!",
            suggestedFollowUpQuestion: followUps[turnCount % followUps.length],
        };
    }
}

