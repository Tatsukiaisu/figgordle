// ─── Mode debug ───────────────────────────────────────────────────────────────
// Active une fausse session (identité + classements + partie terminée) SANS toucher
// à Firebase. Pratique pour développer/tester l'UI du classement et des overlays.
//
// Activation : créer un fichier `.env.local` à la racine avec :
//   VITE_DEBUG=true
// puis `npm run dev`. En production (variable absente), tout ce module est inerte.

import type { AllTimeEntry, DailyEntry } from "./leaderboard";
import type { PersistedState } from "./daily";

/** Vrai si le mode debug est activé via la variable d'env Vite. */
export const DEBUG: boolean =
  (import.meta as { env?: Record<string, unknown> }).env?.VITE_DEBUG === "true";

/** Identité factice du joueur courant en mode debug. */
export const DEBUG_PLAYER_ID = "debug-player-0001";
export const DEBUG_PLAYER_NAME = "DebugDev";

/** Construit une ligne d'états de tuiles (sans lettres) pour les fausses grilles. */
function row(...states: string[]): string[] {
  return states;
}

/** Faux classement du jour (inclut le joueur debug pour tester le surlignage "moi"). */
export function debugDailyEntries(): DailyEntry[] {
  const base = (overrides: Partial<DailyEntry>): DailyEntry => ({
    playerId: "x",
    name: "?",
    won: false,
    attempts: 6,
    maxAttempts: 6,
    partial: false,
    wordLetterCounts: [6],
    guessStates: [],
    submittedAt: new Date(),
    ...overrides,
  });
  return [
    base({
      playerId: "dbg-alice",
      name: "Alice",
      won: true,
      attempts: 2,
      guessStates: [
        row("correct", "absent", "present", "absent", "absent", "absent"),
        row("correct", "correct", "correct", "correct", "correct", "correct"),
      ],
    }),
    base({
      playerId: DEBUG_PLAYER_ID,
      name: DEBUG_PLAYER_NAME,
      won: true,
      attempts: 3,
      guessStates: [
        row("correct", "absent", "absent", "present", "absent", "absent"),
        row("correct", "present", "absent", "absent", "present", "absent"),
        row("correct", "correct", "correct", "correct", "correct", "correct"),
      ],
    }),
    base({
      playerId: "dbg-bob",
      name: "Bob",
      won: false,
      attempts: 6,
      guessStates: [
        row("correct", "absent", "absent", "absent", "absent", "absent"),
        row("correct", "present", "absent", "absent", "absent", "absent"),
        row("correct", "absent", "present", "absent", "absent", "absent"),
        row("correct", "present", "absent", "present", "absent", "absent"),
        row("correct", "absent", "absent", "absent", "present", "absent"),
        row("correct", "absent", "present", "absent", "absent", "present"),
      ],
    }),
    base({
      playerId: "dbg-charlie",
      name: "Charlie",
      partial: true,
      attempts: 2,
      guessStates: [
        row("correct", "absent", "absent", "present", "absent", "absent"),
        row("correct", "present", "absent", "absent", "absent", "absent"),
      ],
    }),
  ];
}

/** Faux classement "tous les temps" (échantillons inégaux pour tester le tri Wilson). */
export function debugAllTimeEntries(): AllTimeEntry[] {
  const raw = [
    {
      playerId: "dbg-alice",
      name: "Alice",
      gamesPlayed: 40,
      gamesWon: 36,
      totalAttempts: 150,
      gamesAbandoned: 1,
    },
    {
      playerId: DEBUG_PLAYER_ID,
      name: DEBUG_PLAYER_NAME,
      gamesPlayed: 25,
      gamesWon: 20,
      totalAttempts: 95,
      gamesAbandoned: 2,
    },
    {
      playerId: "dbg-bob",
      name: "Bob",
      gamesPlayed: 12,
      gamesWon: 5,
      totalAttempts: 60,
      gamesAbandoned: 0,
    },
    {
      // Petit échantillon "chanceux" : ne doit PAS être premier (seuil ≥ 3 + Wilson).
      playerId: "dbg-newbie",
      name: "Newbie",
      gamesPlayed: 1,
      gamesWon: 1,
      totalAttempts: 1,
      gamesAbandoned: 0,
    },
  ];
  return raw.map((e) => ({ ...e, isRanked: e.gamesPlayed >= 3 }));
}

/** Faux joueurs avec parties non terminées (vue "En cours" / Tous les temps). */
export function debugAbandonedEntries(): AllTimeEntry[] {
  return [
    {
      playerId: DEBUG_PLAYER_ID,
      name: DEBUG_PLAYER_NAME,
      gamesPlayed: 25,
      gamesWon: 20,
      totalAttempts: 95,
      gamesAbandoned: 2,
      isRanked: true,
    },
    {
      playerId: "dbg-alice",
      name: "Alice",
      gamesPlayed: 40,
      gamesWon: 36,
      totalAttempts: 150,
      gamesAbandoned: 1,
      isRanked: true,
    },
  ];
}

/** Fausse partie déjà terminée (gagnée) pour tester overlays / modale de fin.
 *  `targetWord` est requis car les essais stockés ont la longueur du mot cible. */
export function debugPersistedState(targetWord: string): PersistedState {
  return {
    date: "", // ignoré : le mode debug court-circuite la validation de date
    guesses: [targetWord],
    gameOver: true,
    won: true,
  };
}
