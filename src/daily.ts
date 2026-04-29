import { DEBUG } from "./debug";
import { WORDS } from "./words";

// ─── Fallback : heure de déverrouillage (Paris) ──────────────────────────────
// Valeur utilisée immédiatement au chargement et si Remote Config est indisponible.
// L'heure réelle est pilotée depuis Firebase Remote Config (unlock_hour / unlock_minute).
export const UNLOCK_HOUR = 10; // 0-23
export const UNLOCK_MINUTE = 0; // 0-59
// ─────────────────────────────────────────────────────────────────────────────

/** Returns a stable YYYY-MM-DD string in local time */
export function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Weekday (Mon–Fri) date keys of the current week, from Monday up to today included. */
export function getWeekDateKeys(ref: Date = new Date()): string[] {
  const monday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  // getDay(): 0=Sun … 6=Sat → days to subtract to reach Monday
  const back = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - back);
  const keys: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    if (d.getTime() > ref.getTime()) break;
    keys.push(dateKeyOf(d));
  }
  return keys;
}

/** Weekday (Mon–Fri) date keys of the current month, from the 1st up to today included. */
export function getMonthDateKeys(ref: Date = new Date()): string[] {
  const keys: string[] = [];
  const d = new Date(ref.getFullYear(), ref.getMonth(), 1);
  while (d.getMonth() === ref.getMonth() && d.getTime() <= ref.getTime()) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) keys.push(dateKeyOf(d));
    d.setDate(d.getDate() + 1);
  }
  return keys;
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

/** Pick today's word deterministically from the shuffled list.
 *  Word is offset by 1 day so it's not playable on its assigned day but from the next day.
 *  Weekends (sat/sun) use the friday word (skip weekends in calculation).
 */
export function getDailyWord() {
  // Epoch aligned on a MONDAY so week numbers change on Monday.
  // (The previous epoch, 2026-01-01, was a Thursday: weekNumber incremented on
  // Thursdays while the working-day offset reset on Mondays, so the word order
  // jumped forward every Thursday and back every Monday, skipping words.)
  const EPOCH_MONDAY = new Date(2025, 11, 29); // Monday 29 Dec 2025, local midnight
  const msPerDay = 86_400_000;

  const currentDate = new Date();
  const todayMidnight = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate(),
  );
  // Math.round absorbs DST shifts (±1h) so the day count never drifts
  const daysSinceEpoch = Math.round(
    (todayMidnight.getTime() - EPOCH_MONDAY.getTime()) / msPerDay,
  );

  // Get the day of week (0=sunday, 1=monday, ..., 6=saturday)
  // We want: monday=0, tuesday=1, ..., friday=4, saturday=4, sunday=4
  const dayOfWeek = currentDate.getDay();

  // Convert to "working day offset": 0-4 for mon-fri, 4 for sat-sun
  let workingDayOffset: number;
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    // Sunday or Saturday → use Friday's word (offset 4)
    workingDayOffset = 4;
  } else {
    // Monday (1) → 0, Tuesday (2) → 1, ..., Friday (5) → 4
    workingDayOffset = dayOfWeek - 1;
  }

  // Calculate number of "working weeks" from the Monday-aligned epoch
  const weekNumber = Math.floor(daysSinceEpoch / 7);

  // Final index: each working week gets 5 different words (mon-fri), then repeat
  // +1 to offset by 1 day (play tomorrow's word today)
  const dayIndex = weekNumber * 5 + workingDayOffset + 1;

  return SHUFFLED_WORDS[
    ((dayIndex % SHUFFLED_WORDS.length) + SHUFFLED_WORDS.length) %
      SHUFFLED_WORDS.length
  ];
}

