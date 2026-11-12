import { describe, it, expect } from "vitest";
import {
  RegisterUserSchema,
  LoginSchema,
  OnboardingSchema,
  UpdateProfileSchema,
  CreateVoiceSessionSchema,
  VoiceTurnTextSchema,
  VoiceTurnAudioSchema,
  EndVoiceSessionSchema,
  ListLessonsQuerySchema,
} from "../src/index";

describe("Auth and Onboarding Validation Schemas", () => {
  it("normalizes email and validates strong passwords on registration", () => {
    const parsed = RegisterUserSchema.parse({
      email: "  Aarav@Example.COM ",
      password: "Password123",
      displayName: "  Aarav Sharma  ",
    });

    expect(parsed.email).toBe("aarav@example.com");
    expect(parsed.displayName).toBe("Aarav Sharma");
    expect(parsed.nativeLanguage).toBe("hi");
  });

  it("rejects weak registration passwords", () => {
    const missingDigit = RegisterUserSchema.safeParse({
      email: "learner@example.com",
      password: "onlyletters",
      displayName: "Learner",
    });
    const tooShort = RegisterUserSchema.safeParse({
      email: "learner@example.com",
      password: "ab1",
      displayName: "Learner",
    });

    expect(missingDigit.success).toBe(false);
    expect(tooShort.success).toBe(false);
  });

  it("normalizes login email", () => {
    const parsed = LoginSchema.parse({
      email: "Student@EnglishSathi.com",
      password: "Student@123!",
    });

    expect(parsed.email).toBe("student@englishsathi.com");
  });

  it("deduplicates learning goals and applies defaults during onboarding", () => {
    const parsed = OnboardingSchema.parse({
      displayName: "Priya",
      learningGoals: ["CONFIDENCE", "JOB_INTERVIEW", "CONFIDENCE"],
    });

    expect(parsed.learningGoals).toEqual(["CONFIDENCE", "JOB_INTERVIEW"]);
    expect(parsed.nativeLanguage).toBe("hi");
    expect(parsed.explanationLanguage).toBe("hi");
    expect(parsed.proficiencyLevel).toBe("UNKNOWN");
    expect(parsed.dailyGoalMinutes).toBe(15);
    expect(parsed.speakingSpeed).toBe("NORMAL");
    expect(parsed.timezone).toBe("Asia/Kolkata");
  });

  it("rejects empty profile updates", () => {
    const empty = UpdateProfileSchema.safeParse({});
    const valid = UpdateProfileSchema.safeParse({ dailyGoalMinutes: 25, speakingSpeed: "SLOW" });

    expect(empty.success).toBe(false);
    expect(valid.success).toBe(true);
  });
});

// ─── Milestone 3: Voice session validation tests ──────────────────────────────

describe("Voice Session Validation Schemas", () => {
  const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts CreateVoiceSession with lessonId only", () => {
    const result = CreateVoiceSessionSchema.safeParse({ lessonId: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it("accepts CreateVoiceSession with scenario only", () => {
    const result = CreateVoiceSessionSchema.safeParse({ scenario: "Job Interview Practice" });
    expect(result.success).toBe(true);
  });

  it("accepts CreateVoiceSession with both lessonId and scenario", () => {
    const result = CreateVoiceSessionSchema.safeParse({
      lessonId: VALID_UUID,
      scenario: "Ordering at a café",
      level: "B1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects CreateVoiceSession with neither lessonId nor scenario", () => {
    const result = CreateVoiceSessionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects CreateVoiceSession with invalid UUID for lessonId", () => {
    const result = CreateVoiceSessionSchema.safeParse({ lessonId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("validates VoiceTurnText and defaults audioDurationSeconds to 0", () => {
    const result = VoiceTurnTextSchema.parse({
      sessionId: VALID_UUID,
      text: "  Hello, my name is Priya.  ",
    });
    expect(result.text).toBe("Hello, my name is Priya.");
    expect(result.audioDurationSeconds).toBe(0);
  });

  it("rejects VoiceTurnText with empty text", () => {
    const result = VoiceTurnTextSchema.safeParse({ sessionId: VALID_UUID, text: "   " });
    expect(result.success).toBe(false);
  });

  it("validates VoiceTurnAudio with allowed mimeType", () => {
    const result = VoiceTurnAudioSchema.safeParse({
      sessionId: VALID_UUID,
      audioBase64: "SGVsbG8=",
      mimeType: "audio/webm",
      durationSeconds: 4.5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects VoiceTurnAudio with unsupported mimeType", () => {
    const result = VoiceTurnAudioSchema.safeParse({
      sessionId: VALID_UUID,
      audioBase64: "SGVsbG8=",
      mimeType: "audio/mp3",
      durationSeconds: 4.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects VoiceTurnAudio with zero or negative duration", () => {
    const zeroDuration = VoiceTurnAudioSchema.safeParse({
      sessionId: VALID_UUID,
      audioBase64: "SGVsbG8=",
      mimeType: "audio/webm",
      durationSeconds: 0,
    });
    expect(zeroDuration.success).toBe(false);
  });

  it("validates EndVoiceSession and defaults reason to user_ended", () => {
    const result = EndVoiceSessionSchema.parse({ sessionId: VALID_UUID });
    expect(result.reason).toBe("user_ended");
  });

  it("validates ListLessonsQuery and coerces string numbers from query params", () => {
    const result = ListLessonsQuerySchema.parse({ level: "B2", page: "2", pageSize: "6" });
    expect(result.level).toBe("B2");
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(6);
  });

  it("rejects ListLessonsQuery with invalid level", () => {
    const result = ListLessonsQuerySchema.safeParse({ level: "D3" });
    expect(result.success).toBe(false);
  });
});

