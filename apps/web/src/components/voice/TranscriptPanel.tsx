"use client";

import { useEffect, useRef } from "react";
import type {
  ContextualVocabularyItemDTO,
  SpeakingSpeed,
  TutorPersonaId,
  VoiceFeedbackItemDTO,
} from "@english-sathi/shared-types";
import { speakTutorText } from "@/lib/voice-speech";
import { FeedbackCardList } from "./FeedbackCardList";
import { VocabularyCardList } from "./VocabularyCardList";

export interface TranscriptEntry {
  id: string;
  role: "USER" | "ASSISTANT";
  personaId?: TutorPersonaId;
  content: string;
  encouragement?: string;
  followUpQuestion?: string;
  feedback?: VoiceFeedbackItemDTO[];
  contextualVocabulary?: ContextualVocabularyItemDTO[];
  score?: number;
  createdAt: string;
}

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
  speakingSpeed: SpeakingSpeed;
  isThinking: boolean;
  personaNames?: Partial<Record<TutorPersonaId, string>>;
  defaultPersonaId?: TutorPersonaId | null;
}

const DEFAULT_PERSONA_NAMES: Record<TutorPersonaId, string> = {
  sathi_friend: "Sathi",
  priya_coach: "Priya",
  vikram_interviewer: "Vikram",
  ananya_roleplay: "Ananya",
};

export function TranscriptPanel({
  entries,
  speakingSpeed,
  isThinking,
  personaNames,
  defaultPersonaId,
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length, isThinking]);

  const resolveSenderName = (entryPersonaId?: TutorPersonaId): string => {
    const id = entryPersonaId ?? defaultPersonaId ?? "sathi_friend";
    return personaNames?.[id] ?? DEFAULT_PERSONA_NAMES[id] ?? "Sathi";
  };

  return (
    <div className="transcript-panel">
      {entries.map((entry) => {
        const isAi = entry.role === "ASSISTANT";
        const senderName = isAi ? resolveSenderName(entry.personaId) : "You";
        const fullAiSpeech = isAi
          ? `${entry.content}${entry.followUpQuestion ? ` ${entry.followUpQuestion}` : ""}`
          : "";

        return (
          <div key={entry.id} className={`chat-row ${isAi ? "ai" : "user"}`}>
            <div className={`chat-bubble ${isAi ? "ai" : "user"}`}>
              <div className="chat-bubble-header">
                <span className="chat-sender">{isAi ? `🗣️ ${senderName}` : "You"}</span>
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
                <FeedbackCardList items={entry.feedback} />
              )}

              {isAi && entry.contextualVocabulary && entry.contextualVocabulary.length > 0 && (
                <div className="contextual-vocab-list">
                  <div className="contextual-vocab-heading">📚 Contextual Vocabulary</div>
                  <VocabularyCardList items={entry.contextualVocabulary} layout="stack" />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {isThinking && (
        <div className="chat-row ai">
          <div className="chat-bubble ai">
            <span className="chat-sender">🗣️ {resolveSenderName()}</span>
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

