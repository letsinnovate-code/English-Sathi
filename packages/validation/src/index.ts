import { z } from "zod";

export const ProficiencyLevelSchema = z.enum([
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
  "UNKNOWN",
]);

export const StartSessionSchema = z.object({
  topic: z.string().min(2).max(100),
  targetLevel: ProficiencyLevelSchema.default("A1"),
});

export const SendMessageSchema = z.object({
  sessionId: z.string().uuid(),
  content: z.string().min(1).max(2000),
  audioDurationSeconds: z.number().optional(),
});

export const RegisterUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(50),
  level: ProficiencyLevelSchema.default("A1"),
});

export type ProficiencyLevelInput = z.infer<typeof ProficiencyLevelSchema>;
export type StartSessionInput = z.infer<typeof StartSessionSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type RegisterUserInput = z.infer<typeof RegisterUserSchema>;

