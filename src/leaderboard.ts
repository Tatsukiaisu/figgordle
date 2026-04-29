import type {
  collection as collectionFn,
  doc as docFn,
  documentId as documentIdFn,
  Firestore,
  getDoc as getDocFn,
  getDocs as getDocsFn,
  query as queryFn,
  runTransaction as runTransactionFn,
  serverTimestamp as serverTimestampFn,
  where as whereFn,
  writeBatch as writeBatchFn,
} from "firebase/firestore";
import {
  DEBUG,
  DEBUG_PLAYER_ID,
  DEBUG_PLAYER_NAME,
  debugAbandonedEntries,
  debugAllTimeEntries,
  debugDailyEntries,
} from "./debug";
import { findMatchingProfileId, normalizeName } from "./nameMatch";

export { normalizeName };

// ─── localStorage keys ────────────────────────────────────────────────────────

const LS_PLAYER_ID = "figgordle_player_id";
const LS_PLAYER_NAME = "figgordle_player_name";
const LS_CONSENTED = "figgordle_consented";
const LS_ALLTIME_SYNC_PENDING = "figgordle_alltime_sync_pending";
const LS_PENDING_SUBMISSION = "figgordle_pending_submission";

// ─── Pending submission (survives page reload / identity setup) ───────────────

export interface PendingSubmission {
  date: string;
  won: boolean;
  attempts: number;
  maxAttempts: number;
  wordLetterCounts: number[];
  guessStates: string[][];
  partial: boolean;
}

export function savePendingSubmission(params: PendingSubmission): void {
  safeSetItem(LS_PENDING_SUBMISSION, JSON.stringify(params));
}

export function loadPendingSubmission(): PendingSubmission | null {
  try {
    const raw = safeGetItem(LS_PENDING_SUBMISSION);
    if (!raw) return null;
    return JSON.parse(raw) as PendingSubmission;
  } catch {
    return null;
  }
}

export function clearPendingSubmission(): void {
  safeRemoveItem(LS_PENDING_SUBMISSION);
}

interface FirestoreDeps {
  db: Firestore;
  collection: typeof collectionFn;
  documentId: typeof documentIdFn;
  doc: typeof docFn;
  getDoc: typeof getDocFn;
  getDocs: typeof getDocsFn;
  query: typeof queryFn;
  runTransaction: typeof runTransactionFn;
  serverTimestamp: typeof serverTimestampFn;
  where: typeof whereFn;
  writeBatch: typeof writeBatchFn;
}

let firestoreDepsPromise: Promise<FirestoreDeps> | null = null;
let cachedPlayerName: string | null = null;
let playerNamePromise: Promise<string | null> | null = null;
let clearIdentityPromise: Promise<void> | null = null;

async function getFirestoreDeps(): Promise<FirestoreDeps> {
  if (!firestoreDepsPromise) {
    firestoreDepsPromise = (async () => {
      const firestore = await import("firebase/firestore");
      const { db } = await import("./firebase");
      return {
        db,
        collection: firestore.collection,
        documentId: firestore.documentId,
        doc: firestore.doc,
        getDoc: firestore.getDoc,
        getDocs: firestore.getDocs,
        query: firestore.query,
        runTransaction: firestore.runTransaction,
        serverTimestamp: firestore.serverTimestamp,
        where: firestore.where,
        writeBatch: firestore.writeBatch,
      };
    })();
  }
  return firestoreDepsPromise;
}

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures.
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

function setAllTimeSyncPending(value: boolean): void {
  if (value) {
    safeSetItem(LS_ALLTIME_SYNC_PENDING, "true");
  } else {
    safeRemoveItem(LS_ALLTIME_SYNC_PENDING);
  }
}

function generatePlayerId(): string {
  return crypto.randomUUID();
}

async function getAuthenticatedUid(): Promise<string> {
  const { ensureAnonymousUser } = await import("./firebase");
  const user = await ensureAnonymousUser();
  return user.uid;
}

interface LinkedIdentity {
  playerId: string;
}

const playerNameCache = new Map<string, string | null>();
const PROFILE_IN_QUERY_LIMIT = 10;

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function readLinkedIdentityFromFirebase(): Promise<LinkedIdentity | null> {
  const { db, doc, getDoc } = await getFirestoreDeps();
  const uid = await getAuthenticatedUid();
  const snap = await getDoc(doc(db, "uidLinks", uid));
  if (!snap.exists()) return null;
  const data = snap.data() as { playerId?: unknown };
  const playerId =
    typeof data.playerId === "string" && data.playerId.trim()
      ? data.playerId.trim()
      : null;
  if (!playerId) return null;
  return { playerId };
}

