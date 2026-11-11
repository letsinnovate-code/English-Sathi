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

export const LearningGoalSchema = z.enum([
  "DAILY_CONVERSATION",
  "JOB_INTERVIEW",
  "BUSINESS_ENGLISH",
  "TRAVEL",
  "ACADEMIC",
  "CONFIDENCE",
]);

export const SpeakingSpeedSchema = z.enum(["SLOW", "NORMAL", "FAST"]);

export const ExplanationLanguageSchema = z.enum(["hi", "en"]);

export const LanguageCodeSchema = z
  .string()
  .trim()
  .min(2, "Language code must be at least 2 characters")
  .max(16, "Language code must be at most 16 characters")
  .transform((value) => value.toLowerCase());

export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const EmailSchema = z.string().trim().toLowerCase().email();

export const RegisterUserSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  displayName: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  nativeLanguage: LanguageCodeSchema.default("hi"),
});

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, "Password is required").max(128),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(20, "Invalid refresh token"),
});

export const LogoutSchema = z.object({
  refreshToken: z.string().trim().min(20).optional(),
  allSessions: z.boolean().optional().default(false),
});

const LearningGoalsArraySchema = z
  .array(LearningGoalSchema)
  .min(1, "Select at least one learning goal")
  .max(6)
  .transform((goals) => Array.from(new Set(goals)));

export const OnboardingSchema = z.object({
  displayName: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  nativeLanguage: LanguageCodeSchema.default("hi"),
  explanationLanguage: ExplanationLanguageSchema.default("hi"),
  proficiencyLevel: ProficiencyLevelSchema.default("UNKNOWN"),
  learningGoals: LearningGoalsArraySchema,
  dailyGoalMinutes: z.coerce.number().int().min(5).max(180).default(15),
  speakingSpeed: SpeakingSpeedSchema.default("NORMAL"),
  timezone: z.string().trim().min(2).max(64).default("Asia/Kolkata"),
});

export const UpdateProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(60).optional(),
    nativeLanguage: LanguageCodeSchema.optional(),
    explanationLanguage: ExplanationLanguageSchema.optional(),
    proficiencyLevel: ProficiencyLevelSchema.optional(),
    learningGoals: LearningGoalsArraySchema.optional(),
    dailyGoalMinutes: z.coerce.number().int().min(5).max(180).optional(),
    speakingSpeed: SpeakingSpeedSchema.optional(),
    timezone: z.string().trim().min(2).max(64).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one profile field must be provided",
  });

export const StartSessionSchema = z.object({
  topic: z.string().min(2).max(100),
  targetLevel: ProficiencyLevelSchema.default("A1"),
});

export const SendMessageSchema = z.object({
  sessionId: z.string().uuid(),
  content: z.string().min(1).max(2000),
  audioDurationSeconds: z.number().optional(),
});

export type ProficiencyLevelInput = z.infer<typeof ProficiencyLevelSchema>;
export type LearningGoalInput = z.infer<typeof LearningGoalSchema>;
export type SpeakingSpeedInput = z.infer<typeof SpeakingSpeedSchema>;
export type RegisterUserInput = z.infer<typeof RegisterUserSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
export type LogoutInput = z.infer<typeof LogoutSchema>;
export type OnboardingInput = z.infer<typeof OnboardingSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type StartSessionInput = z.infer<typeof StartSessionSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
