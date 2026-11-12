import type { GoogleGenAI } from "@google/genai";
import type {
    ConversationMessage,
    ProficiencyLevel,
    SpeakingSpeed,
    TutorPersonaId,
} from "@english-sathi/shared-types";
import {
    parseRawJsonObject,
    type ContextualVocabularyItem,
    type TutorFeedbackItem,
    type TutorTurnResponse,
} from "../schemas/tutor-response.schema";
import {
    buildTutorSystemPrompt,
    type PromptScenarioSpec,
    type TutorPromptOptions,
} from "../prompts/tutor.prompt";
import { getTutorPersona, resolvePersonaForScenario } from "../personas/tutor-personas";
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

export interface GenerateTurnParams {
    userMessage: string;
    learnerLevel: ProficiencyLevel;
    topic: string;
    history?: ConversationMessage[];
    nativeLanguage?: string;
    learnerName?: string;
    recurringMistakes?: string[];
    personaId?: TutorPersonaId | null;
    speakingSpeed?: SpeakingSpeed;
    scenarioSpec?: PromptScenarioSpec;
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

const LEVEL_VOCAB_BANK: Record<"beginner" | "intermediate" | "advanced", ContextualVocabularyItem[]> = {
    beginner: [
        {
            word: "polite",
            partOfSpeech: "adjective",
            meaning: "Speaking kindly and respectfully to others.",
            hindiMeaning: "विनम्र / तमीज़ से बात करना",
            example: "Saying 'Could I please have' is a polite way to order food.",
        },
        {
            word: "usually",
            partOfSpeech: "adverb",
            meaning: "What happens most of the time in your normal routine.",
            hindiMeaning: "आमतौर पर / ज़्यादातर",
            example: "I usually wake up at seven in the morning.",
        },
    ],
    intermediate: [
        {
            word: "follow up",
            partOfSpeech: "phrasal verb",
            meaning: "Check again or continue after an earlier talk or message.",
            hindiMeaning: "दोबारा जानकारी लेना / आगे बात बढ़ाना",
            example: "Let me follow up with the team before confirming tomorrow's plan.",
        },
        {
            word: "perspective",
            partOfSpeech: "noun",
            meaning: "Your personal point of view or way of thinking about something.",
            hindiMeaning: "नज़रिया / दृष्टिकोण",
            example: "Thank you for sharing your perspective during today's discussion.",
        },
    ],
    advanced: [
        {
            word: "articulate",
            partOfSpeech: "verb / adjective",
            meaning: "Express complex ideas clearly and persuasively.",
            example: "She managed to articulate the project trade-offs concisely.",
        },
        {
            word: "trade-off",
            partOfSpeech: "noun",
            meaning: "A balanced compromise where gaining one benefit requires accepting another cost.",
            example: "Reducing scope early was a deliberate trade-off to protect our launch date.",
        },
    ],
};

export class EnglishSathiAI {
    private ai: GoogleGenAI | null = null;
    private modelChain: string[];

    constructor(apiKey?: string, modelName = DEFAULT_GEMINI_MODEL) {
        this.modelChain = resolveModelChain(modelName);
        this.ai = createGeminiClient(apiKey);
    }

