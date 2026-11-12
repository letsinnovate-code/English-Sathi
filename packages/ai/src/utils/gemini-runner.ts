import { GoogleGenAI } from "@google/genai";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/**
 * Ordered model fallback chain used when the primary model hits transient high demand
 * (e.g. 503/429) or a regional 404. Stops immediately on invalid API keys (400/401/403).
 */
export const FALLBACK_GEMINI_MODELS = [
    DEFAULT_GEMINI_MODEL,
    "gemini-3.6-flash",
    "gemini-3.5-flash",
] as const;

const GEMINI_TIMEOUT_MS = 9000;

export function createGeminiClient(apiKey?: string): GoogleGenAI | null {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key || key === "your-gemini-api-key" || key.trim().length === 0) {
        return null;
    }
    return new GoogleGenAI({ apiKey: key.trim() });
}

export function resolveModelChain(primaryModel?: string): string[] {
    const ordered = [primaryModel?.trim(), ...FALLBACK_GEMINI_MODELS].filter(
        (m): m is string => Boolean(m && m.length > 0),
    );
    return Array.from(new Set(ordered));
}

function isNonRetryableAuthError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const record = error as Record<string, unknown>;
    const status = typeof record["status"] === "number" ? record["status"] : 0;
    const msg = typeof record["message"] === "string" ? record["message"] : "";
    if (status === 401 || status === 403) return true;
    if (status === 400 && msg.includes("API_KEY_INVALID")) return true;
    return false;
}

export interface GeminiContentPart {
    text?: string;
    inlineData?: { mimeType: string; data: string };
}

export interface GeminiTurnContent {
    role: "user" | "model";
    parts: GeminiContentPart[];
}

/**
 * Normalizes multi-turn text history so requests always begin with a `user` turn
 * and cleanly merge adjacent turns of the same role.
 */
export function buildNormalizedTextContents(
    history: Array<{ role: "user" | "model"; text: string }>,
    topic: string,
    latestUserText?: string,
): GeminiTurnContent[] {
    const raw = history
        .filter((h) => h.text.trim().length > 0)
        .map((h) => ({ role: h.role, text: h.text.trim() }));

    if (latestUserText !== undefined) {
        raw.push({ role: "user", text: latestUserText });
    }

    if (raw.length > 0 && raw[0].role !== "user") {
        raw.unshift({
            role: "user",
            text: `Let's practice our English conversation on the topic "${topic}".`,
        });
    }

    const merged: GeminiTurnContent[] = [];
    for (const item of raw) {
        const last = merged[merged.length - 1];
        if (last && last.role === item.role && last.parts[0]?.text !== undefined) {
            last.parts[0].text = `${last.parts[0].text}\n${item.text}`.trim();
        } else {
            merged.push({ role: item.role, parts: [{ text: item.text }] });
        }
    }
    return merged;
}

export async function generateWithModelFallback(
    ai: GoogleGenAI,
    modelChain: string[],
    params: {
        contents: GeminiTurnContent[];
        systemInstruction: string;
        temperature: number;
    },
    timeoutMs = GEMINI_TIMEOUT_MS,
): Promise<{ text: string; modelUsed: string }> {
    let lastError: unknown;

    for (const model of modelChain) {
        try {
            const response = await Promise.race([
                ai.models.generateContent({
                    model,
                    contents: params.contents,
                    config: {
                        systemInstruction: params.systemInstruction,
                        responseMimeType: "application/json",
                        temperature: params.temperature,
                    },
                }),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Gemini request timed out on ${model} (${timeoutMs}ms)`)), timeoutMs),
                ),
            ]);
            return { text: response.text || "{}", modelUsed: model };
        } catch (error) {
            lastError = error;
            if (isNonRetryableAuthError(error)) {
                throw error;
            }
            const msg = error instanceof Error ? error.message.slice(0, 140) : String(error);
            console.warn(`[GeminiRunner] Model "${model}" unavailable (${msg}); trying next fallback...`);
        }
    }

    throw lastError instanceof Error ? lastError : new Error("All Gemini models failed");
}

