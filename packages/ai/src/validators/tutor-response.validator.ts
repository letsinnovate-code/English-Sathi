import type { ProficiencyLevel } from "@english-sathi/shared-types";
import {
  TutorTurnResponseSchema,
  type ContextualVocabularyItem,
  type TutorFeedbackItem,
  type TutorTurnResponse,
} from "../schemas/tutor-response.schema";

export interface TutorResponseValidationContext {
  learnerLevel: ProficiencyLevel;
  nativeLanguage?: string;
  isOpeningGreeting?: boolean;
}

export type TutorValidationResult =
  | {
      ok: true;
      data: TutorTurnResponse;
      warnings: string[];
    }
  | {
      ok: false;
      reasons: string[];
    };

export function maxFeedbackItemsForLevel(level: ProficiencyLevel): number {
  switch (level) {
    case "A1":
    case "A2":
    case "UNKNOWN":
      return 2;
    case "B1":
    case "B2":
    case "C1":
    case "C2":
    default:
      return 3;
  }
}

export function shouldAllowHindiScaffolding(
  level: ProficiencyLevel,
  nativeLanguage?: string,
): boolean {
  if (level === "C1" || level === "C2") {
    return false;
  }
  const normalized = (nativeLanguage ?? "hindi").trim().toLowerCase();
  return normalized === "hi" || normalized === "hindi";
}

function normalizeFollowUpQuestion(question: string): string {
  const cleaned = question.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "What would you like to say next?";
  }
  // Keep only the first question if the LLM stacked multiple questions separated by '?'
  const firstQuestionEnd = cleaned.indexOf("?");
  if (firstQuestionEnd !== -1 && firstQuestionEnd < cleaned.length - 1) {
    const first = cleaned.slice(0, firstQuestionEnd + 1).trim();
    if (first.length >= 6) {
      return first;
    }
  }
  return cleaned.endsWith("?") ? cleaned : `${cleaned.replace(/[.!]+$/, "")}?`;
}

/**
 * Strips trailing question sentences from `reply` so the single follow-up question
 * lives strictly in `suggestedFollowUpQuestion` (unless removing would leave `reply` empty).
 */
function ensureSingleQuestionBoundary(reply: string): { reply: string; strippedQuestion: boolean } {
  const normalized = reply.replace(/\s+/g, " ").trim();
  if (!normalized.includes("?")) {
    return { reply: normalized, strippedQuestion: false };
  }

  // Split into sentence-like chunks preserving punctuation
  const sentences = normalized.match(/[^.!?]+[.!?]+/g) ?? [normalized];
  const nonQuestionSentences = sentences.filter((s) => !s.trim().endsWith("?"));

  if (nonQuestionSentences.length > 0) {
    return {
      reply: nonQuestionSentences.join(" ").trim(),
      strippedQuestion: nonQuestionSentences.length < sentences.length,
    };
  }

  // If the entire reply was phrased as a question, preserve it untouched rather than returning empty
  return { reply: normalized, strippedQuestion: false };
}

