import { loadStats } from "../stats";

interface Props {
  maxAttempts: number;
  onClose: () => void;
}

export default function StatsModal({ maxAttempts, onClose }: Props) {
  const stats = loadStats();
  const winPct =
    stats.gamesPlayed === 0
      ? 0
      : Math.round((stats.gamesWon / stats.gamesPlayed) * 100);

  // Build distribution rows from 1..maxAttempts
  const maxCount = Math.max(1, ...Object.values(stats.guessDistribution));

  const rows = Array.from({ length: maxAttempts }, (_, i) => {
    const attempt = i + 1;
    const count = stats.guessDistribution[attempt] ?? 0;
    const pct = Math.round((count / maxCount) * 100);
    return { attempt, count, pct };
  });

  return (
    <div id="modal" onClick={onClose}>
      <div
        id="modal-content"
        className="stats-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Fermer">
          ✕
        </button>

        <h2 id="modal-title">📊 Statistiques</h2>

        <div id="modal-body">
          {/* ── 4 summary numbers ── */}
          <div className="stats-summary">
            <div className="stats-number">
              <span className="stats-value">{stats.gamesPlayed}</span>
              <span className="stats-label">Parties</span>
            </div>
            <div className="stats-number">
              <span className="stats-value">{winPct}%</span>
              <span className="stats-label">Victoires</span>
            </div>
            <div className="stats-number">
              <span className="stats-value">{stats.currentStreak}</span>
              <span className="stats-label">Série</span>
            </div>
            <div className="stats-number">
              <span className="stats-value">{stats.maxStreak}</span>
              <span className="stats-label">Meilleure</span>
            </div>
          </div>

          {/* ── Bar chart ── */}
          {stats.gamesWon > 0 && (
            <>
              <h3 className="stats-dist-title">Distribution des essais</h3>
              <div className="stats-dist">
                {rows.map(({ attempt, count, pct }) => (
                  <div key={attempt} className="dist-row">
                    <span className="dist-label">{attempt}</span>
                    <div className="dist-bar-wrap">
                      <div
                        className="dist-bar"
                        style={{
                          width: `${Math.max(pct, count > 0 ? 8 : 0)}%`,
                        }}
                      >
                        {count > 0 && (
                          <span className="dist-count">{count}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {stats.gamesPlayed === 0 && (
            <p className="stats-empty">
              Jouez votre première partie pour voir vos stats&nbsp;!
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
