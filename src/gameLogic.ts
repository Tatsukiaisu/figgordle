export type TileState =
  | "empty"
  | "tbd"
  | "correct"
  | "present"
  | "absent"
  | "revealed"
  | "space";

export function checkGuess(guess: string, target: string): TileState[] {
  const result: TileState[] = new Array(target.length).fill("absent");
  const remaining = target.split("");

  // Mark space positions first — they are always fixed separators
  for (let i = 0; i < target.length; i++) {
    if (target[i] === " ") {
      result[i] = "space";
      remaining[i] = "\0";
    }
  }

  for (let i = 0; i < guess.length; i++) {
    if (result[i] === "space") continue;
    if (guess[i] === target[i]) {
      result[i] = "correct";
      remaining[i] = "\0";
    }
  }

  for (let i = 0; i < guess.length; i++) {
    if (result[i] === "correct" || result[i] === "space") continue;
    const idx = remaining.indexOf(guess[i]);
    if (idx !== -1) {
      result[i] = "present";
      remaining[idx] = "\0";
    }
  }

  return result;
}

const TILE_EMOJI: Record<TileState, string> = {
  correct: "🟪",
  present: "🟦",
  absent: "⬜",
  empty: "⬜",
  tbd: "⬜",
  revealed: "🟪",
  space: " ",
};

/** Builds the shareable emoji grid (no word revealed) */
export function buildShareText(
  guesses: string[],
  target: string,
  maxAttempts: number,
  dateLabel: string,
): string {
  const won =
    guesses.length > 0 &&
    checkGuess(guesses[guesses.length - 1], target).every(
      (s) => s === "correct" || s === "space",
    );
  const score = won ? `${guesses.length}/${maxAttempts}` : `X/${maxAttempts}`;
  const lines = guesses.map((g) =>
    checkGuess(g, target)
      .map((s) => TILE_EMOJI[s])
      .join(""),
  );
  return `Figgordle — ${dateLabel}\n${score}\n\n${lines.join("\n")}`;
}

export function buildKeyStates(
  guesses: string[],
  target: string,
): Map<string, TileState> {
  const map = new Map<string, TileState>();
  for (const g of guesses) {
    const states = checkGuess(g, target);
    for (let i = 0; i < g.length; i++) {
      const letter = g[i];
      const incoming = states[i];
      const current = map.get(letter);
      if (
        !current ||
        current === "absent" ||
        (current === "present" && incoming === "correct")
      ) {
        map.set(letter, incoming);
      }
    }
  }
  return map;
}