async function readPublicPlayerName(playerId: string): Promise<string | null> {
  const cached = playerNameCache.get(playerId);
  if (cached !== undefined) return cached;

  const { db, doc, getDoc } = await getFirestoreDeps();
  const snap = await getDoc(doc(db, "profiles", playerId));
  if (!snap.exists()) {
    playerNameCache.set(playerId, null);
    return null;
  }

  const data = snap.data() as { name?: unknown };
  const name =
    typeof data.name === "string" && data.name.trim() ? data.name.trim() : null;
  playerNameCache.set(playerId, name);
  return name;
}

/** Cherche un profil existant dont le nom (normalisé) correspond.
 *  Retourne le playerId déterministe (plus petit documentId) ou null. */
async function findPlayerIdByName(name: string): Promise<string | null> {
  if (!normalizeName(name)) return null;
  const { db, collection, getDocs } = await getFirestoreDeps();
  // Firestore ne sait pas comparer en ignorant casse/accents : on lit tous les
  // profils (collection minuscule, lisible publiquement) et on filtre côté client.
  const snap = await getDocs(collection(db, "profiles"));
  const profiles = snap.docs.map((d) => ({
    id: d.id,
    name: (d.data() as { name?: unknown }).name,
  }));
  return findMatchingProfileId(name, profiles);
}

async function readPublicPlayerNames(
  playerIds: string[],
): Promise<Map<string, string | null>> {
  const uniquePlayerIds = Array.from(new Set(playerIds.filter(Boolean)));
  const missingIds = uniquePlayerIds.filter((id) => !playerNameCache.has(id));

  if (missingIds.length > 0) {
    const { collection, db, documentId, getDocs, query, where } =
      await getFirestoreDeps();
    const chunks = chunkArray(missingIds, PROFILE_IN_QUERY_LIMIT);

    for (const chunk of chunks) {
      const profilesQuery = query(
        collection(db, "profiles"),
        where(documentId(), "in", chunk),
      );
      const snap = await getDocs(profilesQuery);
      const foundIds = new Set<string>();

      for (const profileDoc of snap.docs) {
        foundIds.add(profileDoc.id);
        const data = profileDoc.data() as { name?: unknown };
        const name =
          typeof data.name === "string" && data.name.trim()
            ? data.name.trim()
            : null;
        playerNameCache.set(profileDoc.id, name);
      }

      for (const id of chunk) {
        if (!foundIds.has(id)) {
          playerNameCache.set(id, null);
        }
      }
    }
  }

  const nameMap = new Map<string, string | null>();
  for (const id of uniquePlayerIds) {
    nameMap.set(id, playerNameCache.get(id) ?? null);
  }
  return nameMap;
}

async function getAuthenticatedPlayerId(): Promise<string> {
  await warmAnonymousIdentity();
  return getPlayerId() || generatePlayerId();
}

/**
 * Ensure anonymous auth is initialized and hydrate the cached identity.
 */
export async function warmAnonymousIdentity(): Promise<void> {
  await loadPlayerName();
}

// ─── Player identity ──────────────────────────────────────────────────────────

export function getPlayerId(): string {
  if (DEBUG) return DEBUG_PLAYER_ID;
  return safeGetItem(LS_PLAYER_ID) ?? "";
}

/**
 * Le uid anonyme courant n'est pas lié (nouvelle session Firebase : navigation
 * privée, purge ITP/Safari, nettoyage des données de site…). On tente de
 * retrouver silencieusement l'identité existante — via l'id local persisté ou,
 * à défaut, par le pseudo — et de relier le nouveau uid au même playerId, pour
 * éviter de recréer un doublon (« un nouveau Corentin chaque jour »).
 * Retourne le nom retrouvé, ou null si le joueur n'a jamais eu de profil.
 */
