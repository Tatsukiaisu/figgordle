/**
 * French word-list validation.
 *
 * Word list sourced from the SUTOM project by Jonathan Muller (JonathanMM),
 * published under AGPL-3.0 on Framagit:
 * https://framagit.org/JonathanMM/sutom/-/blob/main/data/mots.txt
 */

/** Strip accents and lowercase a word for dictionary lookup. */
export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Fetch `/mots.txt` (served from the public folder) and return a Set of all
 * normalised words for O(1) lookup.  Returns `null` on error so the caller
 * can choose to allow all guesses gracefully.
 */
export async function loadWordSet(): Promise<Set<string> | null> {
  try {
    const baseUrl =
      (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env
        ?.BASE_URL ?? "/";
    const res = await fetch(baseUrl + "mots.txt");
    if (!res.ok) return null;
    const text = await res.text();
    const set = new Set<string>();
    for (const line of text.split("\n")) {
      const w = line.trim();
      if (w) set.add(normalizeWord(w));
    }
    return set;
  } catch {
    return null;
  }
}

/**
 * Return true if every space-separated part of `guess` is present in the
 * dictionary.  If the word set has not finished loading yet (`null`) the
 * function allows the guess so the game is never blocked.
 */
export function isValidGuess(
  guess: string,
  wordSet: Set<string> | null,
): boolean {
  if (!wordSet) return true; // dictionary not loaded yet – allow
  const parts = guess.split(" ").filter(Boolean);
  return parts.every((part) => wordSet.has(normalizeWord(part)));
}
