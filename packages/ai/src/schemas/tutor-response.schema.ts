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
    hindiExplanation: z.string().optional(),
});

/**
 * Strict schema for AI Tutor conversational turns.
 */
export const TutorTurnResponseSchema = z.object({
    reply: z.string().min(1, "Tutor conversational reply is required"),
    feedback: z.array(TutorFeedbackItemSchema).default([]),
    score: z.number().min(0).max(100).optional(),
    encouragement: z.string().min(1, "Encouragement is required"),
    suggestedFollowUpQuestion: z.string().min(1, "Exactly one follow-up question is required"),
});

export type FeedbackCategory = z.infer<typeof FeedbackCategorySchema>;
export type TutorFeedbackItem = z.infer<typeof TutorFeedbackItemSchema>;
export type TutorTurnResponse = z.infer<typeof TutorTurnResponseSchema>;