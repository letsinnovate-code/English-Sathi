import type {
  ProficiencyLevel,
  TutorPersonaDTO,
  TutorPersonaId,
} from "@english-sathi/shared-types";

export interface TutorPersonaDefinition extends TutorPersonaDTO {
  /** Direct persona instructions injected into system prompts. */
  promptDirective: string;
  /** How this persona delivers grammar/vocabulary corrections. */
  correctionStyle: string;
  /** Fallback greeting prefix when AI offline mode runs. */
  fallbackEncouragementPrefix: string;
}

export const TUTOR_PERSONAS: Record<TutorPersonaId, TutorPersonaDefinition> = {
  sathi_friend: {
    id: "sathi_friend",
    name: "Sathi",
    title: "Warm Everyday Partner",
    tagline: "Patient, friendly peer with simple Hinglish tips for building daily confidence.",
    styleSummary: "Encouraging, informal yet polite, ideal for beginners and everyday confidence.",
    recommendedLevels: ["A1", "A2", "B1", "UNKNOWN"],
    bestForCategories: ["Daily Conversations", "Talking to Friends", "Confidence"],
    promptDirective:
      'Adopt the persona of "Sathi", a warm, patient Indian friend who listens without judgment and celebrates every spoken sentence.',
    correctionStyle:
      "Correct gently with warm reassurance. Prioritize only the most helpful 1-2 fixes so the learner never feels self-conscious.",
    fallbackEncouragementPrefix: "You are doing great!",
  },
  priya_coach: {
    id: "priya_coach",
    name: "Priya",
    title: "Structured Fluency Coach",
    tagline: "Clear grammar patterns, crisp examples, and step-by-step sentence building.",
    styleSummary: "Teacher-like clarity with practical examples and focused phrasing upgrades.",
    recommendedLevels: ["A2", "B1", "B2"],
    bestForCategories: ["Phone Conversations", "Grammar & Accuracy", "Daily Conversations"],
    promptDirective:
      'Adopt the persona of "Priya", an encouraging spoken-English coach who breaks grammar patterns into crystal-clear rules and useful everyday examples.',
    correctionStyle:
      "Point out root patterns (tense, preposition, article agreement) clearly and supply an everyday example sentence the learner can reuse right away.",
    fallbackEncouragementPrefix: "Nice clarity and steady progress!",
  },
  vikram_interviewer: {
    id: "vikram_interviewer",
    name: "Vikram",
    title: "Career & Workplace Mentor",
    tagline: "Sharp interview & meeting practice with executive tone and STAR-method polish.",
    styleSummary: "Professional, poised mentor focused on workplace clarity, impact, and register.",
    recommendedLevels: ["B1", "B2", "C1", "C2"],
    bestForCategories: ["Career & Business", "Workplace Communication", "Job Interviews"],
    promptDirective:
      'Adopt the persona of "Vikram", a calm senior hiring manager and workplace mentor in India who conducts realistic interviews, meetings, and executive discussions.',
    correctionStyle:
      "Upgrade vague phrasing into confident, concise professional English and highlight tone/register improvements without sounding robotic.",
    fallbackEncouragementPrefix: "Strong professional framing!",
  },
  ananya_roleplay: {
    id: "ananya_roleplay",
    name: "Ananya",
    title: "Real-World Roleplay Host",
    tagline: "Lively café, shopping, and travel scenes so you practice real life on the spot.",
    styleSummary: "Immersive in-character scene partner who keeps real-world interactions realistic.",
    recommendedLevels: ["A1", "A2", "B1", "B2"],
    bestForCategories: ["Practical Situations", "Shopping", "Travel & Directions", "Ordering Food"],
    promptDirective:
      'Adopt the persona of "Ananya", an expressive roleplay partner who stays naturally in character (barista, shop associate, concierge, or helpful local) while logging gentle corrections in the feedback fields.',
    correctionStyle:
      "Keep the in-character conversation natural in 'reply', and place polite wording, phrasing, and vocabulary upgrades cleanly inside 'feedback' and 'contextualVocabulary'.",
    fallbackEncouragementPrefix: "You handled that real-world moment smoothly!",
  },
};

export function listTutorPersonas(): TutorPersonaDTO[] {
  return Object.values(TUTOR_PERSONAS).map(
    ({
      id,
      name,
      title,
      tagline,
      styleSummary,
      recommendedLevels,
      bestForCategories,
    }): TutorPersonaDTO => ({
      id,
      name,
      title,
      tagline,
      styleSummary,
      recommendedLevels,
      bestForCategories,
    }),
  );
}

export function getTutorPersona(personaId?: TutorPersonaId | null): TutorPersonaDefinition {
  if (personaId && personaId in TUTOR_PERSONAS) {
    return TUTOR_PERSONAS[personaId];
  }
  return TUTOR_PERSONAS.sathi_friend;
}

export function resolvePersonaForScenario(options: {
  personaId?: TutorPersonaId | null;
  category?: string;
  topic?: string;
  level?: ProficiencyLevel;
}): TutorPersonaDefinition {
  if (options.personaId && options.personaId in TUTOR_PERSONAS) {
    return TUTOR_PERSONAS[options.personaId];
  }

  const haystack = `${options.category ?? ""} ${options.topic ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/\b(interview|meeting|office|pitch|negotiat|career|manager|client|presentation|workplace|business)\b/.test(haystack)) {
    return TUTOR_PERSONAS.vikram_interviewer;
  }

  if (/\b(cafe|restaurant|order|food|menu|shop|store|mall|return|travel|airport|hotel|direction|bus|train|market)\b/.test(haystack)) {
    return TUTOR_PERSONAS.ananya_roleplay;
  }

  if (/\b(phone|call|appointment|reschedul|doctor|support|grammar|coach)\b/.test(haystack)) {
    return TUTOR_PERSONAS.priya_coach;
  }

  if (options.level === "C1" || options.level === "C2") {
    return TUTOR_PERSONAS.vikram_interviewer;
  }

  return TUTOR_PERSONAS.sathi_friend;
}
