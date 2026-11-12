import { describe, it, expect } from "vitest";
import { VoiceScenarioService } from "../src/services/voice-scenario.service";
import { TutorTurnResponseSchema } from "../src/schemas/tutor-response.schema";

const LESSON_CAFE = {
    title: "Ordering at a Café",
    category: "Practical Situations",
    promptStarter: "Welcome to Sathi Café! What can I get started for you today?",
    objectives: ["Order food and drinks politely", "Ask about menu items"],
    keyPhrases: ["Could I please have a masala chai?", "What do you recommend?"],
};

const LEARNER_A2 = {
    name: "Priya",
    level: "A2" as const,
    nativeLanguage: "hindi",
};

describe("VoiceScenarioService (offline / fallback mode)", () => {
    // No GEMINI_API_KEY provided → always uses deterministic fallback
    const service = new VoiceScenarioService(undefined);

    it("generates a schema-valid opening greeting in fallback mode", async () => {
        const response = await service.generateOpeningGreeting({
            lesson: LESSON_CAFE,
            learner: LEARNER_A2,
        });

        const validation = TutorTurnResponseSchema.safeParse(response);
        expect(validation.success).toBe(true);
    });

    it("opening greeting reply contains the lesson's promptStarter text", async () => {
        const response = await service.generateOpeningGreeting({
            lesson: LESSON_CAFE,
            learner: LEARNER_A2,
        });

        expect(response.reply).toContain("Sathi Café");
    });

    it("opening greeting feedback array is empty (no evaluation on first turn)", async () => {
        const response = await service.generateOpeningGreeting({
            lesson: LESSON_CAFE,
            learner: LEARNER_A2,
        });

        expect(response.feedback).toHaveLength(0);
    });

    it("fallback audio turn returns valid schema response", async () => {
        const response = await service.processAudioTurn({
            audioBase64: "SGVsbG8=",
            mimeType: "audio/webm",
            durationSeconds: 3.2,
            learner: LEARNER_A2,
            scenario: "Ordering at a Café",
        });

        const validation = TutorTurnResponseSchema.safeParse(response);
        expect(validation.success).toBe(true);
        expect(response.score).toBeGreaterThan(0);
    });

    it("fallback audio turn has undefined transcript (no STT without API key)", async () => {
        const response = await service.processAudioTurn({
            audioBase64: "SGVsbG8=",
            mimeType: "audio/ogg",
            durationSeconds: 2.0,
            learner: { level: "B1" },
            scenario: "Job Interview",
        });

        expect(response.transcript).toBeUndefined();
    });

    it("opening greeting without learner name omits name from encouragement", async () => {
        const response = await service.generateOpeningGreeting({
            lesson: LESSON_CAFE,
            learner: { level: "A1" },
        });

        // Fallback encouragement should not contain a trailing comma from an empty name
        expect(response.encouragement).not.toContain(", !");
        const validation = TutorTurnResponseSchema.safeParse(response);
        expect(validation.success).toBe(true);
    });
});

