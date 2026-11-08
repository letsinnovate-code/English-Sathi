import { describe, it, expect } from "vitest";
import { TutorTurnResponseSchema } from "../src/schemas/tutor-response.schema";

describe("TutorTurnResponseSchema", () => {
    it("should successfully parse a valid pedagogical tutor response", () => {
        const validPayload = {
            reply: "I love drinking tea in the morning too! It gives you good energy.",
            feedback: [
                {
                    category: "grammar",
                    original: "I am agree with you",
                    suggestion: "I agree with you",
                    explanation: '"Agree" is a verb in English, so we do not use "am" with it.',
                    hindiExplanation: 'English में "agree" एक verb (क्रिया) है, इसलिए "I am agree" नहीं, "I agree" बोलें।',
                },
            ],
            score: 85,
            encouragement: "Great effort! Your sentence was very clear.",
            suggestedFollowUpQuestion: "Do you prefer ginger tea or masala chai?",
        };

        const parsed = TutorTurnResponseSchema.safeParse(validPayload);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.feedback).toHaveLength(1);
            expect(parsed.data.feedback[0].category).toBe("grammar");
            expect(parsed.data.feedback[0].hindiExplanation).toBeDefined();
        }
    });

    it("should default feedback to an empty array when feedback is omitted", () => {
        const payloadWithoutFeedback = {
            reply: "That is fantastic! Keep going.",
            encouragement: "Awesome work!",
            suggestedFollowUpQuestion: "What did you do next?",
        };

        const parsed = TutorTurnResponseSchema.safeParse(payloadWithoutFeedback);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.feedback).toEqual([]);
        }
    });

    it("should reject an invalid payload when required fields are missing", () => {
        const invalidPayload = {
            // reply is missing
            score: 90,
            encouragement: "Good job",
        };

        const parsed = TutorTurnResponseSchema.safeParse(invalidPayload);
        expect(parsed.success).toBe(false);
    });

    it("should reject an invalid feedback category", () => {
        const invalidCategoryPayload = {
            reply: "Sounds good!",
            feedback: [
                {
                    category: "random_invalid_category",
                    original: "bad",
                    suggestion: "good",
                    explanation: "invalid category",
                },
            ],
            encouragement: "Keep trying!",
            suggestedFollowUpQuestion: "What is your hobby?",
        };

        const parsed = TutorTurnResponseSchema.safeParse(invalidCategoryPayload);
        expect(parsed.success).toBe(false);
    });
});