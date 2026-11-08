import { describe, it, expect } from "vitest";
import { buildTutorSystemPrompt } from "../src/prompts/tutor.prompt";

describe("buildTutorSystemPrompt", () => {
    it("should include Hindi scaffolding instructions for Beginner Hindi speakers", () => {
        const prompt = buildTutorSystemPrompt({
            learnerLevel: "BEGINNER",
            topic: "Ordering Food at a Restaurant",
            nativeLanguage: "hindi",
            learnerName: "Aarav",
        });

        expect(prompt).toContain("Aarav");
        expect(prompt).toContain("Ordering Food at a Restaurant");
        expect(prompt).toContain("LEVEL: BEGINNER / ELEMENTARY");
        expect(prompt).toContain("Maximum 1 to 2 key mistakes per turn");
        expect(prompt).toContain("hindiExplanation");
        expect(prompt).toContain("THE SINGLE QUESTION RULE");
    });

    it("should NOT include Hindi scaffolding for Advanced learners", () => {
        const prompt = buildTutorSystemPrompt({
            learnerLevel: "ADVANCED",
            topic: "Career Negotiations",
            nativeLanguage: "hindi",
        });

        expect(prompt).toContain("LEVEL: ADVANCED");
        expect(prompt).toContain("All feedback strictly in English");
        expect(prompt).not.toContain("Include 'hindiExplanation' explaining the concept in Romanized Hindi");
    });

    it("should inject recurring mistakes when provided", () => {
        const prompt = buildTutorSystemPrompt({
            learnerLevel: "INTERMEDIATE",
            topic: "Weekend Plans",
            recurringMistakes: ["Using 'I am agree' instead of 'I agree'", "Confusing 'since' and 'for'"],
        });

        expect(prompt).toContain("KNOWN RECURRING MISTAKES");
        expect(prompt).toContain("Using 'I am agree'");
        expect(prompt).toContain("Confusing 'since' and 'for'");
    });
});