/** Returns the current time broken down in the Europe/Paris timezone */
function parisTime(): { h: number; m: number; s: number } {
  const now = new Date();
  // en-GB + hour12:false gives a reliable "HH:MM:SS" string (avoids fr-FR locale quirks)
  const timeStr = now.toLocaleTimeString("en-GB", {
    timeZone: "Europe/Paris",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const [h, m, s] = timeStr.split(":").map(Number);
  return { h, m, s };
}

/** Returns true if it is UNLOCK_HOUR:UNLOCK_MINUTE or later, heure de Paris */
export function isWordAvailable(
  unlockHour = UNLOCK_HOUR,
  unlockMinute = UNLOCK_MINUTE,
): boolean {
  const { h, m } = parisTime();
  return h > unlockHour || (h === unlockHour && m >= unlockMinute);
}

/** Returns the number of seconds remaining until unlock time heure de Paris (0 if already past) */
export function getSecondsUntilAvailable(
  unlockHour = UNLOCK_HOUR,
  unlockMinute = UNLOCK_MINUTE,
): number {
  const { h, m, s } = parisTime();
  const totalSecondsParis = h * 3600 + m * 60 + s;
  const targetSeconds = unlockHour * 3600 + unlockMinute * 60;
  const diff = targetSeconds - totalSecondsParis;
  return diff > 0 ? diff : 0;
}

/** Returns true if today is Saturday or Sunday in Europe/Paris timezone */
export function isWeekendParis(): boolean {
  try {
    // Use Intl.DateTimeFormat to get the weekday in Europe/Paris without reparsing strings.
    // `weekday: 'short'` yields values like "Mon", "Tue", "Sat", "Sun" for en-GB.
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      weekday: "short",
    });
    const weekdayShort = formatter.format(new Date());
    return weekdayShort === "Sat" || weekdayShort === "Sun";
  } catch {
    return false;
  }
}

// ─── localStorage keys ────────────────────────────────────────────────────────

const LS_KEY = "figgordle_state";

export interface PersistedState {
  date: string; // todayKey() when the state was saved
  guesses: string[]; // only the letters — never stores the target word
  gameOver: boolean;
  won: boolean;
}

function isPersistedState(value: unknown): value is PersistedState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.date === "string" &&
    Array.isArray(candidate.guesses) &&
    candidate.guesses.every((g) => typeof g === "string") &&
    typeof candidate.gameOver === "boolean" &&
    typeof candidate.won === "boolean"
  );
}

export function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedState(parsed)) return null;
    // Invalidate if it's from a different day
    if (parsed.date !== todayKey()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // Ignore persistence failures (private mode, quota exceeded, etc.)
  }
}

// ─── Game History (words played) ──────────────────────────────────────────────

export interface WordHistoryEntry {
  date: string; // YYYY-MM-DD when the word was played (this is the day it WAS the daily word)
  word: string; // the word
}

/** Save a word to Firebase history when game ends.
 *  Only writes if this date's word hasn't been saved yet (avoid duplicate writes).
 */
export async function saveWordToHistory(
  date: string,
  word: string,
): Promise<void> {
  try {
    const firestore = await import("firebase/firestore");
    const { db } = await import("./firebase");

    const docRef = firestore.doc(db, "wordHistory", date);

    // Check if document already exists to avoid duplicate writes
    const existingDoc = await firestore.getDoc(docRef);
    if (existingDoc.exists()) {
      // Already saved, don't re-write
      return;
    }

    // Only write if it doesn't exist yet
    await firestore.setDoc(docRef, {
      date,
      word,
      addedAt: firestore.serverTimestamp(),
    });
  } catch (err) {
    console.error("Failed to save word to history:", err);
    // Fail silently - history is not critical
  }
}

/** Load word history from Firebase */
const FAKE_HISTORY: WordHistoryEntry[] = [
  { date: "2026-05-31", word: "Figgo" },
  { date: "2026-05-30", word: "Albert" },
  { date: "2026-05-29", word: "Python" },
  { date: "2026-05-28", word: "React" },
  { date: "2026-05-27", word: "Firebase" },
  { date: "2026-05-26", word: "Webpack" },
  { date: "2026-05-25", word: "TypeScript" },
  { date: "2026-05-24", word: "Vite" },
  { date: "2026-05-23", word: "Tailwind" },
  { date: "2026-05-22", word: "JavaScript" },
];

export async function loadWordHistory(): Promise<WordHistoryEntry[]> {
  // Mode debug (VITE_DEBUG=true) : fausses entrées, aucun accès Firestore.
  if (DEBUG) return FAKE_HISTORY;
  try {
    const firestore = await import("firebase/firestore");
    const { db } = await import("./firebase");

    const collRef = firestore.collection(db, "wordHistory");
    const snapshot = await firestore.getDocs(collRef);

    const entries: WordHistoryEntry[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      if (typeof data.date === "string" && typeof data.word === "string") {
        entries.push({
          date: data.date,
          word: data.word,
        });
      }
    });

    // Sort by date descending
    const sorted = entries.sort((a, b) => b.date.localeCompare(a.date));

    return sorted;
  } catch (err) {
    console.error("Failed to load word history:", err);
    // Never show fake words to real users.
    return [];
  }
}
