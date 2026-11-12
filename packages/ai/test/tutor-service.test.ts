import { describe, it, expect } from "vitest";
import { EnglishSathiAI } from "../src/services/tutor.service";
import { TutorTurnResponseSchema } from "../src/schemas/tutor-response.schema";

describe("EnglishSathiAI Service", () => {
    it("should generate a schema-valid response in offline/fallback mode", async () => {
        // Initialized without an API key -> uses fallback engine
        const engine = new EnglishSathiAI();

        const response = await engine.generateTurnResponse({
            userMessage: "I like spending time with family and reading books.",
            learnerLevel: "A1",
            topic: "Hobbies & Daily Life",
        });

        // 1. Verify schema compliance
        const validation = TutorTurnResponseSchema.safeParse(response);
        expect(validation.success).toBe(true);

        // 2. Verify response content
        expect(response.reply).toBeDefined();
        expect(response.suggestedFollowUpQuestion).toBeDefined();
        expect(response.encouragement).toBeDefined();
        expect(response.score).toBeGreaterThanOrEqual(70);
    });

    it("should catch 'I am agree' and provide both English and Hindi feedback", async () => {
        const engine = new EnglishSathiAI();

        const response = await engine.generateTurnResponse({
            userMessage: "I am agree with your opinion on this topic.",
            learnerLevel: "A1",
            topic: "Daily Conversations",
            nativeLanguage: "hindi",
        });

        expect(response.feedback).toHaveLength(1);
        const item = response.feedback[0];
        expect(item.category).toBe("grammar");
        expect(item.original).toBe("I am agree");
        expect(item.suggestion).toBe("I agree");
        expect(item.hindiExplanation).toContain("agree");
    });

    it("should catch 'cousin sister' and classify it as natural_expression", async () => {
        const engine = new EnglishSathiAI();

        const response = await engine.generateTurnResponse({
            userMessage: "Yesterday I went to the market with my cousin sister.",
            learnerLevel: "A2",
            topic: "Shopping",
        });

        const naturalExpFeedback = response.feedback.find((f) => f.category === "natural_expression");
        expect(naturalExpFeedback).toBeDefined();
        expect(naturalExpFeedback?.suggestion).toBe("cousin");
    });

    it("should catch third-person singular present verb errors", async () => {
        const engine = new EnglishSathiAI();

        const response = await engine.generateTurnResponse({
            userMessage: "My brother he go to college every morning.",
            learnerLevel: "A1",
            topic: "Family",
        });

        const grammarFeedback = response.feedback.find((f) => f.original.includes("he go"));
        expect(grammarFeedback).toBeDefined();
        expect(grammarFeedback?.suggestion).toBe("he goes");
    });

    it("should vary replies and follow-up questions across multi-turn fallback history", async () => {
        const engine = new EnglishSathiAI();

        const turn1 = await engine.generateTurnResponse({
            userMessage: "Hi, my name is Aarav and I am from Jaipur.",
            learnerLevel: "A2",
            topic: "Introducing Yourself Confidently",
            history: [
                { id: "m1", sender: "ai", content: "Hello! Tell me your name.", timestamp: new Date().toISOString() },
            ],
        });

        const turn2 = await engine.generateTurnResponse({
            userMessage: "I work as a software developer in a tech company.",
            learnerLevel: "A2",
            topic: "Introducing Yourself Confidently",
            history: [
                { id: "m1", sender: "ai", content: "Hello! Tell me your name.", timestamp: new Date().toISOString() },
                { id: "m2", sender: "user", content: "Hi, my name is Aarav and I am from Jaipur.", timestamp: new Date().toISOString() },
                { id: "m3", sender: "ai", content: `${turn1.reply} ${turn1.suggestedFollowUpQuestion}`, timestamp: new Date().toISOString() },
            ],
        });

        expect(turn1.reply).toContain("Aarav");
        expect(turn2.reply).not.toBe(turn1.reply);
        expect(turn2.suggestedFollowUpQuestion).not.toBe(turn1.suggestedFollowUpQuestion);
    });

    it("should catch double-past 'didn't ate' and provide English/Hindi fix", async () => {
        const engine = new EnglishSathiAI();

        const response = await engine.generateTurnResponse({
            userMessage: "Yesterday I go to cafe and I didn't ate lunch.",
            learnerLevel: "A2",
            topic: "Daily Life",
            nativeLanguage: "hindi",
        });

        const didFix = response.feedback.find((f) => f.original.toLowerCase().includes("didn't ate"));
        const pastGoFix = response.feedback.find((f) => f.original.toLowerCase() === "i go");
        expect(didFix?.suggestion).toBe("didn't eat");
        expect(pastGoFix?.suggestion).toBe("I went");
    });
});