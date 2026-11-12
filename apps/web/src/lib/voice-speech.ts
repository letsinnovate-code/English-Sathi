"use client";

import type { SpeakingSpeed } from "@english-sathi/shared-types";

// ─── Text-to-Speech (Browser Web Speech Synthesis) ───────────────────────────

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function mapSpeakingSpeedToRate(speed?: SpeakingSpeed): number {
  switch (speed) {
    case "SLOW":
      return 0.82;
    case "FAST":
      return 1.22;
    case "NORMAL":
    default:
      return 1.0;
  }
}

export function cancelTutorSpeech(): void {
  speechGeneration += 1;
  if (speechWatchdog !== null) {
    clearTimeout(speechWatchdog);
    speechWatchdog = null;
  }
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel();
}

let speechGeneration = 0;
let speechWatchdog: ReturnType<typeof setTimeout> | null = null;

export function speakTutorText(
  text: string,
  speed: SpeakingSpeed = "NORMAL",
  callbacks?: { onStart?: () => void; onEnd?: () => void },
): boolean {
  if (!isSpeechSynthesisSupported() || !text.trim()) {
    callbacks?.onEnd?.();
    return false;
  }

  const gen = ++speechGeneration;
  if (speechWatchdog !== null) {
    clearTimeout(speechWatchdog);
    speechWatchdog = null;
  }

  const wasBusy = window.speechSynthesis.speaking || window.speechSynthesis.pending;
  if (wasBusy) {
    window.speechSynthesis.cancel();
  }

  const startUtterance = () => {
    if (gen !== speechGeneration) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = mapSpeakingSpeedToRate(speed);

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find((v) => v.lang.toLowerCase() === "en-in") ??
      voices.find((v) => v.lang.toLowerCase().startsWith("en-")) ??
      null;

    if (preferredVoice) {
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice.lang;
    }

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      if (speechWatchdog !== null) {
        clearTimeout(speechWatchdog);
        speechWatchdog = null;
      }
      if (gen === speechGeneration) {
        callbacks?.onEnd?.();
      }
    };

    utterance.onstart = () => {
      if (gen === speechGeneration) {
        callbacks?.onStart?.();
      }
    };
    utterance.onend = done;
    utterance.onerror = done;

    // Failsafe watchdog in case Chromium stalls SpeechSynthesis onend
    const wordCount = text.trim().split(/\s+/).length;
    const estimatedMs = Math.min(45000, Math.max(6000, wordCount * 450 + 3500));
    speechWatchdog = setTimeout(done, estimatedMs);

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      done();
    }
  };

  // Delay slightly after cancel() to avoid Chromium dropping the new utterance synchronously
  if (wasBusy) {
    setTimeout(startUtterance, 50);
  } else {
    startUtterance();
  }
  return true;
}

// ─── Speech Recognition (Live Interim Captions Fallback) ─────────────────────

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
  confidence?: number;
}

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  0: BrowserSpeechRecognitionAlternative;
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<BrowserSpeechRecognitionResult>;
}

interface BrowserSpeechRecognitionErrorEvent {
  error?: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((ev: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as Record<string, unknown>;
  const ctor = win["SpeechRecognition"] ?? win["webkitSpeechRecognition"];
  return typeof ctor === "function" ? (ctor as SpeechRecognitionCtor) : null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export interface LiveCaptionsResult {
  transcript: string;
  confidence?: number;
}

export interface LiveCaptionsController {
  stop: () => Promise<LiveCaptionsResult>;
}

export function startLiveCaptions(callbacks: {
  onTranscriptUpdate: (result: LiveCaptionsResult) => void;
  onError?: (errorCode: string) => void;
}): LiveCaptionsController | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  let active = true;
  let committed = "";
  let segmentFinal = "";
  let segmentInterim = "";
  let confidenceSum = 0;
  let confidenceCount = 0;
  let fatalError = false;
  let currentRec: BrowserSpeechRecognition | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let stopResolvers: Array<(result: LiveCaptionsResult) => void> = [];

  const getCombinedResult = (): LiveCaptionsResult => ({
    transcript: [committed, segmentFinal, segmentInterim]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ")
      .trim(),
    confidence:
      confidenceCount > 0 ? Number((confidenceSum / confidenceCount).toFixed(2)) : undefined,
  });

  const resolveWaiters = () => {
    const finalResult = getCombinedResult();
    const pending = stopResolvers;
    stopResolvers = [];
    for (const resolve of pending) {
      resolve(finalResult);
    }
  };

  const launchInstance = () => {
    if (!active || fatalError) {
      resolveWaiters();
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    currentRec = recognition;

    recognition.onresult = (event) => {
      let latestInterim = "";
      let rebuiltFinal = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const alt = result?.[0];
        const text = alt?.transcript ?? "";
        if (result?.isFinal) {
          rebuiltFinal = `${rebuiltFinal} ${text}`.trim();
          if (i >= event.resultIndex && typeof alt?.confidence === "number" && alt.confidence > 0) {
            confidenceSum += alt.confidence;
            confidenceCount += 1;
          }
        } else {
          latestInterim = `${latestInterim} ${text}`.trim();
        }
      }
      segmentFinal = rebuiltFinal;
      segmentInterim = latestInterim;
      callbacks.onTranscriptUpdate(getCombinedResult());
    };

    recognition.onerror = (ev) => {
      const code = ev?.error ?? "unknown";
      if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture" || code === "network") {
        fatalError = true;
        callbacks.onError?.(code);
      }
    };

    recognition.onend = () => {
      // Preserve everything captured in this segment before clearing segment buffers
      const segmentText = [segmentFinal, segmentInterim].filter(Boolean).join(" ").trim();
      if (segmentText) {
        committed = [committed, segmentText].filter(Boolean).join(" ").trim();
        callbacks.onTranscriptUpdate(getCombinedResult());
      }
      segmentFinal = "";
      segmentInterim = "";
      currentRec = null;

      if (active && !fatalError) {
        restartTimer = setTimeout(launchInstance, 120);
      } else {
        resolveWaiters();
      }
    };

    try {
      recognition.start();
    } catch {
      fatalError = true;
      currentRec = null;
      resolveWaiters();
    }
  };

  launchInstance();

  return {
    stop: () =>
      new Promise<LiveCaptionsResult>((resolve) => {
        active = false;
        if (restartTimer !== null) {
          clearTimeout(restartTimer);
          restartTimer = null;
        }
        if (!currentRec) {
          resolve(getCombinedResult());
          return;
        }

        const timeout = setTimeout(() => {
          resolve(getCombinedResult());
        }, 450);

        stopResolvers.push((res) => {
          clearTimeout(timeout);
          resolve(res);
        });

        try {
          currentRec.stop();
        } catch {
          clearTimeout(timeout);
          resolve(getCombinedResult());
        }
      }),
  };
}

// ─── MediaRecorder Helpers ───────────────────────────────────────────────────

export function pickSupportedAudioMime(): "audio/webm" | "audio/ogg" | "audio/wav" {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) return "audio/ogg";
  if (MediaRecorder.isTypeSupported("audio/ogg")) return "audio/ogg";
  return "audio/webm";
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to encode audio blob"));
        return;
      }
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read audio blob"));
    reader.readAsDataURL(blob);
  });
}

