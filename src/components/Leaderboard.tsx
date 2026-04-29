import { useEffect, useRef, useState } from "react";
import { getMonthDateKeys, getWeekDateKeys } from "../daily";
import {
  type AllTimeEntry,
  type DailyEntry,
  clearPlayerIdentity,
  fetchAbandonedAllTime,
  fetchAllTimeLeaderboard,
  fetchDailyLeaderboard,
  fetchPeriodLeaderboard,
  getPlayerId,
  hasPendingAllTimeSync,
  savePlayerIdentity,
  warmAnonymousIdentity,
  wilsonLowerBound,
} from "../leaderboard";

type Tab = "daily" | "week" | "month" | "alltime" | "ongoing";
type OngoingScope = "today" | "alltime";

// ─── Rank helpers ──────────────────────────────────────────────────────

function computeRanks<T>(
  entries: T[],
  areTied: (a: T, b: T) => boolean,
): { rank: number; shared: boolean }[] {
  const ranks: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (i === 0) ranks.push(1);
    else if (areTied(entries[i], entries[i - 1])) ranks.push(ranks[i - 1]);
    else ranks.push(ranks[i - 1] + 1);
  }
  const shared = ranks.map((r, i) =>
    ranks.some((r2, j) => r2 === r && j !== i),
  );
  return ranks.map((rank, i) => ({ rank, shared: shared[i] }));
}

interface Props {
  /** Whether today's game has been completed (win or loss). */
  gameOver: boolean;
  /** YYYY-MM-DD */
  date: string;
  playerName: string | null;
  onPlayerNameChange: (name: string | null) => void;
  /** Called after the player opts out (identity cleared). */
  onOptOut: () => void;
}

// ─── Guess grid (coloured tiles without letters) ────────────────────────