async function relinkExistingIdentity(localName: string): Promise<string | null> {
  let playerId = getPlayerId() || "";
  let profileName = playerId ? await readPublicPlayerName(playerId) : null;

  if (!profileName) {
    // L'id local est absent ou pointe sur un profil inexistant : chercher par nom.
    const byName = await findPlayerIdByName(localName);
    if (!byName) return null;
    playerId = byName;
    profileName = await readPublicPlayerName(playerId);
  }
  if (!playerId || !profileName) return null;

  const { db, doc, serverTimestamp, writeBatch } = await getFirestoreDeps();
  const uid = await getAuthenticatedUid();
  const batch = writeBatch(db);
  batch.set(
    doc(db, "uidLinks", uid),
    { playerId, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await batch.commit();

  safeSetItem(LS_PLAYER_ID, playerId);
  safeSetItem(LS_PLAYER_NAME, profileName);
  playerNameCache.set(playerId, profileName);
  return profileName;
}

/** Load the player's name from Firebase and cache it in memory. */
export async function loadPlayerName(): Promise<string | null> {
  if (DEBUG) {
    cachedPlayerName = DEBUG_PLAYER_NAME;
    return DEBUG_PLAYER_NAME;
  }
  if (cachedPlayerName !== null) return cachedPlayerName;
  if (!playerNamePromise) {
    playerNamePromise = (async () => {
      const cachedLocal = safeGetItem(LS_PLAYER_NAME);
      const linked = await readLinkedIdentityFromFirebase();
      if (linked) {
        safeSetItem(LS_PLAYER_ID, linked.playerId);
        const name = await readPublicPlayerName(linked.playerId);
        cachedPlayerName = name;
        return name;
      }

      // Pas de lien pour le uid courant. Si un pseudo local existe, le joueur
      // s'était déjà enregistré : tenter un rattrapage silencieux plutôt que de
      // le traiter comme un nouveau joueur.
      if (cachedLocal && hasConsented()) {
        try {
          const recovered = await relinkExistingIdentity(cachedLocal);
          if (recovered) {
            cachedPlayerName = recovered;
            return recovered;
          }
        } catch (err) {
          console.error("Identity relink failed", err);
          // Rattrapage impossible (réseau/permissions) : ne pas perdre le pseudo
          // local pour autant — on le conserve en attendant une prochaine tentative.
          cachedPlayerName = cachedLocal;
          return cachedLocal;
        }
      }

      cachedPlayerName = null;
      return null;
    })().finally(() => {
      playerNamePromise = null;
    });
  }
  return playerNamePromise;
}

/** Persist the player's chosen name and record their consent. */
export async function savePlayerIdentity(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  if (DEBUG) {
    cachedPlayerName = trimmed;
    return;
  }
  safeSetItem(LS_CONSENTED, "true");

  const linked = await readLinkedIdentityFromFirebase();
  let playerId = linked?.playerId ?? (getPlayerId() || "");
  if (!playerId) {
    // Pas d'identité liée : tenter de récupérer un profil existant par nom.
    playerId = (await findPlayerIdByName(trimmed)) ?? generatePlayerId();
  }

  const profileName = await readPublicPlayerName(playerId);
  if (profileName === trimmed && linked) {
    safeSetItem(LS_PLAYER_ID, playerId);
    cachedPlayerName = trimmed;
    playerNameCache.set(playerId, trimmed);
    safeSetItem(LS_PLAYER_NAME, trimmed);
    return;
  }

  const { db, doc, serverTimestamp, writeBatch } = await getFirestoreDeps();
  const uid = await getAuthenticatedUid();
  const profileRef = doc(db, "profiles", playerId);
  const batch = writeBatch(db);
  batch.set(
    doc(db, "uidLinks", uid),
    {
      playerId,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  batch.set(
    profileRef,
    {
      name: trimmed,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();

  safeSetItem(LS_PLAYER_ID, playerId);
  cachedPlayerName = trimmed;
  playerNameCache.set(playerId, trimmed);
  safeSetItem(LS_PLAYER_NAME, trimmed);
}

export function hasConsented(): boolean {
  if (DEBUG) return true;
  return safeGetItem(LS_CONSENTED) === "true";
}

export function hasPendingAllTimeSync(): boolean {
  return safeGetItem(LS_ALLTIME_SYNC_PENDING) === "true";
}

/** Remove all local player data (opt-out). */
export async function clearPlayerIdentity(): Promise<void> {
  if (DEBUG) {
    cachedPlayerName = null;
    return;
  }
  if (clearIdentityPromise) return clearIdentityPromise;

  clearIdentityPromise = (async () => {
    safeRemoveItem(LS_PLAYER_ID);
    safeRemoveItem(LS_PLAYER_NAME);
    safeRemoveItem(LS_CONSENTED);
    safeRemoveItem(LS_ALLTIME_SYNC_PENDING);
    cachedPlayerName = null;

    const { auth, signOutAnonymousUser } = await import("./firebase");
    if (!auth.currentUser) return;
    try {
      await signOutAnonymousUser();
    } catch {
      // Ignore sign-out failures; local opt-out still applies.
    }
  })().finally(() => {
    clearIdentityPromise = null;
  });

  return clearIdentityPromise;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Borne inférieure de l'intervalle de Wilson (95 %, z=1.96) du taux de réussite.
 *  Intègre la taille d'échantillon : 1/1 ≈ 0.21, 100/100 ≈ 0.96. */
export function wilsonLowerBound(wins: number, n: number): number {
  if (n <= 0) return 0;
  const z = 1.96;
  const p = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return (center - margin) / denom;
}

/** Returns the number of letters in each space-separated part of the word.
 *  e.g. "NOTE DE FRAIS" → [4, 2, 5]  */
export function getWordLetterCounts(word: string): number[] {
  return word.split(" ").map((part) => part.length);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyEntry {
  playerId: string;
  name: string;
  won: boolean;
  attempts: number;
  maxAttempts: number;
  /** True when the player abandoned mid-game (did not use all attempts). */
  partial?: boolean;
  /** Letter count per space-separated word part. */
  wordLetterCounts: number[];
  /** Tile colour pattern per guess row — stored without the actual letters. */
  guessStates: string[][];
  submittedAt: Date | null;
}

export interface AllTimeEntry {
  playerId: string;
  name: string;
  gamesPlayed: number;
  gamesWon: number;
  totalAttempts: number;
  gamesAbandoned: number;
  /** Whether the player meets the minimum games threshold to appear in ranked positions. */
  isRanked: boolean;
}

// ─── Firestore operations ─────────────────────────────────────────────────────

/**
 * Submit today's result.
 * Idempotent: a second call for the same player/date is silently ignored.
 */
export async function submitDailyScore(params: {
  date: string;
  won: boolean;
  attempts: number;
  maxAttempts: number;
  wordLetterCounts: number[];
  guessStates: string[][];
  partial?: boolean;
}): Promise<void> {
  if (DEBUG) return; // mode debug : aucune écriture Firebase
  const { db, doc, runTransaction, serverTimestamp } = await getFirestoreDeps();

  const name = await loadPlayerName();
  if (!name || !hasConsented()) return;

  const playerId = await getAuthenticatedPlayerId();
  const entryRef = doc(db, "daily", params.date, "entries", playerId);
  const alltimeRef = doc(db, "alltime", playerId);
  let shouldUpdateAlltime = false;
  let wasPartialUpgrade = false;

  await runTransaction(db, async (tx) => {
    const existing = await tx.get(entryRef);
    // Block if a final (non-partial) entry already exists.
    if (existing.exists() && !existing.data()?.partial) return;
    // partial→partial: update allowed (more guesses since last save)
    // partial→final: update allowed (player finished the game)

    const payload = {
      name,
      won: params.won,
      attempts: params.attempts,
      maxAttempts: params.maxAttempts,
      wordLetterCounts: params.wordLetterCounts,
      guessStates: params.guessStates.map((row) => row.join(",")),
      submittedAt: serverTimestamp(),
      ...(params.partial ? { partial: true } : {}),
    };

    if (existing.exists()) {
      wasPartialUpgrade = true;
    }
    tx.set(entryRef, payload);
    // Only touch alltime for new entries or partial→final upgrades.
    // partial→partial updates only refresh the daily doc, not alltime.
    if (!existing.exists() || !params.partial) {
      shouldUpdateAlltime = true;
    }
  });

  if (!shouldUpdateAlltime) return;
  // Partial entries (abandoned games) are recorded in the daily board but do not affect all-time stats.
  // Keep global stats best-effort so a rules mismatch there cannot block daily score submission.
  try {
    await runTransaction(db, async (tx) => {
      const alltimeSnap = await tx.get(alltimeRef);
      const alltimeData = alltimeSnap.data() as
        | {
            gamesPlayed?: unknown;
            gamesWon?: unknown;
            totalAttempts?: unknown;
            gamesAbandoned?: unknown;
          }
        | undefined;

      if (params.partial) {
        const currentAbandoned =
          typeof alltimeData?.gamesAbandoned === "number"
            ? alltimeData.gamesAbandoned
            : 0;
        if (!alltimeSnap.exists()) {
          // First write ever for this player — must include all required fields (rules expect a full create).
          tx.set(alltimeRef, {
            gamesPlayed: 0,
            gamesWon: 0,
            totalAttempts: 0,
            lastDate: params.date,
            gamesAbandoned: 1,
          });
        } else {
          tx.set(
            alltimeRef,
            { gamesAbandoned: currentAbandoned + 1 },
            { merge: true },
          );
        }
        return;
      }

      const currentGamesPlayed =
        typeof alltimeData?.gamesPlayed === "number"
          ? alltimeData.gamesPlayed
          : 0;
      const currentGamesWon =
        typeof alltimeData?.gamesWon === "number" ? alltimeData.gamesWon : 0;
      const currentTotalAttempts =
        typeof alltimeData?.totalAttempts === "number"
          ? alltimeData.totalAttempts
          : 0;
      // If upgrading from partial, decrement gamesAbandoned to keep the count accurate.
      const currentAbandoned =
        typeof alltimeData?.gamesAbandoned === "number"
          ? alltimeData.gamesAbandoned
          : 0;

      tx.set(
        alltimeRef,
        {
          gamesPlayed: currentGamesPlayed + 1,
          gamesWon: currentGamesWon + (params.won ? 1 : 0),
          totalAttempts: currentTotalAttempts + params.attempts,
          lastDate: params.date,
          ...(wasPartialUpgrade && currentAbandoned > 0
            ? { gamesAbandoned: currentAbandoned - 1 }
            : {}),
        },
        { merge: true },
      );
    });
    setAllTimeSyncPending(false);
  } catch (err) {
    setAllTimeSyncPending(true);
    console.error("All-time stats update failed", err);
  }
}

/** Fetch daily leaderboard, sorted client-side (wins first → fewest attempts → earliest submit). */
export async function fetchDailyLeaderboard(
  date: string,
): Promise<DailyEntry[]> {
  if (DEBUG) return debugDailyEntries();
  const { db, collection, getDocs } = await getFirestoreDeps();
  const snap = await getDocs(collection(db, "daily", date, "entries"));
  const playerIds = snap.docs.map((d) => d.id);
  const nameMap = await readPublicPlayerNames(playerIds);
  const entries: DailyEntry[] = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data();
      const submittedAtRaw = data.submittedAt as
        | { toDate?: () => Date }
        | undefined;
      const displayName = nameMap.get(d.id) ?? null;
      return {
        playerId: d.id,
        name: displayName ?? data.name ?? "?",
        won: data.won ?? false,
        attempts: data.attempts ?? 0,
        maxAttempts: data.maxAttempts ?? 6,
        partial: data.partial === true,
        wordLetterCounts: data.wordLetterCounts ?? [],
        guessStates: ((data.guessStates as string[] | undefined) ?? []).map(
          (row) => row.split(","),
        ),
        submittedAt:
          typeof submittedAtRaw?.toDate === "function"
            ? submittedAtRaw.toDate()
            : null,
      };
    }),
  );

  entries.sort((a, b) => {
    // wins → fully lost → abandoned (partial)
    const statusA = a.won ? 0 : a.partial ? 2 : 1;
    const statusB = b.won ? 0 : b.partial ? 2 : 1;
    if (statusA !== statusB) return statusA - statusB;
    if (a.won && a.attempts !== b.attempts) return a.attempts - b.attempts; // fewer attempts better
    const ta = a.submittedAt?.getTime() ?? Infinity;
    const tb = b.submittedAt?.getTime() ?? Infinity;
    return ta - tb; // earliest first
  });

  return entries;
}

/** Agrège les entrées quotidiennes d'une liste de dates (semaine ou mois courant)
 *  en un classement par joueur : victoires → borne de Wilson → moyenne d'essais. */
export async function fetchPeriodLeaderboard(
  dates: string[],
): Promise<AllTimeEntry[]> {
  if (DEBUG) return debugAllTimeEntries();
  const { db, collection, getDocs } = await getFirestoreDeps();
  const snaps = await Promise.all(
    dates.map((date) => getDocs(collection(db, "daily", date, "entries"))),
  );

  const acc = new Map<string, AllTimeEntry>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      let entry = acc.get(d.id);
      if (!entry) {
        entry = {
          playerId: d.id,
          name: "?",
          gamesPlayed: 0,
          gamesWon: 0,
          totalAttempts: 0,
          gamesAbandoned: 0,
          isRanked: true,
        };
        acc.set(d.id, entry);
      }
      const data = d.data();
      if (data.partial === true) {
        entry.gamesAbandoned += 1;
        continue;
      }
      entry.gamesPlayed += 1;
      if (data.won === true) entry.gamesWon += 1;
      entry.totalAttempts +=
        typeof data.attempts === "number" ? data.attempts : 0;
    }
  }

  const entries = Array.from(acc.values()).filter((e) => e.gamesPlayed > 0);
  const nameMap = await readPublicPlayerNames(entries.map((e) => e.playerId));
  for (const entry of entries) {
    entry.name = nameMap.get(entry.playerId) ?? "?";
  }

  entries.sort((a, b) => {
    // Sur une période courte, le nombre brut de victoires prime.
    if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
    const wA = wilsonLowerBound(a.gamesWon, a.gamesPlayed);
    const wB = wilsonLowerBound(b.gamesWon, b.gamesPlayed);
    if (Math.abs(wB - wA) > 1e-9) return wB - wA;
    const avgA = a.gamesPlayed > 0 ? a.totalAttempts / a.gamesPlayed : Infinity;
    const avgB = b.gamesPlayed > 0 ? b.totalAttempts / b.gamesPlayed : Infinity;
    return avgA - avgB;
  });

  return entries;
}

/** Fetch all-time leaderboard, sorted client-side (most wins → best win-rate). */
export async function fetchAllTimeLeaderboard(): Promise<AllTimeEntry[]> {
  if (DEBUG) return debugAllTimeEntries();
  const { db, collection, getDocs } = await getFirestoreDeps();
  const snap = await getDocs(collection(db, "alltime"));
  const playerIds = snap.docs.map((d) => d.id);
  const nameMap = await readPublicPlayerNames(playerIds);
  const entries: AllTimeEntry[] = (
    await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();
        const displayName = nameMap.get(d.id) ?? null;
        return {
          playerId: d.id,
          name: displayName ?? "?",
          gamesPlayed: data.gamesPlayed ?? 0,
          gamesWon: data.gamesWon ?? 0,
          totalAttempts: data.totalAttempts ?? 0,
          gamesAbandoned: data.gamesAbandoned ?? 0,
          isRanked: false, // computed below
        };
      }),
    )
  ).filter((e) => e.gamesPlayed > 0);

  // Seuil d'affichage : minimum absolu de parties terminées pour être classé.
  const MIN_GAMES_FOR_RANKING = 3;
  for (const entry of entries) {
    entry.isRanked = entry.gamesPlayed >= MIN_GAMES_FOR_RANKING;
  }

  const compareCriteria = (a: AllTimeEntry, b: AllTimeEntry): number => {
    const wA = wilsonLowerBound(a.gamesWon, a.gamesPlayed);
    const wB = wilsonLowerBound(b.gamesWon, b.gamesPlayed);
    if (Math.abs(wB - wA) > 1e-9) return wB - wA;
    // Départage : gagner vite (moyenne d'essais croissante).
    const avgA = a.gamesPlayed > 0 ? a.totalAttempts / a.gamesPlayed : Infinity;
    const avgB = b.gamesPlayed > 0 ? b.totalAttempts / b.gamesPlayed : Infinity;
    return avgA - avgB;
  };

  entries.sort((a, b) => {
    // Ranked players always come before unranked.
    if (a.isRanked !== b.isRanked) return a.isRanked ? -1 : 1;
    return compareCriteria(a, b);
  });

  return entries;
}

/** Joueurs ayant au moins une partie non terminée, triés par nombre décroissant.
 *  Vue séparée du classement principal (qui ne montre que les parties finies). */
export async function fetchAbandonedAllTime(): Promise<AllTimeEntry[]> {
  if (DEBUG) return debugAbandonedEntries();
  const { db, collection, getDocs } = await getFirestoreDeps();
  const snap = await getDocs(collection(db, "alltime"));
  const playerIds = snap.docs.map((d) => d.id);
  const nameMap = await readPublicPlayerNames(playerIds);
  const entries: AllTimeEntry[] = snap.docs
    .map((d) => {
      const data = d.data();
      return {
        playerId: d.id,
        name: nameMap.get(d.id) ?? "?",
        gamesPlayed: data.gamesPlayed ?? 0,
        gamesWon: data.gamesWon ?? 0,
        totalAttempts: data.totalAttempts ?? 0,
        gamesAbandoned: data.gamesAbandoned ?? 0,
        isRanked: false,
      };
    })
    .filter((e) => e.gamesAbandoned > 0);
  entries.sort((a, b) => b.gamesAbandoned - a.gamesAbandoned);
  return entries;
}
