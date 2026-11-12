import type { GoogleGenAI } from "@google/genai";
import type { ProficiencyLevel, ConversationMessage } from "@english-sathi/shared-types";
import {
    parseRawJsonObject,
    TutorTurnResponseSchema,
    type TutorTurnResponse,
    type TutorFeedbackItem,
} from "../schemas/tutor-response.schema";
import { buildTutorSystemPrompt, type TutorPromptOptions } from "../prompts/tutor.prompt";
import {
    buildNormalizedTextContents,
    createGeminiClient,
    DEFAULT_GEMINI_MODEL,
    generateWithModelFallback,
    resolveModelChain,
} from "../utils/gemini-runner";

export interface GenerateTurnParams {
    userMessage: string;
    learnerLevel: ProficiencyLevel;
    topic: string;
    history?: ConversationMessage[];
    nativeLanguage?: string;
    learnerName?: string;
    recurringMistakes?: string[];
}

const IRREGULAR_PAST_TO_BASE: Record<string, string> = {
    went: "go",
    ate: "eat",
    bought: "buy",
    came: "come",
    saw: "see",
    did: "do",
    told: "tell",
    gave: "give",
    made: "make",
    took: "take",
};

const ENCOURAGEMENTS = [
    "Great job expressing yourself in English!",
    "Nice effort — every sentence makes you more fluent.",
    "You are building strong momentum in this conversation!",
    "Well spoken! Your confidence is coming through clearly.",
];

export class EnglishSathiAI {
    private ai: GoogleGenAI | null = null;
    private modelChain: string[];