    /**
     * Generates a conversational tutor response with validated pedagogy, feedback, and vocabulary.
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
                personaId: params.personaId,
                speakingSpeed: params.speakingSpeed,
                scenarioSpec: params.scenarioSpec,
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
            const validated = validateAndNormalizeTutorResponse(parsedJson, {
                learnerLevel: params.learnerLevel,
                nativeLanguage: params.nativeLanguage,
            });
            if (validated.ok) {
                return validated.data;
            }

            console.warn("LLM response failed validation. Falling back gracefully:", validated.reasons);
            return this.generateFallbackResponse(params);
        } catch (error) {
            console.warn("Gemini API call failed, falling back to heuristic engine:", error);
            return this.generateFallbackResponse(params);
        }
    }

    /**
     * Resilient, rule-based pedagogical fallback engine for offline dev and failure recovery.
     * Adapts tone, Hindi scaffolding, corrections, and vocabulary to learner level, persona, and history.
     */
    generateFallbackResponse(params: GenerateTurnParams): TutorTurnResponse {
        const raw = params.userMessage.trim();
        const text = raw.toLowerCase();
        const feedback: TutorFeedbackItem[] = [];
        const allowHindi = shouldAllowHindiScaffolding(params.learnerLevel, params.nativeLanguage);

        // Heuristic 1: "I am agree" -> Indian English interference
        if (text.includes("i am agree") || text.includes("i'm agree")) {
            feedback.push({
                category: "grammar",
                original: raw.match(/\b(i am agree|i'm agree)\b/i)?.[0] ?? "I am agree",
                suggestion: "I agree",
                explanation: 'In English, "agree" is a verb, so we say "I agree" instead of "I am agree".',
                hindiExplanation: allowHindi
                    ? 'English में "agree" एक verb है। "I am agree" गलत है, सही वाक्य "I agree" होगा।'
                    : undefined,
                example: "I agree with your suggestion about starting early.",
            });
        }

        // Heuristic 2: "Cousin brother / cousin sister"
        if (text.includes("cousin brother") || text.includes("cousin sister")) {
            const original = text.includes("cousin brother") ? "cousin brother" : "cousin sister";
            feedback.push({
                category: "natural_expression",
                original,
                suggestion: "cousin",
                explanation: 'In standard English, just say "cousin" without adding brother or sister.',
                hindiExplanation: allowHindi
                    ? 'English में "cousin brother" या "cousin sister" नहीं बोला जाता, केवल "cousin" बोलते हैं।'
                    : undefined,
                example: "I went to the wedding with my cousin last Sunday.",
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
                hindiExplanation: allowHindi
                    ? `He/She/It के साथ present tense में verb में -s या -es लगाया जाता है।`
                    : undefined,
                example: `${thirdPersonMatch[1][0].toUpperCase()}${thirdPersonMatch[1].slice(1)} ${correctVerb} to the office at 9 AM.`,
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
                hindiExplanation: allowHindi
                    ? `"${didPastMatch[1]}" के बाद हमेशा verb का first form ("${baseVerb}") आता है।`
                    : undefined,
                example: `I ${didPastMatch[1]} ${baseVerb} outside because it was raining.`,
            });
        }

        // Heuristic 5: Past marker + present "go" ("yesterday I go")
        if (/\b(yesterday|last week|last night|ago)\b/.test(text) && /\bi\s+go\b/.test(text)) {
            feedback.push({
                category: "grammar",
                original: "I go",
                suggestion: "I went",
                explanation: 'Because you mentioned the past ("yesterday" / "last week"), use the past form "went".',
                hindiExplanation: allowHindi
                    ? 'बीते हुए समय (yesterday / last week) के लिए "go" की जगह "went" का प्रयोग करें।'
                    : undefined,
                example: "Yesterday I went to the café with a friend.",
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
                hindiExplanation: allowHindi
                    ? 'अपना परिचय देते समय "Myself" की जगह "I am ..." या "My name is ..." बोलना सही होता है।'
                    : undefined,
                example: `Hello everyone, I am ${myselfMatch[1]} from Pune.`,
            });
        }
        const iFromMatch = raw.match(/\bI\s+from\s+([A-Za-z]+)\b/);
        if (iFromMatch) {
            feedback.push({
                category: "grammar",
                original: iFromMatch[0],
                suggestion: `I am from ${iFromMatch[1]}`,
                explanation: 'Remember to include the linking verb "am" after "I".',
                hindiExplanation: allowHindi
                    ? '"I" के बाद "am" लगाना ज़रूरी है — "I am from ..." बोलें।'
                    : undefined,
                example: `I am from ${iFromMatch[1]} and I moved here recently.`,
            });
        }

        // Heuristic 7: Redundant prepositions & Indian-English office phrases
        if (text.includes("revert back")) {
            feedback.push({
                category: "natural_expression",
                original: "revert back",
                suggestion: "reply / get back to you",
                explanation: '"Revert" already means return; in natural English say "reply" or "get back to you".',
                hindiExplanation: allowHindi
                    ? '"Revert back" दोहराव है; इसकी जगह "reply" या "get back to you" बोलें।'
                    : undefined,
                example: "I will get back to you with the final schedule by 5 PM.",
            });
        }
        if (text.includes("more better")) {
            feedback.push({
                category: "grammar",
                original: "more better",
                suggestion: "much better",
                explanation: '"Better" is already comparative, so pair it with "much", not "more".',
                hindiExplanation: allowHindi
                    ? '"Better" पहले से comparative है, इसलिए "more better" नहीं बल्कि "much better" या "better" बोलें।'
                    : undefined,
                example: "Practicing out loud made my confidence much better.",
            });
        }
        const discussMatch = raw.match(/\bdiscuss(?:ed|ing)?\s+about\b/i);
        if (discussMatch) {
            const cleaned = discussMatch[0].replace(/\s+about$/i, "");
            feedback.push({
                category: "grammar",
                original: discussMatch[0],
                suggestion: cleaned,
                explanation: '"Discuss" does not take "about" after it — go straight to the object.',
                hindiExplanation: allowHindi
                    ? '"Discuss" के बाद "about" नहीं लगता; सीधे विषय का नाम बोलें (जैसे "discuss the plan")।'
                    : undefined,
                example: "Let's discuss the project timeline after lunch.",
            });
        }
        if (/\breturn back\b/i.test(text)) {
            feedback.push({
                category: "natural_expression",
                original: "return back",
                suggestion: "return",
                explanation: '"Return" already means come or give back, so adding "back" is redundant.',
                hindiExplanation: allowHindi
                    ? '"Return" का मतलब ही वापस करना/आना होता है, इसलिए "back" साथ में न लगाएँ।'
                    : undefined,
                example: "I would like to return this jacket because the size runs small.",
            });
        }
        if (/\bwhat is your good name\b/i.test(text)) {
            feedback.push({
                category: "natural_expression",
                original: "what is your good name",
                suggestion: "may I know your name",
                explanation: 'In international English, ask "May I know your name?" or "What is your name?" instead of "good name".',
                hindiExplanation: allowHindi
                    ? 'अंग्रेज़ी में "good name" की जगह सीधे "May I know your name?" या "What is your name?" पूछते हैं।'
                    : undefined,
                example: "Nice to meet you! May I know your name?",
            });
        }
        if (/\bpass(?:ed)? out from\b/i.test(text)) {
            feedback.push({
                category: "vocabulary",
                original: raw.match(/\bpass(?:ed)? out from\b/i)?.[0] ?? "passed out from",
                suggestion: "graduated from",
                explanation: '"Pass out" means faint in international English; use "graduated from" for finishing college.',
                hindiExplanation: allowHindi
                    ? 'कॉलेज पूरा करने के लिए "passed out" की जगह "graduated from" बोलना सही होता है।'
                    : undefined,
                example: "I graduated from university in 2023.",
            });
        }

        const history = params.history ?? [];
        const userTurnIndex = history.filter((m) => m.sender === "user").length;
        const previousAiTexts = history
            .filter((m) => m.sender === "ai")
            .map((m) => m.content.toLowerCase());

        const catalogMatch = findScenarioContext(params.topic);
        const persona = resolvePersonaForScenario({
            personaId: params.personaId ?? catalogMatch?.recommendedPersonaId,
            category: catalogMatch?.category,
            topic: params.topic,
            level: params.learnerLevel,
        });

        const reply = this.buildContextualFallbackReply(
            raw,
            text,
            params.topic,
            params.learnerLevel,
            persona.id,
            userTurnIndex,
            feedback,
        );
        const suggestedFollowUpQuestion = this.pickNextFollowUpQuestion(
            params.topic,
            text,
            params.learnerLevel,
            userTurnIndex,
            previousAiTexts,
        );
        const encouragement = `${getTutorPersona(persona.id).fallbackEncouragementPrefix} Keep going!`;

        const contextualVocabulary = this.pickFallbackVocabulary(
            params.topic,
            params.learnerLevel,
            params.scenarioSpec?.vocabulary,
            catalogMatch?.targetVocabulary,
            userTurnIndex,
            allowHindi,
        );

        const baseScore = raw.split(/\s+/).length < 3 ? 78 : 92;
        const score = feedback.length === 0 ? baseScore : Math.max(68, baseScore - feedback.length * 8);

        const candidate: TutorTurnResponse = {
            reply,
            feedback,
            contextualVocabulary,
            score,
            encouragement,
            suggestedFollowUpQuestion,
        };

        const normalized = validateAndNormalizeTutorResponse(candidate, {
            learnerLevel: params.learnerLevel,
            nativeLanguage: params.nativeLanguage,
        });
        return normalized.ok ? normalized.data : candidate;
    }

    private pickFallbackVocabulary(
        _topic: string,
        level: ProficiencyLevel,
        specVocab?: PromptScenarioSpec["vocabulary"],
        catalogVocab?: ContextualVocabularyItem[],
        turnIndex = 0,
        allowHindi = true,
    ): ContextualVocabularyItem[] {
        const scenarioItems: ContextualVocabularyItem[] = [];

        if (catalogVocab?.length) {
            scenarioItems.push(...catalogVocab);
        } else if (specVocab?.length) {
            for (const v of specVocab) {
                scenarioItems.push({
                    word: v.word,
                    meaning: v.meaning,
                    hindiMeaning: allowHindi ? v.hindiMeaning : undefined,
                    example: v.example ?? `Try using "${v.word}" naturally in your next reply.`,
                });
            }
        }

        if (scenarioItems.length > 0) {
            const item = scenarioItems[turnIndex % scenarioItems.length];
            return [{
                ...item,
                hindiMeaning: allowHindi ? item.hindiMeaning : undefined,
            }];
        }

        const bucket =
            level === "C1" || level === "C2"
                ? LEVEL_VOCAB_BANK.advanced
                : level === "B1" || level === "B2"
                    ? LEVEL_VOCAB_BANK.intermediate
                    : LEVEL_VOCAB_BANK.beginner;

        const chosen = bucket[turnIndex % bucket.length];
        return [{
            ...chosen,
            hindiMeaning: allowHindi ? chosen.hindiMeaning : undefined,
        }];
    }

    private buildContextualFallbackReply(
        raw: string,
        lower: string,
        topic: string,
        level: ProficiencyLevel,
        personaId: TutorPersonaId,
        turnIndex: number,
        feedback: TutorFeedbackItem[],
    ): string {
        const explicitNameMatch = raw.match(/(?:my name is|this is|myself)\s+([A-Z]?[a-z]{2,20})\b/i);
        const capIAmMatch = raw.match(/(?:I am|I'm)\s+([A-Z][a-z]{2,20})\b/);
        const cityMatch = raw.match(/(?:i am from|i'm from|i live in|from)\s+([A-Z]?[a-z]{2,25})\b/i);
        const stopWords = new Set([
            "from", "good", "fine", "happy", "here", "ready", "student", "working", "sorry",
            "agree", "going", "trying", "learning", "talking", "excited", "sure", "late",
            "busy", "tired", "very", "really", "also", "not", "just", "able",
        ]);
        const rawNameCandidate = explicitNameMatch?.[1] ?? capIAmMatch?.[1] ?? null;
        const detectedName =
            rawNameCandidate && !stopWords.has(rawNameCandidate.toLowerCase()) ? rawNameCandidate : null;
        const detectedCity =
            cityMatch && !stopWords.has(cityMatch[1].toLowerCase()) ? cityMatch[1] : null;

        if (detectedName && detectedCity && level !== "C1" && level !== "C2") {
            return `Nice to meet you, ${detectedName}! ${detectedCity} sounds wonderful, and you introduced yourself clearly.`;
        }
        if (detectedName && !lower.includes("student") && !lower.includes("engineer") && level !== "C1" && level !== "C2") {
            return `Nice to meet you, ${detectedName}! Thank you for introducing yourself warmly.`;
        }
        if (/\b(coffee|tea|chai|latte|cappuccino|sandwich|cake|order|menu|bill)\b/.test(lower)) {
            return `Got it, I have your order right here! Polite requests like yours make café conversations effortless.`;
        }
        if (/\b(shirt|size|exchange|refund|receipt|price|discount|buy|shop)\b/.test(lower)) {
            return `Sure, let me help you with that item right away! You stated your request very clearly.`;
        }
        if (/\b(station|airport|hotel|metro|bus|direction|landmark|map)\b/.test(lower)) {
            return `Thanks for explaining where you want to go! Naming a clear landmark makes asking for directions easy.`;
        }
        if (/\b(appointment|reschedule|tomorrow|morning|afternoon|slot|call|doctor)\b/.test(lower)) {
            return `Thank you for sharing the details clearly over the call! Let's confirm the best slot for you.`;
        }
        if (/\b(work|job|engineer|developer|teacher|student|college|school|company|office|project|team)\b/.test(lower)) {
            if (personaId === "vikram_interviewer" || level === "C1" || level === "C2") {
                return `That is a well-structured professional example! Framing your contribution with real context strengthens your executive presence.`;
            }
            return `That sounds really interesting! Describing your work or studies is a key skill for everyday English conversations.`;
        }
        if (/\b(hello|hi|hey|good morning|good afternoon|good evening)\b/.test(lower) && raw.split(/\s+/).length <= 5) {
            return `Hello! It is great to hear from you. Let's dive into "${topic}" together.`;
        }
        if (feedback.length > 0) {
            if (level === "A1" || level === "A2" || level === "UNKNOWN") {
                return `Good try saying "${raw}"! I understood you well — take a look at the quick tip below.`;
            }
            return `Thanks for sharing "${raw}"! Your meaning came across clearly — see the suggested polish below.`;
        }

        if (level === "C1" || level === "C2") {
            const advancedReplies = [
                `That is a thoughtful perspective on "${topic}". Your reasoning flows logically and keeps the listener engaged.`,
                `Strong articulation — you balanced nuance and clarity effectively there.`,
            ];
            return advancedReplies[turnIndex % advancedReplies.length];
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
        level: ProficiencyLevel,
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
                "Tell me one interesting thing about your hometown?",
            ];
        } else if (lowerTopic.includes("café") || lowerTopic.includes("cafe") || lowerTopic.includes("order")) {
            pool = [
                "Would you like anything to eat with your drink, or any custom preference like less sugar?",
                "How would you politely ask the server for the bill or Wi-Fi password?",
                "If your favourite item is unavailable, what else would you ask the barista to recommend?",
                "Would you prefer to have it here or take it away?",
            ];
        } else if (lowerTopic.includes("shop") || lowerTopic.includes("exchange")) {
            pool = [
                "What size or color would you like to try instead?",
                "Could you explain politely why you want to exchange the item?",
                "Would you like to check the price or ask if there is a discount?",
            ];
        } else if (lowerTopic.includes("travel") || lowerTopic.includes("direction")) {
            pool = [
                "How would you ask whether it is faster by metro or on foot?",
                "Could you double-check the nearest landmark before turning?",
                "What would you ask at the hotel check-in desk next?",
            ];
        } else if (lowerTopic.includes("phone") || lowerTopic.includes("reschedul") || lowerTopic.includes("call")) {
            pool = [
                "Which day and time next week works best for your new appointment?",
                "How would you ask the receptionist to repeat your booking confirmation?",
                "Could you leave a polite closing message before hanging up?",
            ];
        } else if (lowerTopic.includes("negotiat") || lowerTopic.includes("pitch") || level === "C1" || level === "C2") {
            pool = [
                "How would you justify that pricing trade-off while acknowledging the client's budget constraint?",
                "What milestone-based safeguard could you propose to reduce their perceived risk?",
                "How would you steer the conversation back toward long-term ROI?",
            ];
        } else if (lowerTopic.includes("interview") || lowerTopic.includes("meeting") || lowerTopic.includes("work")) {
            pool = [
                "Can you describe one project or responsibility you are proud of?",
                "What is your biggest strength when working with a team?",
                "Why are you interested in growing in this role?",
                "How do you handle a tight deadline or blocker at work?",
            ];
        } else if (level === "A1" || level === "A2" || level === "UNKNOWN") {
            pool = [
                "What did you enjoy most about that?",
                "Can you tell me one more simple sentence about your day?",
                "Who did you share that experience with?",
            ];
        } else {
            pool = [
                "What happened next, or how did that feel for you?",
                "Could you share a real example from your week related to this?",
                "What part of this topic do you enjoy talking about the most?",
                "How would you explain this to a friend in two more sentences?",
            ];
        }

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
