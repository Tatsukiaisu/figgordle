import { todayKey } from "./daily";

const LS_STATS_KEY = "figgordle_stats";

export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  maxStreak: number;
  /** YYYY-MM-DD of the last completed game (win or loss) */
  lastPlayedDate: string | null;
  /** Distribution: key = number of attempts (1–N), value = count of wins */
  guessDistribution: Record<number, number>;
}

function defaultStats(): PlayerStats {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    currentStreak: 0,
    maxStreak: 0,
    lastPlayedDate: null,
    guessDistribution: {},
  };
}

export function loadStats(): PlayerStats {
  try {
    const raw = localStorage.getItem(LS_STATS_KEY);
    if (!raw) return defaultStats();
    return { ...defaultStats(), ...JSON.parse(raw) };
  } catch {
    return defaultStats();
  }
}

function saveStats(stats: PlayerStats): void {
  localStorage.setItem(LS_STATS_KEY, JSON.stringify(stats));
}

/** Returns the YYYY-MM-DD string for yesterday (local time). */
function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Record the outcome of a finished game.
 * Safe to call multiple times per day — idempotent once the date hasn't changed.
 */
export function recordResult(won: boolean, attempts: number): void {
  const today = todayKey();
  const stats = loadStats();

  // Avoid double-counting if somehow called twice for the same day
  if (stats.lastPlayedDate === today) return;

  stats.gamesPlayed += 1;

  if (won) {
    stats.gamesWon += 1;

    // Streak: continues only if last game was yesterday
    if (
      stats.lastPlayedDate === yesterdayKey() ||
      stats.lastPlayedDate === null
    ) {
      stats.currentStreak += 1;
    } else {
      stats.currentStreak = 1;
    }
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);

    // Guess distribution
    stats.guessDistribution[attempts] =
      (stats.guessDistribution[attempts] ?? 0) + 1;
  } else {
    // Loss resets the streak
    stats.currentStreak = 0;
  }

  stats.lastPlayedDate = today;
  saveStats(stats);
}
