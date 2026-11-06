import { z } from "zod";

export const EnglishLevelSchema = z.enum([
  "BEGINNER",
  "ELEMENTARY",
  "INTERMEDIATE",
  "UPPER_INTERMEDIATE",
  "ADVANCED",
]);

export const StartSessionSchema = z.object({
  userId: z.string().uuid(),
  topic: z.string().min(2).max(100),
  targetLevel: EnglishLevelSchema.default("BEGINNER"),
});

export const SendMessageSchema = z.object({
  sessionId: z.string().uuid(),
  content: z.string().min(1).max(2000),
  audioDurationSeconds: z.number().optional(),
});

export const RegisterUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(50),
  level: EnglishLevelSchema.default("BEGINNER"),
});

export type StartSessionInput = z.infer<typeof StartSessionSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type RegisterUserInput = z.infer<typeof RegisterUserSchema>;

