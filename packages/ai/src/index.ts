export * from "./schemas/tutor-response.schema";
export * from "./prompts/tutor.prompt";
export * from "./services/tutor.service";
import { GoogleGenAI } from "@google/genai";
import type { EnglishLevel, GrammarCorrection, ConversationMessage } from "@english-sathi/shared-types";

export interface AISathiPromptOptions {
  learnerLevel: EnglishLevel;
  topic: string;
  nativeLanguage?: string;
}

export interface TutorResponse {
  reply: string;
  grammarCorrections: GrammarCorrection[];
  score?: number;
  encouragement?: string;
}

export function buildSystemPrompt(options: AISathiPromptOptions): string {
  return `You are "Sathi", an empathetic, encouraging, and friendly English conversation partner and tutor.
The learner's English level is: ${options.learnerLevel}.
Current conversation topic: "${options.topic}".
${options.nativeLanguage ? `The learner's native language is: ${options.nativeLanguage}.` : ""}

ROLE & BEHAVIOR:
1. Speak naturally in clear, accessible English appropriate for a ${options.learnerLevel} learner.
2. Keep your conversational replies short (2-3 sentences), warm, and engaging.
3. Always ask an open-ended question at the end to prompt the learner to speak.
4. Analyze the user's latest input for grammar, vocabulary, or phrasing mistakes.
5. You MUST return your response as valid JSON matching this schema:
{
  "reply": "Your response to the learner as Sathi",
  "grammarCorrections": [
    {
      "original": "exact phrase user said with error",
      "suggestion": "better/correct way to say it",
      "explanation": "friendly, short explanation of the grammar rule or nuance"
    }
  ],
  "score": 85, // number from 0 to 100 evaluating the user's turn
  "encouragement": "A brief positive remark encouraging the learner"
}`;
}

export class EnglishSathiAI {
  private ai: GoogleGenAI | null = null;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (key && key !== "your-gemini-api-key") {
      this.ai = new GoogleGenAI({ apiKey: key });
    }
  }

  async generateTurnResponse(params: {
    userMessage: string;
    learnerLevel: EnglishLevel;
    topic: string;
    history?: ConversationMessage[];
  }): Promise<TutorResponse> {
    if (!this.ai) {
      // Fallback response when no active Gemini API key is configured
      return this.generateMockResponse(params.userMessage, params.learnerLevel);
    }

    try {
      const systemInstruction = buildSystemPrompt({
        learnerLevel: params.learnerLevel,
        topic: params.topic,
      });

      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          { role: "system", parts: [{ text: systemInstruction }] },
          ...(params.history || []).map((m) => ({
            role: m.sender === "user" ? "user" : "model",
            parts: [{ text: m.content }],
          })),
          { role: "user", parts: [{ text: params.userMessage }] },
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      });

      const text = response.text || "{}";
      const parsed = JSON.parse(text) as TutorResponse;
      return {
        reply: parsed.reply || "That's very interesting! Can you tell me more about that?",
        grammarCorrections: parsed.grammarCorrections || [],
        score: parsed.score ?? 85,
        encouragement: parsed.encouragement ?? "Great effort!",
      };
    } catch (error) {
      console.warn("Gemini API call failed, falling back to rule-based response:", error);
      return this.generateMockResponse(params.userMessage, params.learnerLevel);
    }
  }

  private generateMockResponse(userMessage: string, level: EnglishLevel): TutorResponse {
    const corrections: GrammarCorrection[] = [];
    const lower = userMessage.toLowerCase();

    // Sample heuristic corrections for offline demo
    if (lower.includes("i am agree") || lower.includes("i'm agree")) {
      corrections.push({
        original: "I am agree",
        suggestion: "I agree",
        explanation: 'In English, "agree" is a verb, so say "I agree" instead of "I am agree".',
      });
    }

    if (lower.includes("he go") || lower.includes("she go")) {
      corrections.push({
        original: "go",
        suggestion: "goes",
        explanation: 'Third-person singular present takes "-es": "He/She goes".',
      });
    }

    return {
      reply: `That is a wonderful point! Practicing like this is the best way to improve. What other details can you share about this?`,
      grammarCorrections: corrections,
      score: corrections.length > 0 ? 80 : 95,
      encouragement: "Well done! Your confidence is growing with every conversation.",
    };
  }
}
