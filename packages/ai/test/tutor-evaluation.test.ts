import { describe, it, expect } from "vitest";
import {
  buildTutorSystemPrompt,
  EnglishSathiAI,
  evaluateTutorResponsePedagogy,
  findScenarioContext,
  listConversationScenarios,
  listTutorPersonas,
  resolvePersonaForScenario,
  validateAndNormalizeTutorResponse,
  VoiceScenarioService,
} from "../src/index";
import type { ProficiencyLevel, TutorPersonaId } from "@english-sathi/shared-types";

describe("Milestone 4 — Teaching Engine Personas & Scenarios", () => {
  it("exposes all four distinct tutor personas with metadata", () => {
    const personas = listTutorPersonas();
    expect(personas.map((p) => p.id)).toEqual([
      "sathi_friend",
      "priya_coach",
      "vikram_interviewer",
      "ananya_roleplay",
    ]);
    for (const p of personas) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.tagline.length).toBeGreaterThan(10);
      expect(p.recommendedLevels.length).toBeGreaterThan(0);
    }
  });

  it("auto-matches personas to scenarios while honoring explicit overrides", () => {
    expect(resolvePersonaForScenario({ topic: "Job Interview: Strengths" }).id).toBe("vikram_interviewer");
    expect(resolvePersonaForScenario({ topic: "Ordering at a Café" }).id).toBe("ananya_roleplay");
    expect(resolvePersonaForScenario({ topic: "Phone Call: Rescheduling" }).id).toBe("priya_coach");
    expect(resolvePersonaForScenario({ topic: "Introducing Yourself", level: "A1" }).id).toBe("sathi_friend");

    // Explicit override takes priority
    expect(
      resolvePersonaForScenario({
        personaId: "priya_coach",
        topic: "Job Interview: Strengths",
      }).id,
    ).toBe("priya_coach");
  });

  it("injects distinct persona voice & scenario roles into system prompts", () => {
    const friendPrompt = buildTutorSystemPrompt({
      learnerLevel: "A1",
      topic: "Introducing Yourself Confidently",
      personaId: "sathi_friend",
      speakingSpeed: "SLOW",
    });
    const executivePrompt = buildTutorSystemPrompt({
      learnerLevel: "C1",
      topic: "Executive Negotiation & Client Pitch",
      personaId: "vikram_interviewer",
      speakingSpeed: "FAST",
    });

    expect(friendPrompt).toContain("Sathi");
    expect(friendPrompt).toContain("SPEAKING PACE (SLOW)");
    expect(friendPrompt).toContain("BEGINNER / ELEMENTARY");
    expect(friendPrompt).toContain("hindiExplanation");

    expect(executivePrompt).toContain("Vikram");
    expect(executivePrompt).toContain("SPEAKING PACE (FAST)");
    expect(executivePrompt).toContain("ADVANCED");
    expect(executivePrompt).toContain("All feedback strictly in English");
    expect(executivePrompt).not.toContain("hindiMeaning");
  });

  it("covers all core PRD F09 real-world scenarios with bilingual target vocabulary", () => {
    const scenarios = listConversationScenarios();
    expect(scenarios.length).toBeGreaterThanOrEqual(9);

    const matchedCafe = findScenarioContext("ordering masala chai at a cafe");
    const matchedShopping = findScenarioContext("exchange a shirt at a shop");
    const matchedTravel = findScenarioContext("asking directions near railway station");
    const matchedPhone = findScenarioContext("phone call to reschedule appointment");
    const matchedPitch = findScenarioContext("client pricing negotiation");

    expect(matchedCafe?.slug).toBe("ordering-at-a-cafe");
    expect(matchedShopping?.slug).toBe("shopping-and-exchanging-item");
    expect(matchedTravel?.slug).toBe("asking-for-directions-travel");
    expect(matchedPhone?.slug).toBe("phone-call-rescheduling");
    expect(matchedPitch?.slug).toBe("client-negotiation-executive-pitch");

    for (const s of scenarios) {
      expect(s.targetVocabulary.length).toBeGreaterThanOrEqual(2);
      expect(s.aiRole.length).toBeGreaterThan(5);
      expect(s.learnerRole.length).toBeGreaterThan(5);
    }
  });
});

