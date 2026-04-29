import type { TileState } from "../gameLogic";
import type { WordEntry } from "../words";

/** CSS class per tile state — matches the project colour palette */
const TILE_CLASS: Record<TileState, string> = {
  correct: "share-tile share-correct",
  present: "share-tile share-present",
  absent: "share-tile share-absent",
  empty: "share-tile share-absent",
  tbd: "share-tile share-absent",
  revealed: "share-tile share-correct",
  space: "share-tile share-space",
};

interface Props {
  won: boolean;
  target: WordEntry;
  attempts: number;
  guessStates: TileState[][];
  maxAttempts: number;
  onShare: () => void;
  onClose: () => void;
}

export default function Modal({
  won,
  target,
  attempts,
  guessStates,
  maxAttempts,
  onShare,
  onClose,
}: Props) {
  const wordLen = target.word.length;
  return (
    <div id="modal" onClick={onClose}>
      <div
        id="modal-content"
        style={{ "--word-len": wordLen } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
        <h2 id="modal-title">{won ? "🎉 Félicitations !" : "😔 Raté !"}</h2>
        <div id="modal-body">
          <p>
            Le mot était&nbsp;: <strong>{target.display}</strong>
          </p>
          {won && (
            <p className="attempts">
              Trouvé en{" "}
              <strong>
                {attempts} essai{attempts > 1 ? "s" : ""}
              </strong>
              /{maxAttempts}
            </p>
          )}

          <div className="share-grid" aria-hidden="true">
            {guessStates.map((row, r) => (
              <div key={r} className="share-row">
                {row.map((s, c) => (
                  <span key={c} className={TILE_CLASS[s]} />
                ))}
              </div>
            ))}
          </div>

          <button className="share-btn" onClick={onShare}>
            📋 Partager
          </button>

          <p className="next-game">Revenez demain pour un nouveau mot !</p>
          <p className="credit">
            Dictionnaire&nbsp;:{" "}
            <a
              href="https://framagit.org/JonathanMM/sutom"
              target="_blank"
              rel="noopener noreferrer"
            >
              SUTOM par JonathanMM
            </a>{" "}
            (AGPL-3.0)
          </p>
        </div>
      </div>
    </div>
  );
}
