"use client";

export interface VocabularyCardItem {
  word: string;
  partOfSpeech?: string;
  meaning: string;
  hindiMeaning?: string;
  example?: string;
}

interface VocabularyCardListProps {
  items: VocabularyCardItem[];
  layout?: "stack" | "grid";
}

export function VocabularyCardList({ items, layout = "grid" }: VocabularyCardListProps) {
  if (items.length === 0) return null;

  const containerStyle =
    layout === "grid"
      ? {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "0.55rem",
        }
      : {
          display: "flex",
          flexDirection: "column" as const,
          gap: "0.4rem",
        };

  return (
    <div style={containerStyle}>
      {items.map((vocab, idx) => (
        <div key={`${vocab.word}-${idx}`} className="contextual-vocab-chip">
          <div style={{ fontWeight: 700 }}>
            {vocab.word}
            {vocab.partOfSpeech ? (
              <span
                style={{
                  fontWeight: 400,
                  color: "var(--text-muted)",
                  marginLeft: "0.35rem",
                  fontSize: "0.75rem",
                }}
              >
                ({vocab.partOfSpeech})
              </span>
            ) : null}
          </div>
          <div style={{ color: "var(--text-muted)", marginTop: "0.15rem" }}>
            {vocab.meaning}
            {vocab.hindiMeaning ? ` — ${vocab.hindiMeaning}` : ""}
          </div>
          {vocab.example && (
            <div style={{ color: "#0f766e", marginTop: "0.2rem", fontSize: "0.79rem" }}>
              “{vocab.example}”
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