describe("Milestone 4 — Response Validation & Pedagogical Guardrails", () => {
  it("strips trivial no-op corrections, enforces A1 max 2 cap, and enforces single follow-up question", () => {
    const rawLlmPayload = {
      reply: "Great story about Jaipur! Did you travel by train? How long did it take?",
      feedback: [
        {
          category: "grammar",
          original: "Jaipur",
          suggestion: "Jaipur", // no-op should be dropped
          explanation: "City name",
        },
        {
          category: "vocabulary",
          original: "big rain",
          suggestion: "heavy rain",
          explanation: "Use 'heavy rain' for strong rainfall.",
          hindiExplanation: "Tez baarish ke liye 'heavy rain' bolte hain.",
          example: "We stayed indoors because of heavy rain.",
        },
        {
          category: "grammar",
          original: "I go yesterday",
          suggestion: "I went yesterday",
          explanation: "Use past tense 'went' for yesterday.",
          hindiExplanation: "Yesterday ke liye 'went' use karein.",
        },
        {
          category: "natural_expression",
          original: "very much good",
          suggestion: "really great",
          explanation: "'Really great' sounds smoother.",
        },
      ],
      contextualVocabulary: [
        {
          word: "itinerary",
          partOfSpeech: "noun",
          meaning: "Your travel schedule.",
          hindiMeaning: "यात्रा कार्यक्रम",
          example: "Let me check our Jaipur itinerary.",
        },
        {
          word: "itinerary", // duplicate should be deduped
          meaning: "Travel plan.",
          example: "Our itinerary is full.",
        },
        {
          word: "landmark",
          meaning: "A famous place used as a guide.",
          hindiMeaning: "प्रमुख स्थान",
          example: "Hawa Mahal is a famous landmark.",
        },
        {
          word: "extra", // 3rd item should be capped to 2
          meaning: "More than usual.",
          example: "We packed an extra bag.",
        },
      ],
      score: 108, // should clamp to 100
      encouragement: "Awesome effort!",
      suggestedFollowUpQuestion: "What place did you visit first in Jaipur? And what food did you eat?",
    };

    const result = validateAndNormalizeTutorResponse(rawLlmPayload, {
      learnerLevel: "A1",
      nativeLanguage: "hindi",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Duplicate questions stripped from reply; single question extracted in follow-up
    expect(result.data.reply).toBe("Great story about Jaipur!");
    expect(result.data.suggestedFollowUpQuestion).toBe("What place did you visit first in Jaipur?");

    // Capped at 2 items for A1, grammar prioritized, no-op dropped
    expect(result.data.feedback).toHaveLength(2);
    expect(result.data.feedback.some((f) => f.original === "Jaipur")).toBe(false);
    expect(result.data.feedback[0].category).toBe("grammar");
    expect(result.data.feedback[0].hindiExplanation).toBeDefined();

    // Deduped and capped at 2 contextual vocabulary items
    expect(result.data.contextualVocabulary).toHaveLength(2);
    expect(result.data.contextualVocabulary?.map((v) => v.word)).toEqual(["itinerary", "landmark"]);

    // Score clamped cleanly
    expect(result.data.score).toBe(100);

    const audit = evaluateTutorResponsePedagogy(result.data, {
      learnerLevel: "A1",
      nativeLanguage: "hindi",
    });
    expect(audit.passed).toBe(true);
    expect(audit.violations).toEqual([]);
  });

  it("removes Hindi explanations and Hindi vocab notes for C1 learners and English-only mode", () => {
    const payload = {
      reply: "Your point on pricing strategy was concise.",
      feedback: [
        {
          category: "natural_expression",
          original: "discuss about pricing",
          suggestion: "discuss pricing",
          explanation: "'Discuss' is transitive and omits 'about'.",
          hindiExplanation: "Discuss ke baad about nahi lagta.",
          example: "Let's discuss pricing in tomorrow's call.",
        },
      ],
      contextualVocabulary: [
        {
          word: "mitigate",
          meaning: "Reduce risk or impact.",
          hindiMeaning: "कम करना",
          example: "A phased launch will mitigate delivery risk.",
        },
      ],
      score: 88,
      encouragement: "Sharp executive framing.",
      suggestedFollowUpQuestion: "How would you counter a 15% discount request",
    };

    const c1Result = validateAndNormalizeTutorResponse(payload, {
      learnerLevel: "C1",
      nativeLanguage: "hindi",
    });
    expect(c1Result.ok).toBe(true);
    if (c1Result.ok) {
      expect(c1Result.data.feedback[0].hindiExplanation).toBeUndefined();
      expect(c1Result.data.contextualVocabulary?.[0].hindiMeaning).toBeUndefined();
      expect(c1Result.data.suggestedFollowUpQuestion.endsWith("?")).toBe(true);
    }

    const englishModeA2 = validateAndNormalizeTutorResponse(payload, {
      learnerLevel: "A2",
      nativeLanguage: "english",
    });
    expect(englishModeA2.ok).toBe(true);
    if (englishModeA2.ok) {
      expect(englishModeA2.data.feedback[0].hindiExplanation).toBeUndefined();
      expect(englishModeA2.data.contextualVocabulary?.[0].hindiMeaning).toBeUndefined();
    }
  });
});

describe("Milestone 4 — Tutor Pedagogical Evaluation Benchmark", () => {
  const ai = new EnglishSathiAI(); // deterministic engine evaluation
  const scenarioService = new VoiceScenarioService();

  const EVAL_CASES: Array<{
    name: string;
    level: ProficiencyLevel;
    nativeLanguage: string;
    personaId?: TutorPersonaId;
    topic: string;
    utterance: string;
    expectedCorrection: { originalPattern: RegExp; suggestionSubstring: string };
    expectHindi: boolean;
  }> = [
    {
      name: "A1 introduction with 'Myself' interference gets Hindi tip and example",
      level: "A1",
      nativeLanguage: "hindi",
      personaId: "sathi_friend",
      topic: "Introducing Yourself Confidently",
      utterance: "Hello, myself Aarav and I from Indore.",
      expectedCorrection: { originalPattern: /myself aarav/i, suggestionSubstring: "I am Aarav" },
      expectHindi: true,
    },
    {
      name: "A2 café chat catches 'didn't ate' while keeping learner intent",
      level: "A2",
      nativeLanguage: "hindi",
      personaId: "ananya_roleplay",
      topic: "Ordering at a Café or Restaurant",
      utterance: "Yesterday I didn't ate lunch so I want a sandwich.",
      expectedCorrection: { originalPattern: /didn't ate/i, suggestionSubstring: "didn't eat" },
      expectHindi: true,
    },
    {
      name: "B1 office discussion catches redundant 'discuss about'",
      level: "B1",
      nativeLanguage: "hindi",
      personaId: "priya_coach",
      topic: "Leading a Team Status Meeting",
      utterance: "Let us discuss about the API blocker first.",
      expectedCorrection: { originalPattern: /discuss about/i, suggestionSubstring: "discuss" },
      expectHindi: true,
    },
    {
      name: "B2 shopping exchange catches redundant 'return back'",
      level: "B2",
      nativeLanguage: "hindi",
      personaId: "ananya_roleplay",
      topic: "Shopping & Exchanging an Item",
      utterance: "I want to return back this shirt because it is tight.",
      expectedCorrection: { originalPattern: /return back/i, suggestionSubstring: "return" },
      expectHindi: true,
    },
    {
      name: "C1 negotiation stays strictly in English and removes Hindi explanations",
      level: "C1",
      nativeLanguage: "hindi",
      personaId: "vikram_interviewer",
      topic: "Executive Negotiation & Client Pitch",
      utterance: "We will revert back after reviewing your team's proposal.",
      expectedCorrection: { originalPattern: /revert back/i, suggestionSubstring: "reply" },
      expectHindi: false,
    },
  ];

  it.each(EVAL_CASES)("$name", async (tc) => {
    const res = await ai.generateTurnResponse({
      userMessage: tc.utterance,
      learnerLevel: tc.level,
      nativeLanguage: tc.nativeLanguage,
      personaId: tc.personaId,
      topic: tc.topic,
    });

    const audit = evaluateTutorResponsePedagogy(res, {
      learnerLevel: tc.level,
      nativeLanguage: tc.nativeLanguage,
    });
    expect(audit.violations).toEqual([]);
    expect(audit.passed).toBe(true);

    const matchedFeedback = res.feedback.find((f) => tc.expectedCorrection.originalPattern.test(f.original));
    expect(matchedFeedback).toBeDefined();
    expect(matchedFeedback?.suggestion).toContain(tc.expectedCorrection.suggestionSubstring);
    expect(matchedFeedback?.example).toBeDefined();

    if (tc.expectHindi) {
      expect(matchedFeedback?.hindiExplanation).toBeTruthy();
    } else {
      expect(matchedFeedback?.hindiExplanation).toBeUndefined();
    }

    expect(res.contextualVocabulary?.length).toBeGreaterThanOrEqual(1);
    expect(res.suggestedFollowUpQuestion.endsWith("?")).toBe(true);
  });

  it("behaves differently for A1 vs C1 learners on identical multi-error utterance", async () => {
    const multiError = "I am agree that myself Rohan and yesterday I go with my cousin sister.";

    const a1Res = await ai.generateTurnResponse({
      userMessage: multiError,
      learnerLevel: "A1",
      nativeLanguage: "hindi",
      topic: "Daily Conversations",
    });
    const c1Res = await ai.generateTurnResponse({
      userMessage: multiError,
      learnerLevel: "C1",
      nativeLanguage: "hindi",
      topic: "Executive Negotiation & Client Pitch",
    });

    // Beginner capped to <=2 fixes with Hindi explanation; C1 allows up to 3 strictly in English
    expect(a1Res.feedback.length).toBeLessThanOrEqual(2);
    expect(a1Res.feedback.every((f) => Boolean(f.hindiExplanation))).toBe(true);

    expect(c1Res.feedback.length).toBe(3);
    expect(c1Res.feedback.every((f) => f.hindiExplanation === undefined)).toBe(true);
    expect(c1Res.reply).not.toBe(a1Res.reply);
  });

  it("seeds opening greeting with scenario vocabulary while respecting level language rules", async () => {
    const scenario = findScenarioContext("phone-call-rescheduling")!;
    const a2Greeting = await scenarioService.generateOpeningGreeting({
      lesson: {
        title: scenario.title,
        category: scenario.category,
        promptStarter: scenario.promptStarter,
        objectives: scenario.objectives,
        keyPhrases: scenario.keyPhrases,
        personaId: scenario.recommendedPersonaId,
        vocabulary: scenario.targetVocabulary,
      },
      learner: { name: "Riya", level: "A2", nativeLanguage: "hindi" },
    });

    expect(a2Greeting.feedback).toEqual([]);
    expect(a2Greeting.score).toBeUndefined();
    expect(a2Greeting.contextualVocabulary?.length).toBeGreaterThanOrEqual(1);
    expect(a2Greeting.contextualVocabulary?.[0].hindiMeaning).toBeTruthy();

    const c1Greeting = await scenarioService.generateOpeningGreeting({
      lesson: {
        title: scenario.title,
        category: scenario.category,
        promptStarter: scenario.promptStarter,
        vocabulary: scenario.targetVocabulary,
      },
      learner: { name: "Riya", level: "C1", nativeLanguage: "hindi" },
    });
    expect(c1Greeting.contextualVocabulary?.[0].hindiMeaning).toBeUndefined();
  });
});