function sanitizeFeedbackItems(
  items: TutorFeedbackItem[],
  level: ProficiencyLevel,
  allowHindi: boolean,
  isOpeningGreeting?: boolean,
): { items: TutorFeedbackItem[]; warnings: string[] } {
  if (isOpeningGreeting) {
    return { items: [], warnings: items.length > 0 ? ["Cleared feedback on opening greeting"] : [] };
  }

  const warnings: string[] = [];
  const seen = new Set<string>();
  const filtered: TutorFeedbackItem[] = [];

  for (const item of items) {
    const original = item.original.trim();
    const suggestion = item.suggestion.trim();

    if (original.toLowerCase() === suggestion.toLowerCase()) {
      warnings.push(`Dropped no-op correction for "${original}"`);
      continue;
    }

    const dedupeKey = `${original.toLowerCase()}->${suggestion.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    filtered.push({
      ...item,
      original,
      suggestion,
      explanation: item.explanation.trim(),
      hindiExplanation: allowHindi ? item.hindiExplanation : undefined,
      example: item.example,
    });
  }

  // Prioritize grammar fixes for beginners before capping
  const prioritized = [...filtered].sort((a, b) => {
    if (a.category === "grammar" && b.category !== "grammar") return -1;
    if (a.category !== "grammar" && b.category === "grammar") return 1;
    return 0;
  });

  const cap = maxFeedbackItemsForLevel(level);
  if (prioritized.length > cap) {
    warnings.push(`Capped feedback items from ${prioritized.length} to ${cap} for ${level}`);
  }

  return {
    items: prioritized.slice(0, cap),
    warnings,
  };
}

function sanitizeContextualVocabulary(
  vocab: ContextualVocabularyItem[],
  allowHindi: boolean,
  audioClear?: boolean,
): ContextualVocabularyItem[] {
  if (audioClear === false) {
    return [];
  }

  const seen = new Set<string>();
  const result: ContextualVocabularyItem[] = [];

  for (const entry of vocab) {
    const key = entry.word.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    result.push({
      word: entry.word.trim(),
      partOfSpeech: entry.partOfSpeech,
      meaning: entry.meaning.trim(),
      hindiMeaning: allowHindi ? entry.hindiMeaning : undefined,
      example: entry.example.trim(),
    });

    if (result.length >= 2) break;
  }

  return result;
}

/**
 * Validates raw LLM JSON against Zod contracts AND normalizes pedagogical invariants:
 * - Level-based feedback limit (max 2 for A1/A2/UNKNOWN, max 3 for B1-C2)
 * - Hindi explanation policy (`C1`/`C2` or English-only omits Hindi notes)
 * - Single-question boundary between `reply` and `suggestedFollowUpQuestion`
 * - Non-trivial deduplicated corrections & max 2 contextual vocabulary cards
 */
export function validateAndNormalizeTutorResponse(
  rawResponse: unknown,
  context: TutorResponseValidationContext,
): TutorValidationResult {
  // Pre-clamp numeric scores outside 0..100 so over/under-enthusiastic LLM scores recover cleanly
  let candidateInput = rawResponse;
  if (candidateInput && typeof candidateInput === "object" && !Array.isArray(candidateInput)) {
    const obj = candidateInput as Record<string, unknown>;
    if (typeof obj["score"] === "number" && Number.isFinite(obj["score"])) {
      candidateInput = {
        ...obj,
        score: Math.max(0, Math.min(100, Math.round(obj["score"]))),
      };
    }
  }

  const parsed = TutorTurnResponseSchema.safeParse(candidateInput);
  if (!parsed.success) {
    return {
      ok: false,
      reasons: parsed.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`),
    };
  }

  const raw = parsed.data;
  const allowHindi = shouldAllowHindiScaffolding(context.learnerLevel, context.nativeLanguage);

  const { reply, strippedQuestion } = ensureSingleQuestionBoundary(raw.reply);
  const { items: feedback, warnings } = sanitizeFeedbackItems(
    raw.feedback,
    context.learnerLevel,
    allowHindi,
    context.isOpeningGreeting,
  );
  if (strippedQuestion) {
    warnings.push("Removed duplicate trailing question from reply");
  }

  const contextualVocabulary = sanitizeContextualVocabulary(
    raw.contextualVocabulary ?? [],
    allowHindi,
    raw.audioClear,
  );

  const suggestedFollowUpQuestion = normalizeFollowUpQuestion(raw.suggestedFollowUpQuestion);
  const score =
    context.isOpeningGreeting || raw.audioClear === false || raw.score === undefined
      ? undefined
      : Math.max(0, Math.min(100, Math.round(raw.score)));

  return {
    ok: true,
    data: {
      reply,
      feedback,
      contextualVocabulary,
      score,
      encouragement: raw.encouragement.trim(),
      suggestedFollowUpQuestion,
      ...(raw.audioClear !== undefined ? { audioClear: raw.audioClear } : {}),
    },
    warnings,
  };
}

/**
 * Audits an already-built response for pedagogical acceptance rules (used in evaluation suites).
 */
export function evaluateTutorResponsePedagogy(
  response: TutorTurnResponse,
  context: TutorResponseValidationContext,
): { passed: boolean; violations: string[] } {
  const violations: string[] = [];
  const cap = maxFeedbackItemsForLevel(context.learnerLevel);
  const allowHindi = shouldAllowHindiScaffolding(context.learnerLevel, context.nativeLanguage);

  if (response.feedback.length > cap) {
    violations.push(`Too many corrections for ${context.learnerLevel}: ${response.feedback.length} > ${cap}`);
  }

  for (const item of response.feedback) {
    if (item.original.trim().toLowerCase() === item.suggestion.trim().toLowerCase()) {
      violations.push(`Trivial no-op correction: "${item.original}"`);
    }
    if (!allowHindi && item.hindiExplanation) {
      violations.push(`Unexpected hindiExplanation for ${context.learnerLevel} / ${context.nativeLanguage ?? "hindi"}`);
    }
  }

  if (!response.suggestedFollowUpQuestion.trim().endsWith("?")) {
    violations.push("suggestedFollowUpQuestion must end with '?'");
  }

  if ((response.contextualVocabulary?.length ?? 0) > 2) {
    violations.push("Too many contextualVocabulary items (max 2 per turn)");
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
