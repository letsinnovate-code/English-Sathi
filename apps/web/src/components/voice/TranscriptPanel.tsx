"use client";

import { useEffect, useRef } from "react";
import type { SpeakingSpeed, VoiceFeedbackItemDTO } from "@english-sathi/shared-types";
import { speakTutorText } from "@/lib/voice-speech";

export interface TranscriptEntry {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  encouragement?: string;
  followUpQuestion?: string;
  feedback?: VoiceFeedbackItemDTO[];
  score?: number;
  createdAt: string;
}

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
  speakingSpeed: SpeakingSpeed;
  isThinking: boolean;
}

const CATEGORY_LABELS: Record<VoiceFeedbackItemDTO["category"], string> = {
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  pronunciation_hint: "Pronunciation",
  natural_expression: "Natural English",
};

export function TranscriptPanel({ entries, speakingSpeed, isThinking }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length, isThinking]);

  return (
    <div className="transcript-panel">
      {entries.map((entry) => {
        const isAi = entry.role === "ASSISTANT";
        const fullAiSpeech = isAi
          ? `${entry.content}${entry.followUpQuestion ? ` ${entry.followUpQuestion}` : ""}`
          : "";

        return (
          <div key={entry.id} className={`chat-row ${isAi ? "ai" : "user"}`}>
            <div className={`chat-bubble ${isAi ? "ai" : "user"}`}>
              <div className="chat-bubble-header">
                <span className="chat-sender">{isAi ? "🗣️ Sathi" : "You"}</span>
                {entry.score !== undefined && (
                  <span className="turn-score-badge">Score: {entry.score}/100</span>
                )}
                {isAi && (
                  <button
                    type="button"
                    className="replay-btn"
                    onClick={() => speakTutorText(fullAiSpeech, speakingSpeed)}
                    title="Replay audio"
                  >
                    🔊 Replay
                  </button>
                )}
              </div>

              <p className="chat-text">{entry.content}</p>

              {entry.followUpQuestion && (
                <p className="chat-followup">{entry.followUpQuestion}</p>
              )}

              {entry.encouragement && (
                <div className="chat-encouragement">✨ {entry.encouragement}</div>
              )}

              {entry.feedback && entry.feedback.length > 0 && (
                <div className="feedback-list">
                  {entry.feedback.map((item, idx) => (
                    <div key={idx} className="feedback-card">
                      <span className="feedback-badge">{CATEGORY_LABELS[item.category]}</span>
                      <div className="feedback-diff">
                        <span className="feedback-original">{item.original}</span>
                        <span>→</span>
                        <span className="feedback-suggestion">{item.suggestion}</span>
                      </div>
                      <p className="feedback-explanation">{item.explanation}</p>
                      {item.hindiExplanation && (
                        <p className="feedback-hindi">💡 {item.hindiExplanation}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {isThinking && (
        <div className="chat-row ai">
          <div className="chat-bubble ai">
            <span className="chat-sender">🗣️ Sathi</span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem", color: "var(--text-muted)" }}>
              <span className="spinner" style={{ width: 16, height: 16 }} />
              <span>Listening & preparing reply…</span>
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

