import { WORDS } from "./words";

/** Returns a stable YYYY-MM-DD string in local time */
export function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Mulberry32 — a fast, seedable 32-bit PRNG.
 * Returns a function that yields a float in [0, 1) each call.
 */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z ^ (z + Math.imul(z ^ (z >>> 7), 61 | z))) >>> 0;
    return z / 0x100000000;
  };
}

/**
 * Fisher-Yates shuffle using the provided PRNG.
 * Returns a new array — does not mutate the original.
 */
function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const result = arr.slice();
  const rand = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** The word list shuffled once with a fixed seed — same order for every player on every device. */
const SHUFFLED_WORDS = seededShuffle(WORDS, 0xf1660);

/** Pick today's word deterministically from the shuffled list */
export function getDailyWord() {
  // Use a fixed epoch so the cycle is predictable
  const EPOCH = new Date("2026-01-01").getTime();
  const msPerDay = 86_400_000;
  const dayIndex = Math.floor((Date.now() - EPOCH) / msPerDay);
  return SHUFFLED_WORDS[
    ((dayIndex % SHUFFLED_WORDS.length) + SHUFFLED_WORDS.length) %
      SHUFFLED_WORDS.length
  ];
}

// ─── localStorage keys ────────────────────────────────────────────────────────

const LS_KEY = "figgordle_state";

export interface PersistedState {
  date: string; // todayKey() when the state was saved
  guesses: string[]; // only the letters — never stores the target word
  gameOver: boolean;
  won: boolean;
}

export function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed: PersistedState = JSON.parse(raw);
    // Invalidate if it's from a different day
    if (parsed.date !== todayKey()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: PersistedState): void {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