    constructor(apiKey?: string, modelName = DEFAULT_GEMINI_MODEL) {
        this.modelChain = resolveModelChain(modelName);
        this.ai = createGeminiClient(apiKey);
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

            const contents = buildNormalizedTextContents(
                (params.history || []).map((m) => ({
                    role: m.sender === "user" ? ("user" as const) : ("model" as const),
                    text: m.content,
                })),
                params.topic,
                params.userMessage,
            );

            const { text: rawText } = await generateWithModelFallback(this.ai, this.modelChain, {
                contents,
                systemInstruction,
                temperature: 0.4,
            });

            const parsedJson = parseRawJsonObject(rawText);
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
     * Uses learner utterance + conversation history so turns stay responsive and non-repetitive.
     */
    generateFallbackResponse(params: GenerateTurnParams): TutorTurnResponse {
        const raw = params.userMessage.trim();
        const text = raw.toLowerCase();
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
        const thirdPersonMatch = text.match(/\b(he|she|it)\s+(go|want|like|know)\b/);
        if (thirdPersonMatch) {
            const verb = thirdPersonMatch[2];
            const correctVerb = verb === "go" ? "goes" : `${verb}s`;
            feedback.push({
                category: "grammar",
                original: thirdPersonMatch[0],
                suggestion: `${thirdPersonMatch[1]} ${correctVerb}`,
                explanation: `In the simple present tense with he/she/it, add -s or -es to the verb.`,
                hindiExplanation: `He/She/It के साथ present tense में verb में -s या -es लगाया जाता है।`,
            });
        }

        // Heuristic 4: Double past with did/didn't ("didn't went", "didn't ate")
        const didPastMatch = text.match(/\b(didn't|did not)\s+(went|ate|bought|came|saw|did|told|gave|made|took)\b/);
        if (didPastMatch) {
            const baseVerb = IRREGULAR_PAST_TO_BASE[didPastMatch[2]] ?? didPastMatch[2];
            feedback.push({
                category: "grammar",
                original: didPastMatch[0],
                suggestion: `${didPastMatch[1]} ${baseVerb}`,
                explanation: `After "${didPastMatch[1]}", always use the base form of the verb ("${baseVerb}"), not the past tense.`,
                hindiExplanation: `"${didPastMatch[1]}" के बाद हमेशा verb का first form ("${baseVerb}") आता है।`,
            });
        }

        // Heuristic 5: Past marker + present "go" ("yesterday I go")
        if (/\b(yesterday|last week|last night|ago)\b/.test(text) && /\bi\s+go\b/.test(text)) {
            feedback.push({
                category: "grammar",
                original: "I go",
                suggestion: "I went",
                explanation: 'Because you mentioned the past ("yesterday" / "last week"), use the past form "went".',
                hindiExplanation: 'बीते हुए समय (yesterday / last week) के लिए "go" की जगह "went" का प्रयोग करें।',
            });
        }

        // Heuristic 6: "Myself <Name>" / "I from <City>"
        const myselfMatch = raw.match(/\bmyself\s+([A-Za-z]+)/i);
        if (myselfMatch) {
            feedback.push({
                category: "natural_expression",
                original: myselfMatch[0],
                suggestion: `I am ${myselfMatch[1]}`,
                explanation: 'Avoid introducing yourself with "Myself ...". Use "I am ..." or "My name is ...".',
                hindiExplanation: 'अपना परिचय देते समय "Myself" की जगह "I am ..." या "My name is ..." बोलना सही होता है।',
            });
        }
        const iFromMatch = raw.match(/\bI\s+from\s+([A-Za-z]+)\b/);
        if (iFromMatch) {
            feedback.push({
                category: "grammar",
                original: iFromMatch[0],
                suggestion: `I am from ${iFromMatch[1]}`,
                explanation: 'Remember to include the linking verb "am" after "I".',
                hindiExplanation: '"I" के बाद "am" लगाना ज़रूरी है — "I am from ..." बोलें।',
            });
        }

        // Heuristic 7: "revert back" / "more better"
        if (text.includes("revert back")) {
            feedback.push({
                category: "natural_expression",
                original: "revert back",
                suggestion: "reply / get back to you",
                explanation: '"Revert" already means return; in natural English say "reply" or "get back to you".',
                hindiExplanation: '"Revert back" दोहराव है; इसकी जगह "reply" या "get back to you" बोलें।',
            });
        }
        if (text.includes("more better")) {
            feedback.push({
                category: "grammar",
                original: "more better",
                suggestion: "much better",
                explanation: '"Better" is already comparative, so pair it with "much", not "more".',
                hindiExplanation: '"Better" पहले से comparative है, इसलिए "more better" नहीं बल्कि "much better" या "better" बोलें।',
            });
        }

        const history = params.history ?? [];
        const userTurnIndex = history.filter((m) => m.sender === "user").length;
        const previousAiTexts = history
            .filter((m) => m.sender === "ai")
            .map((m) => m.content.toLowerCase());

        const reply = this.buildContextualFallbackReply(raw, text, params.topic, userTurnIndex, feedback);
        const suggestedFollowUpQuestion = this.pickNextFollowUpQuestion(
            params.topic,
            text,
            userTurnIndex,
            previousAiTexts,
        );
        const encouragement = ENCOURAGEMENTS[userTurnIndex % ENCOURAGEMENTS.length];

        const baseScore = raw.split(/\s+/).length < 3 ? 78 : 92;
        const score = feedback.length === 0 ? baseScore : Math.max(68, baseScore - feedback.length * 8);

        return {
            reply,
            feedback,
            score,
            encouragement,
            suggestedFollowUpQuestion,
        };
    }

    private buildContextualFallbackReply(
        raw: string,
        lower: string,
        topic: string,
        turnIndex: number,
        feedback: TutorFeedbackItem[],
    ): string {
        const nameMatch = raw.match(/(?:my name is|i am|i'm|this is)\s+([A-Z]?[a-z]{2,20})\b/i);
        const cityMatch = raw.match(/(?:i am from|i'm from|i live in|from)\s+([A-Z]?[a-z]{2,25})\b/i);
        const stopWords = new Set(["from", "good", "fine", "happy", "here", "ready", "student", "working", "sorry"]);
        const detectedName =
            nameMatch && !stopWords.has(nameMatch[1].toLowerCase()) ? nameMatch[1] : null;
        const detectedCity =
            cityMatch && !stopWords.has(cityMatch[1].toLowerCase()) ? cityMatch[1] : null;

        if (detectedName && detectedCity) {
            return `Nice to meet you, ${detectedName}! ${detectedCity} is great to hear about. You introduced yourself very clearly.`;
        }
        if (detectedName && !lower.includes("student") && !lower.includes("engineer")) {
            return `Nice to meet you, ${detectedName}! Thank you for introducing yourself so warmly.`;
        }
        if (/\b(coffee|tea|chai|latte|cappuccino|sandwich|cake|order|menu|bill)\b/.test(lower)) {
            return `Great, I've noted your order preference! Speaking politely like this at a café makes a great impression.`;
        }
        if (/\b(work|job|engineer|developer|teacher|student|college|school|company|office)\b/.test(lower)) {
            return `That sounds really interesting! Describing your work or studies is a key skill for everyday English conversations.`;
        }
        if (/\b(hello|hi|hey|good morning|good afternoon|good evening)\b/.test(lower) && raw.split(/\s+/).length <= 5) {
            return `Hello! It's great to hear your voice. Let's jump right into "${topic}" together.`;
        }
        if (feedback.length > 0) {
            return `Thanks for sharing "${raw}"! I understood your point clearly — check the quick tip below to polish the phrasing.`;
        }

        const acknowledgements = [
            `Got it — "${raw}" makes total sense for ${topic}.`,
            `That's a helpful detail! You explained your point naturally.`,
            `I appreciate you sharing that — your sentence structure was easy to follow.`,
            `Great continuation! You're staying right on topic with "${topic}".`,
        ];
        return acknowledgements[turnIndex % acknowledgements.length];
    }

    private pickNextFollowUpQuestion(
        topic: string,
        lower: string,
        turnIndex: number,
        previousAiTexts: string[],
    ): string {
        const lowerTopic = topic.toLowerCase();
        let pool: string[];

        if (lowerTopic.includes("introduc") || lowerTopic.includes("yourself")) {
            pool = [
                "What do you currently do for work or study?",
                "What hobbies or activities do you enjoy in your free time?",
                "What is one goal you want to achieve with your English this year?",
                "Tell me a little about your hometown or daily routine!",
            ];
        } else if (lowerTopic.includes("café") || lowerTopic.includes("cafe") || lowerTopic.includes("order")) {
            pool = [
                "Would you like anything to eat with your drink, or any custom preference like less sugar?",
                "How would you politely ask the server for the bill or Wi-Fi password?",
                "If your favourite item is unavailable, what else would you ask the barista to recommend?",
                "Would you prefer to have it here or take it away?",
            ];
        } else if (lowerTopic.includes("interview") || lowerTopic.includes("work")) {
            pool = [
                "Can you describe one project or responsibility you are proud of?",
                "What is your biggest strength when working with a team?",
                "Why are you interested in growing in this role?",
                "How do you handle a tight deadline or challenge at work?",
            ];
        } else {
            pool = [
                "What happened next, or how did that feel for you?",
                "Could you share a real example from your week related to this?",
                "What part of this topic do you enjoy talking about the most?",
                "How would you explain this to a friend in two more sentences?",
            ];
        }

        // Avoid repeating a follow-up the user already answered or already got
        if (lower.includes("work") || lower.includes("engineer") || lower.includes("student")) {
            pool = pool.filter((q) => !q.toLowerCase().includes("work or study"));
        }
        const unseen = pool.filter(
            (q) => !previousAiTexts.some((prev) => prev.includes(q.toLowerCase().slice(0, 20))),
        );
        const candidates = unseen.length > 0 ? unseen : pool;
        return candidates[turnIndex % candidates.length] ?? "What would you like to add next?";
    }
}