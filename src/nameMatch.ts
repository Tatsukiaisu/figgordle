// Pure name-matching helpers, deliberately free of any Firebase import so they
// can be unit-tested with the Node test runner (see nameMatch.test.ts).

// Combining diacritical marks (U+0300–U+036F), stripped after NFD normalisation.
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Normalise un nom pour comparer les doublons : trim + minuscules + sans accents. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
}

/** Parmi une liste de profils, retourne le playerId dont le nom (normalisé)
 *  correspond à `target`. Insensible à la casse, aux accents et aux espaces.
 *  Retourne le plus petit documentId (déterministe) ou null si aucun. */
export function findMatchingProfileId(
  target: string,
  profiles: { id: string; name: unknown }[],
): string | null {
  const norm = normalizeName(target);
  if (!norm) return null;
  const matches = profiles
    .filter((p) => typeof p.name === "string" && normalizeName(p.name) === norm)
    .map((p) => p.id);
  if (matches.length === 0) return null;
  matches.sort(); // déterministe
  return matches[0];
}
