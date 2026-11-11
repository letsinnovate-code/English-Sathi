import { describe, it, expect } from "vitest";
import {
  RegisterUserSchema,
  LoginSchema,
  OnboardingSchema,
  UpdateProfileSchema,
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

