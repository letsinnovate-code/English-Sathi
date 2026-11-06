import type { EnglishLevel, GrammarCorrection } from "@english-sathi/shared-types";

export interface AISathiPromptOptions {
  learnerLevel: EnglishLevel;
  topic: string;
  nativeLanguage?: string;
}

export function buildSystemPrompt(options: AISathiPromptOptions): string {
  return `You are "Sathi", an empathetic, encouraging, and friendly English speaking partner and tutor.
Your learner's proficiency level is ${options.learnerLevel}.
Current conversation topic: "${options.topic}".
${options.nativeLanguage ? `The learner's native language is ${options.nativeLanguage}.` : ""}

Guidelines:
1. Speak naturally and adapt your vocabulary and sentence length to match the learner's level (${options.learnerLevel}).
2. Always keep the conversation engaging by asking open-ended questions.
3. Gently highlight grammar or phrasing mistakes with clear, kind corrections.
4. Keep answers concise (1-3 sentences) so the learner has more opportunities to speak.`;
}

export function parseCorrections(response: string): GrammarCorrection[] {
  // Stub for LLM JSON / structured output parsing
  return [];
}