function GuessGrid({ guessStates }: { guessStates: string[][] }) {
  if (!guessStates || guessStates.length === 0) return null;
  return (
    <div className="lb-guess-grid">
      {guessStates.map((row, ri) => (
        <div key={ri} className="lb-guess-row">
          {row.map((state, ci) => (
            <span key={ci} className={`lb-gtile lb-gtile-${state}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Daily row ────────────────────────────────────────────────────────────

function DailyRow({
  entry,
  rank,
  isShared,
  isMe,
  isLast,
}: {
  entry: DailyEntry;
  rank: number;
  isShared: boolean;
  isMe: boolean;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const baseLabel =
    rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : String(rank);
  const rankLabel = isShared && rank > 3 ? `${baseLabel}=` : baseLabel;

  const timeLabel = entry.submittedAt
    ? entry.submittedAt.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <>
      <tr
        className={`lb-row${!entry.partial && rank <= 3 ? ` lb-row-rank-${rank}` : ""}${entry.partial ? " lb-row-hcl" : ""}${isLast ? " lb-row-last" : ""}${isMe ? " lb-row-me" : ""}${expanded ? " lb-row-expanded" : ""}`}
        onClick={() => setExpanded((v) => !v)}
        title="Voir le détail"
      >
        <td className="lb-td-rank">{rankLabel}</td>
        <td className="lb-td-name">
          <div className="lb-td-name-inner">
            <span className="lb-td-name-text">{entry.name}</span>
          </div>
        </td>
        <td className="lb-td-result">
          {entry.partial ? (
            <span className="lb-badge lb-badge-partial">
              🔄 {entry.attempts}/{entry.maxAttempts}
            </span>
          ) : entry.won ? (
            <span className="lb-badge lb-badge-won">
              ✅ {entry.attempts}/{entry.maxAttempts}
            </span>
          ) : (
            <span className="lb-badge lb-badge-lost">
              ❌ {entry.attempts}/{entry.maxAttempts}
            </span>
          )}
        </td>
        <td className="lb-td-time">{timeLabel}</td>
        <td className="lb-td-chevron">{expanded ? "▲" : "▼"}</td>
      </tr>
      {expanded && (
        <tr className="lb-detail-row">
          <td colSpan={5}>
            <div className="lb-detail">
              <GuessGrid guessStates={entry.guessStates} />
              {entry.partial ? (
                <p className="lb-detail-result lb-detail-lost">
                  En cours · <strong>{entry.attempts}</strong> essai
                  {entry.attempts > 1 ? "s" : ""} sur {entry.maxAttempts}
                </p>
              ) : entry.won ? (
                <p className="lb-detail-result lb-detail-won">
                  Trouvé en <strong>{entry.attempts}</strong> essai
                  {entry.attempts > 1 ? "s" : ""} sur {entry.maxAttempts}
                </p>
              ) : (
                <p className="lb-detail-result lb-detail-lost">
                  Non trouvé après {entry.maxAttempts} essais
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function rateColor(rate: number): string {
  const hue = Math.round(rate * 1.2); // 0 → 0 (red), 100 → 120 (green)
  return `hsl(${hue}, 65%, 38%)`;
}

// ─── All-time row ─────────────────────────────────────────────────────────

function AllTimeRow({
  entry,
  rank,
  isShared,
  isMe,
  isLast,
  playerName,
}: {
  entry: AllTimeEntry;
  rank: number;
  isShared: boolean;
  isMe: boolean;
  isLast: boolean;
  playerName: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const baseLabel = !entry.isRanked
    ? "—"
    : rank === 1
      ? "🥇"
      : rank === 2
        ? "🥈"
        : rank === 3
          ? "🥉"
          : String(rank);
  const rankLabel =
    entry.isRanked && isShared && rank > 3 ? `${baseLabel}=` : baseLabel;

  const winRate =
    entry.gamesPlayed > 0
      ? Math.round((entry.gamesWon / entry.gamesPlayed) * 100)
      : 0;
  const avgAttemptsValue =
    entry.gamesPlayed > 0 ? entry.totalAttempts / entry.gamesPlayed : null;
  const avgAttempts =
    avgAttemptsValue === null ? "-" : avgAttemptsValue.toFixed(2);
  const winRateHelp =
    "Pourcentage de parties gagnees sur le total joue (victoires / parties).";
  const attemptsHelp =
    "Moyenne de tentatives par partie. Plus ce nombre est bas, mieux c'est.";

  return (
    <>
      <tr
        className={`lb-row${entry.isRanked && rank <= 3 ? ` lb-row-rank-${rank}` : ""}${!entry.isRanked ? " lb-row-hcl" : ""}${isLast ? " lb-row-last" : ""}${isMe ? " lb-row-me" : ""}${expanded ? " lb-row-expanded" : ""}`}
        onClick={() => setExpanded((v) => !v)}
        title="Voir le détail"
      >
        <td className="lb-td-rank">{rankLabel}</td>
        <td className="lb-td-name">
          <div className="lb-td-name-inner">
            <span className="lb-td-name-text">
              {isMe ? (playerName ?? entry.name) : entry.name}
            </span>
          </div>
        </td>
        <td className="lb-td-wins">{entry.gamesWon} 🏆</td>
        <td
          className="lb-td-rate"
          style={{ color: rateColor(winRate), fontWeight: 700 }}
        >
          {winRate}%
        </td>
        <td className="lb-td-chevron">{expanded ? "▲" : "▼"}</td>
      </tr>
      {expanded && (
        <tr className="lb-detail-row">
          <td colSpan={5}>
            <div className="lb-detail">
              <div className="lb-at-chips">
                <span
                  className="lb-chip lb-chip-rate"
                  title={winRateHelp}
                  style={{ color: rateColor(winRate) }}
                >
                  {winRate}%
                </span>
                <span className="lb-chip" title="Victoires / Parties jouées">
                  🏆 {entry.gamesWon}/{entry.gamesPlayed}
                </span>
                <span className="lb-chip" title={attemptsHelp}>
                  ✏️ {avgAttempts}/partie
                </span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

export default function Leaderboard({
  gameOver,
  date,
  playerName,
  onPlayerNameChange,
  onOptOut,
}: Props) {
  const [tab, setTab] = useState<Tab>(gameOver ? "daily" : "alltime");
  const [dailyEntries, setDailyEntries] = useState<DailyEntry[] | null>(null);
  const [alltimeEntries, setAlltimeEntries] = useState<AllTimeEntry[] | null>(
    null,
  );
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [loadingAlltime, setLoadingAlltime] = useState(false);
  const [errorDaily, setErrorDaily] = useState<string | null>(null);
  const [errorAlltime, setErrorAlltime] = useState<string | null>(null);

  // Classements par période (semaine / mois en cours)
  const [weekEntries, setWeekEntries] = useState<AllTimeEntry[] | null>(null);
  const [monthEntries, setMonthEntries] = useState<AllTimeEntry[] | null>(null);
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [errorPeriod, setErrorPeriod] = useState<string | null>(null);

  const [ongoingScope, setOngoingScope] = useState<OngoingScope>("today");
  const [ongoingToday, setOngoingToday] = useState<DailyEntry[] | null>(null);
  const [ongoingAllTime, setOngoingAllTime] = useState<AllTimeEntry[] | null>(
    null,
  );
  const [loadingOngoing, setLoadingOngoing] = useState(false);
  const [errorOngoing, setErrorOngoing] = useState<string | null>(null);

  // Rename flow
  const [renamingMode, setRenamingMode] = useState(false);
  const [newName, setNewName] = useState(playerName ?? "");
  const [renamingBusy, setRenamingBusy] = useState(false);
  const [optOutBusy, setOptOutBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [allTimeSyncPending, setAllTimeSyncPending] = useState(
    hasPendingAllTimeSync(),
  );
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [myPlayerId, setMyPlayerId] = useState(getPlayerId());

  useEffect(() => {
    if (!myPlayerId) {
      warmAnonymousIdentity()
        .then(() => setMyPlayerId(getPlayerId()))
        .catch(() => undefined);
    }
  }, [myPlayerId]);

  useEffect(() => {
    if (!renamingMode) {
      setNewName(playerName ?? "");
    }
  }, [playerName, renamingMode]);

  useEffect(() => {
    if (tab === "daily" && gameOver && dailyEntries === null && !loadingDaily) {
      setLoadingDaily(true);
      fetchDailyLeaderboard(date)
        .then(setDailyEntries)
        .catch(() => setErrorDaily("Impossible de charger le classement."))
        .finally(() => setLoadingDaily(false));
    }
  }, [tab, gameOver, date, dailyEntries, loadingDaily]);

  useEffect(() => {
    if (tab !== "week" && tab !== "month") return;
    if (loadingPeriod) return;
    const isWeek = tab === "week";
    if ((isWeek ? weekEntries : monthEntries) !== null) return;
    setLoadingPeriod(true);
    setErrorPeriod(null);
    fetchPeriodLeaderboard(isWeek ? getWeekDateKeys() : getMonthDateKeys())
      .then((entries) =>
        isWeek ? setWeekEntries(entries) : setMonthEntries(entries),
      )
      .catch(() => setErrorPeriod("Impossible de charger le classement."))
      .finally(() => setLoadingPeriod(false));
  }, [tab, weekEntries, monthEntries, loadingPeriod]);

  useEffect(() => {
    if (tab === "alltime" && alltimeEntries === null && !loadingAlltime) {
      setLoadingAlltime(true);
      fetchAllTimeLeaderboard()
        .then(setAlltimeEntries)
        .catch(() => setErrorAlltime("Impossible de charger le classement."))
        .finally(() => setLoadingAlltime(false));
    }
  }, [tab, alltimeEntries, loadingAlltime]);

  useEffect(() => {
    if (tab !== "ongoing" || loadingOngoing) return;
    if (ongoingScope === "today" && ongoingToday === null) {
      setLoadingOngoing(true);
      setErrorOngoing(null);
      fetchDailyLeaderboard(date)
        .then((list) => setOngoingToday(list.filter((e) => e.partial)))
        .catch(() =>
          setErrorOngoing("Impossible de charger les parties en cours."),
        )
        .finally(() => setLoadingOngoing(false));
    } else if (ongoingScope === "alltime" && ongoingAllTime === null) {
      setLoadingOngoing(true);
      setErrorOngoing(null);
      fetchAbandonedAllTime()
        .then(setOngoingAllTime)
        .catch(() =>
          setErrorOngoing("Impossible de charger les parties en cours."),
        )
        .finally(() => setLoadingOngoing(false));
    }
  }, [tab, ongoingScope, ongoingToday, ongoingAllTime, loadingOngoing, date]);

  useEffect(() => {
    setAllTimeSyncPending(hasPendingAllTimeSync());
  }, [tab, dailyEntries, alltimeEntries]);

  async function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (trimmed.length === 0 || trimmed.length > 20 || renamingBusy) return;
    setRenameError(null);
    setRenamingBusy(true);

    try {
      await savePlayerIdentity(trimmed);
      onPlayerNameChange(trimmed);
    } catch {
      setRenameError("Impossible d'enregistrer le pseudo sur Firebase.");
      setRenamingBusy(false);
      return;
    }
    setDailyEntries((prev) =>
      prev
        ? prev.map((entry) =>
            entry.playerId === myPlayerId ? { ...entry, name: trimmed } : entry,
          )
        : prev,
    );
    setAlltimeEntries((prev) =>
      prev
        ? prev.map((entry) =>
            entry.playerId === myPlayerId ? { ...entry, name: trimmed } : entry,
          )
        : prev,
    );

    // Les classements par période sont re-agrégés au prochain affichage
    setWeekEntries(null);
    setMonthEntries(null);

    setRenamingMode(false);
    setRenamingBusy(false);
  }

  async function handleOptOut() {
    if (optOutBusy) return;
    if (
      confirm(
        "Retirer votre participation ? Votre pseudo sera supprimé localement. Les données déjà enregistrées ne seront pas effacées du serveur.",
      )
    ) {
      setOptOutBusy(true);
      try {
        await clearPlayerIdentity();
        onOptOut();
      } finally {
        setOptOutBusy(false);
      }
    }
  }

  const currentName = playerName;

  return (
    <section className="lb-section" aria-label="Classement">
      <h2 className="lb-title">🏆 Classement</h2>

      {/* Identity bar */}
      <div className="lb-identity">
        {renameError && <p className="lb-error">{renameError}</p>}
        {allTimeSyncPending && (
          <p className="lb-warning">
            Certaines stats globales ne sont pas encore synchronisées.
          </p>
        )}
        {renamingMode ? (
          <form onSubmit={handleRenameSubmit} className="lb-rename-form">
            <input
              ref={renameInputRef}
              autoFocus
              type="text"
              className="lb-rename-input"
              maxLength={20}
              value={newName}
              disabled={renamingBusy}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nouveau pseudo"
            />
            <div className="lb-rename-actions">
              <button
                type="submit"
                className="lb-rename-save"
                disabled={renamingBusy}
              >
                {renamingBusy ? "Sauvegarde..." : "Sauver"}
              </button>
              <button
                type="button"
                className="lb-rename-cancel"
                disabled={renamingBusy}
                onClick={() => setRenamingMode(false)}
              >
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <div className="lb-identity-row">
            <span className="lb-identity-name">👤 {currentName}</span>
            <button
              className="lb-identity-btn"
              onClick={() => {
                setNewName(currentName ?? "");
                setRenamingMode(true);
              }}
            >
              Modifier
            </button>
            <button
              className="lb-identity-btn lb-opt-out"
              onClick={handleOptOut}
              disabled={optOutBusy}
            >
              {optOutBusy ? "Retrait..." : "Se retirer"}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="lb-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "daily"}
          className={`lb-tab${tab === "daily" ? " lb-tab-active" : ""}${!gameOver ? " lb-tab-disabled" : ""}`}
          onClick={() => gameOver && setTab("daily")}
          title={
            !gameOver
              ? "Terminez la partie du jour pour accéder au classement quotidien"
              : undefined
          }
        >
          Aujourd'hui
        </button>
        <button
          role="tab"
          aria-selected={tab === "week"}
          className={`lb-tab${tab === "week" ? " lb-tab-active" : ""}`}
          onClick={() => setTab("week")}
        >
          Semaine
        </button>
        <button
          role="tab"
          aria-selected={tab === "month"}
          className={`lb-tab${tab === "month" ? " lb-tab-active" : ""}`}
          onClick={() => setTab("month")}
        >
          Mois
        </button>
        <button
          role="tab"
          aria-selected={tab === "alltime"}
          className={`lb-tab${tab === "alltime" ? " lb-tab-active" : ""}`}
          onClick={() => setTab("alltime")}
        >
          Total
        </button>
        <button
          role="tab"
          aria-selected={tab === "ongoing"}
          className={`lb-tab${tab === "ongoing" ? " lb-tab-active" : ""}`}
          onClick={() => setTab("ongoing")}
        >
          En cours
        </button>
      </div>

      {/* Tab content */}
      <div className="lb-content">
        {tab === "daily" && (
          <>
            {!gameOver && (
              <p className="lb-locked-notice">
                🔒 Terminez la partie du jour pour voir ce classement.
              </p>
            )}
            {gameOver && loadingDaily && (
              <p className="lb-loading">Chargement…</p>
            )}
            {gameOver && errorDaily && <p className="lb-error">{errorDaily}</p>}
            {gameOver && dailyEntries && dailyEntries.length === 0 && (
              <p className="lb-empty">Aucun résultat pour aujourd'hui.</p>
            )}
            {gameOver && dailyEntries && dailyEntries.length > 0 && (
              <table className="lb-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Joueur</th>
                    <th>Résultat</th>
                    <th>Heure</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rankInfo = computeRanks(
                      dailyEntries,
                      (a, b) =>
                        !a.partial &&
                        !b.partial &&
                        a.won === b.won &&
                        (!a.won || a.attempts === b.attempts),
                    );
                    const lastFinishedIdx = dailyEntries.reduce(
                      (last, e, i) => (!e.partial ? i : last),
                      -1,
                    );
                    return dailyEntries.map((entry, i) => (
                      <DailyRow
                        key={entry.playerId}
                        entry={entry}
                        rank={rankInfo[i].rank}
                        isShared={rankInfo[i].shared}
                        isMe={entry.playerId === myPlayerId}
                        isLast={i === lastFinishedIdx}
                      />
                    ));
                  })()}
                </tbody>
              </table>
            )}
          </>
        )}

        {(tab === "week" || tab === "month") &&
          (() => {
            const entries = tab === "week" ? weekEntries : monthEntries;
            return (
              <>
                <p className="lb-period-hint">
                  {tab === "week"
                    ? "Semaine en cours (lundi → vendredi)"
                    : "Mois en cours"}
                </p>
                {loadingPeriod && <p className="lb-loading">Chargement…</p>}
                {errorPeriod && <p className="lb-error">{errorPeriod}</p>}
                {!loadingPeriod && entries && entries.length === 0 && (
                  <p className="lb-empty">
                    Aucune partie terminée sur cette période.
                  </p>
                )}
                {!loadingPeriod && entries && entries.length > 0 && (
                  <table className="lb-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Joueur</th>
                        <th>Victoires</th>
                        <th>Taux</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const rankInfo = computeRanks(
                          entries,
                          (a, b) =>
                            a.gamesWon === b.gamesWon &&
                            a.gamesPlayed === b.gamesPlayed &&
                            a.totalAttempts === b.totalAttempts,
                        );
                        return entries.map((entry, i) => (
                          <AllTimeRow
                            key={entry.playerId}
                            entry={entry}
                            rank={rankInfo[i].rank}
                            isShared={rankInfo[i].shared}
                            isMe={entry.playerId === myPlayerId}
                            isLast={i === entries.length - 1}
                            playerName={playerName}
                          />
                        ));
                      })()}
                    </tbody>
                  </table>
                )}
              </>
            );
          })()}

        {tab === "alltime" && (
          <>
            {loadingAlltime && <p className="lb-loading">Chargement…</p>}
            {errorAlltime && <p className="lb-error">{errorAlltime}</p>}
            {alltimeEntries && alltimeEntries.length === 0 && (
              <p className="lb-empty">Aucune donnée pour le moment.</p>
            )}
            {alltimeEntries && alltimeEntries.length > 0 && (
              <table className="lb-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Joueur</th>
                    <th>Victoires</th>
                    <th>Taux</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rankedOnly = alltimeEntries.filter((e) => e.isRanked);
                    const rankedRankInfo = computeRanks(rankedOnly, (a, b) => {
                      const wA = wilsonLowerBound(a.gamesWon, a.gamesPlayed);
                      const wB = wilsonLowerBound(b.gamesWon, b.gamesPlayed);
                      if (Math.abs(wA - wB) > 1e-9) return false;
                      const aA =
                        a.gamesPlayed > 0 ? a.totalAttempts / a.gamesPlayed : 0;
                      const aB =
                        b.gamesPlayed > 0 ? b.totalAttempts / b.gamesPlayed : 0;
                      return Math.abs(aA - aB) < 0.001;
                    });
                    const rankMap = new Map(
                      rankedOnly.map((e, i) => [e.playerId, rankedRankInfo[i]]),
                    );
                    const lastRankedIdx = alltimeEntries.reduce(
                      (last, e, i) => (e.isRanked ? i : last),
                      -1,
                    );
                    const rows: React.ReactNode[] = [];
                    alltimeEntries.forEach((entry, i) => {
                      const prevEntry = i > 0 ? alltimeEntries[i - 1] : null;
                      // Separator: hors classement (has games but below threshold)
                      if (
                        !entry.isRanked &&
                        entry.gamesPlayed > 0 &&
                        (i === 0 || (prevEntry && prevEntry.isRanked))
                      ) {
                        rows.push(
                          <tr key="hcl-separator" className="lb-hcl-separator">
                            <td colSpan={5}>
                              <span className="lb-hcl-label">
                                — Hors classement
                              </span>
                              <span className="lb-hcl-hint"> · moins de 3 parties</span>
                            </td>
                          </tr>,
                        );
                      }
                      const ri = rankMap.get(entry.playerId);
                      rows.push(
                        <AllTimeRow
                          key={entry.playerId}
                          entry={entry}
                          rank={ri?.rank ?? 0}
                          isShared={ri?.shared ?? false}
                          isMe={entry.playerId === myPlayerId}
                          isLast={i === lastRankedIdx}
                          playerName={playerName}
                        />,
                      );
                    });
                    return rows;
                  })()}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === "ongoing" && (
          <>
            <div className="lb-subtoggle" role="tablist">
              <button
                role="tab"
                aria-selected={ongoingScope === "today"}
                className={`lb-subtoggle-btn${ongoingScope === "today" ? " lb-subtoggle-active" : ""}`}
                onClick={() => setOngoingScope("today")}
              >
                Aujourd'hui
              </button>
              <button
                role="tab"
                aria-selected={ongoingScope === "alltime"}
                className={`lb-subtoggle-btn${ongoingScope === "alltime" ? " lb-subtoggle-active" : ""}`}
                onClick={() => setOngoingScope("alltime")}
              >
                Tous les temps
              </button>
            </div>

            {loadingOngoing && <p className="lb-loading">Chargement…</p>}
            {errorOngoing && <p className="lb-error">{errorOngoing}</p>}

            {!loadingOngoing &&
              !errorOngoing &&
              ongoingScope === "today" &&
              ongoingToday &&
              (ongoingToday.length === 0 ? (
                <p className="lb-empty">Aucune partie en cours aujourd'hui.</p>
              ) : (
                <table className="lb-table lb-table-mini">
                  <thead>
                    <tr>
                      <th>Joueur</th>
                      <th>Progression</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ongoingToday.map((entry) => (
                      <tr
                        key={entry.playerId}
                        className={`lb-row${entry.playerId === myPlayerId ? " lb-row-me" : ""}`}
                      >
                        <td className="lb-td-name">
                          <span className="lb-td-name-text">{entry.name}</span>
                        </td>
                        <td className="lb-td-result">
                          <span className="lb-badge lb-badge-partial">
                            🔄 {entry.attempts}/{entry.maxAttempts}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}

            {!loadingOngoing &&
              !errorOngoing &&
              ongoingScope === "alltime" &&
              ongoingAllTime &&
              (ongoingAllTime.length === 0 ? (
                <p className="lb-empty">
                  Aucune partie non terminée enregistrée.
                </p>
              ) : (
                <table className="lb-table lb-table-mini">
                  <thead>
                    <tr>
                      <th>Joueur</th>
                      <th>Non terminées</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ongoingAllTime.map((entry) => (
                      <tr
                        key={entry.playerId}
                        className={`lb-row${entry.playerId === myPlayerId ? " lb-row-me" : ""}`}
                      >
                        <td className="lb-td-name">
                          <span className="lb-td-name-text">
                            {entry.playerId === myPlayerId
                              ? (playerName ?? entry.name)
                              : entry.name}
                          </span>
                        </td>
                        <td className="lb-td-result">
                          <span className="lb-badge lb-badge-partial">
                            ⏳ {entry.gamesAbandoned}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
          </>
        )}
      </div>
    </section>
  );
}
