"use client";

import type { VoiceFeedbackItemDTO } from "@english-sathi/shared-types";

const CATEGORY_LABELS: Record<VoiceFeedbackItemDTO["category"], string> = {
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  pronunciation_hint: "Pronunciation",
  natural_expression: "Natural English",
};

interface FeedbackCardListProps {
  items: VoiceFeedbackItemDTO[];
}

export function FeedbackCardList({ items }: FeedbackCardListProps) {
  if (items.length === 0) return null;

  return (
    <div className="feedback-list">
      {items.map((item, idx) => (
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
          {item.example && (
            <p className="feedback-example">📝 Example: “{item.example}”</p>
          )}
        </div>
      ))}
    </div>
  );
}

