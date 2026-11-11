import { GoogleGenAI } from "@google/genai";
import type { ProficiencyLevel, ConversationMessage } from "@english-sathi/shared-types";
import {
    TutorTurnResponseSchema,
    type TutorTurnResponse,
    type TutorFeedbackItem,
} from "../schemas/tutor-response.schema";
import { buildTutorSystemPrompt, type TutorPromptOptions } from "../prompts/tutor.prompt";

export interface GenerateTurnParams {
    userMessage: string;
    learnerLevel: ProficiencyLevel;
    topic: string;
    history?: ConversationMessage[];
    nativeLanguage?: string;
    learnerName?: string;
    recurringMistakes?: string[];
}

export class EnglishSathiAI {
    private ai: GoogleGenAI | null = null;
    private modelName: string;

    constructor(apiKey?: string, modelName = "gemini-2.5-flash") {
        this.modelName = modelName;
        const key = apiKey || process.env.GEMINI_API_KEY;
        if (key && key !== "your-gemini-api-key" && key.trim().length > 0) {
            this.ai = new GoogleGenAI({ apiKey: key });
        }
    }

    /**
     * Generates a conversational tutor response with feedback and turn scores.
     */
    async generateTurnResponse(params: GenerateTurnParams): Promise<TutorTurnResponse> {
        // 1. If no API key configured, use the heuristic fallback engine
        if (!this.ai) {
            return this.generateFallbackResponse(params);
        }

        try {
            const promptOptions: TutorPromptOptions = {
                learnerLevel: params.learnerLevel,
                topic: params.topic,
                nativeLanguage: params.nativeLanguage,
                learnerName: params.learnerName,
                recurringMistakes: params.recurringMistakes,
            };

            const systemInstruction = buildTutorSystemPrompt(promptOptions);

            // Format previous conversation turns for Gemini
            const contents = [
                ...(params.history || []).map((m) => ({
                    role: m.sender === "user" ? ("user" as const) : ("model" as const),
                    parts: [{ text: m.content }],
                })),
                { role: "user" as const, parts: [{ text: params.userMessage }] },
            ];

            const response = await this.ai.models.generateContent({
                model: this.modelName,
                contents,
                config: {
                    systemInstruction,
                    responseMimeType: "application/json",
                    temperature: 0.6,
                },
            });

            const rawText = response.text || "{}";
            const parsedJson = JSON.parse(rawText);

            // Validate through Zod contract
            const validated = TutorTurnResponseSchema.safeParse(parsedJson);
            if (validated.success) {
                return validated.data;
            }

            console.warn("LLM response failed schema validation. Falling back gracefully:", validated.error);
            return this.generateFallbackResponse(params);
        } catch (error) {
            console.warn("Gemini API call failed, falling back to heuristic engine:", error);
            return this.generateFallbackResponse(params);
        }
    }

    /**
     * Resilient, rule-based pedagogical fallback engine for offline dev and failure recovery.
     */
    generateFallbackResponse(params: GenerateTurnParams): TutorTurnResponse {
        const text = params.userMessage.toLowerCase();
        const feedback: TutorFeedbackItem[] = [];

        // Heuristic 1: "I am agree" -> common Indian English interference
        if (text.includes("i am agree") || text.includes("i'm agree")) {
            feedback.push({
                category: "grammar",
                original: "I am agree",
                suggestion: "I agree",
                explanation: 'In English, "agree" is a verb, so we say "I agree" instead of "I am agree".',
                hindiExplanation: 'English में "agree" एक verb है। "I am agree" गलत है, सही वाक्य "I agree" होगा।',
            });
        }

        // Heuristic 2: "Cousin brother / cousin sister"
        if (text.includes("cousin brother") || text.includes("cousin sister")) {
            const original = text.includes("cousin brother") ? "cousin brother" : "cousin sister";
            feedback.push({
                category: "natural_expression",
                original,
                suggestion: "cousin",
                explanation: 'In standard English, just say "cousin" (or "male cousin" / "female cousin" if clarification is needed).',
                hindiExplanation: 'English में "cousin brother" या "cousin sister" नहीं बोला जाता, केवल "cousin" बोलते हैं।',
            });
        }

        // Heuristic 3: Third person singular present ("he go", "she want")
        if (/\b(he|she|it)\s+(go|want|like|know)\b/.test(text)) {
            const match = text.match(/\b(he|she|it)\s+(go|want|like|know)\b/);
            if (match) {
                const verb = match[2];
                const correctVerb = verb === "go" ? "goes" : `${verb}s`;
                feedback.push({
                    category: "grammar",
                    original: match[0],
                    suggestion: `${match[1]} ${correctVerb}`,
                    explanation: `In the simple present tense with he/she/it, add -s or -es to the verb.`,
                    hindiExplanation: `He/She/It के साथ present tense में verb में -s या -es लगाया जाता है।`,
                });
            }
        }

        // Calculate realistic score
        const score = feedback.length === 0 ? 92 : Math.max(70, 90 - feedback.length * 10);

        return {
            reply: `That is an interesting thought about ${params.topic}! Practicing conversations step by step is the fastest way to build confidence.`,
            feedback,
            score,
            encouragement: "Well done! Your effort to speak clearly is showing great progress.",
            suggestedFollowUpQuestion: `What else would you like to share about this?`,
        };
    }
}