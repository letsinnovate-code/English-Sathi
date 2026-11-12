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
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel();
}

export function speakTutorText(
  text: string,
  speed: SpeakingSpeed = "NORMAL",
  callbacks?: { onStart?: () => void; onEnd?: () => void },
): boolean {
  if (!isSpeechSynthesisSupported() || !text.trim()) {
    callbacks?.onEnd?.();
    return false;
  }

  window.speechSynthesis.cancel();

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
    callbacks?.onEnd?.();
  };

  utterance.onstart = () => callbacks?.onStart?.();
  utterance.onend = done;
  utterance.onerror = done;

  window.speechSynthesis.speak(utterance);
  return true;
}

// ─── Speech Recognition (Live Interim Captions Fallback) ─────────────────────

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
}

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  0: BrowserSpeechRecognitionAlternative;
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<BrowserSpeechRecognitionResult>;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
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

export interface LiveCaptionsController {
  stop: () => void;
}

export function startLiveCaptions(callbacks: {
  onTranscriptUpdate: (fullTranscript: string) => void;
}): LiveCaptionsController | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-IN";

  let finalized = "";

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result?.[0]?.transcript ?? "";
      if (result?.isFinal) {
        finalized = `${finalized} ${text}`.trim();
      } else {
        interim = `${interim} ${text}`.trim();
      }
    }
    callbacks.onTranscriptUpdate(`${finalized} ${interim}`.trim());
  };

  recognition.onerror = () => {
    // Graceful no-op; MediaRecorder still captures raw audio
  };

  try {
    recognition.start();
  } catch {
    return null;
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // Ignore stop after already stopped
      }
    },
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

