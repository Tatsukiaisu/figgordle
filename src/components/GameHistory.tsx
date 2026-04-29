import { useEffect, useState } from "react";
import { loadWordHistory, todayKey, type WordHistoryEntry } from "../daily";

interface Props {
  /** Whether to show the history timeline */
  visible: boolean;
}

export default function WordHistory({ visible }: Props) {
  const [history, setHistory] = useState<WordHistoryEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadWordHistory().then((data) => {
      setHistory(data);
    });
  }, []);

  if (!visible) return null;

  // Filter to show only words from before today
  const today = todayKey();
  const pastWords = history.filter((entry) => entry.date < today);

  return (
    <>
      <button
        className="wh-toggle"
        onClick={() => setIsOpen(!isOpen)}
        title="Afficher/masquer l'historique des mots"
        aria-expanded={isOpen}
        aria-controls="wh-drawer"
      >
        📖 {pastWords.length} {pastWords.length > 1 ? "mots" : "mot"}
      </button>

      {isOpen && (
        <>
          <div className="wh-backdrop" onClick={() => setIsOpen(false)} />
          <div
            className="wh-drawer"
            id="wh-drawer"
            role="dialog"
            aria-label="Historique des mots"
          >
            <div className="wh-drawer-header">
              <h3>Historique des mots</h3>
              <button
                className="wh-close"
                onClick={() => setIsOpen(false)}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <div className="wh-timeline">
              {pastWords.length === 0 ? (
                <div className="wh-empty">
                  <div className="wh-empty-emoji">📭</div>
                  <div className="wh-empty-title">Aucun historique</div>
                  <div className="wh-empty-desc">
                    L'historique des mots apparaîtra ici après la première
                    sauvegarde publique.
                  </div>
                </div>
              ) : (
                pastWords.map((entry) => (
                  <div key={entry.date} className="wh-timeline-item">
                    <div className="wh-timeline-dot" />
                    <div className="wh-timeline-content">
                      <div className="wh-timeline-date">
                        {formatDate(entry.date)}
                      </div>
                      <div className="wh-timeline-word">{entry.word}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function formatDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split("-");
    const date = new Date(`${year}-${month}-${day}T00:00:00`);
    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return dateStr;
  }
}
