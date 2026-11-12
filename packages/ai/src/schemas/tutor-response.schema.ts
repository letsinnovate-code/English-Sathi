import { z } from "zod";

/**
 * Pedagogical feedback categories.
 * Distinguishes syntax errors from natural conversational nuance.
 */
export const FeedbackCategorySchema = z.enum([
    "grammar",
    "vocabulary",
    "pronunciation_hint",
    "natural_expression",
]);

export const TutorFeedbackItemSchema = z.object({
    category: FeedbackCategorySchema,
    original: z.string().min(1, "Original phrase cannot be empty"),
    suggestion: z.string().min(1, "Correction/suggestion cannot be empty"),
    explanation: z.string().min(1, "Explanation is required"),
    hindiExplanation: z
        .string()
        .nullable()
        .optional()
        .transform((val) => (typeof val === "string" && val.trim().length > 0 ? val : undefined)),
});

/**
 * Strict schema for AI Tutor conversational turns.
 */
export const TutorTurnResponseSchema = z.object({
    reply: z.string().min(1, "Tutor conversational reply is required"),
    feedback: z.array(TutorFeedbackItemSchema).default([]),
    score: z
        .number()
        .min(0)
        .max(100)
        .nullable()
        .optional()
        .transform((val) => (val === null ? undefined : val)),
    encouragement: z.string().min(1, "Encouragement is required"),
    suggestedFollowUpQuestion: z.string().min(1, "Exactly one follow-up question is required"),
    audioClear: z
        .boolean()
        .nullable()
        .optional()
        .transform((val) => (val === null ? undefined : val)),
});

export type FeedbackCategory = z.infer<typeof FeedbackCategorySchema>;
export type TutorFeedbackItem = z.infer<typeof TutorFeedbackItemSchema>;
export type TutorTurnResponse = z.infer<typeof TutorTurnResponseSchema>;

/**
 * Safely parses LLM text (including optional markdown JSON fences) into an object.
 */
export function parseRawJsonObject(rawText: string): Record<string, unknown> | null {
    const trimmed = rawText.trim();
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const cleaned = fenceMatch ? fenceMatch[1].trim() : trimmed;
    try {
        const parsed: unknown = JSON.parse(cleaned || "{}");
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}