import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signOut, type User } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import {
  fetchAndActivate,
  getNumber,
  getRemoteConfig,
} from "firebase/remote-config";

const firebaseConfig = {
  apiKey: "AIzaSyDdug-eH4nxRHkYAZ_9IK--Y0NY_lzXX6g",
  authDomain: "figgordle-leaderboard.firebaseapp.com",
  projectId: "figgordle-leaderboard",
  storageBucket: "figgordle-leaderboard.firebasestorage.app",
  messagingSenderId: "402780747290",
  appId: "1:402780747290:web:3f204c80097d14bbd0c3a3",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Les réseaux/proxies d'entreprise (VPN, Zscaler…) cassent souvent le flux
// WebChannel temps réel de Firestore, ce qui provoque des connexions coupées et
// des écritures (commits) qui échouent. On laisse le SDK détecter ces
// environnements et basculer automatiquement en long-polling classique.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

// ─── Remote Config ────────────────────────────────────────────────────────────
export const remoteConfig = getRemoteConfig(app);
// Refresh at most once per hour in production
remoteConfig.settings.minimumFetchIntervalMillis = 3_600_000;
// Default values — used immediately while the fetch is in progress or if it fails
remoteConfig.defaultConfig = {
  unlock_hour: 10,
  unlock_minute: 0,
};

/**
 * Fetch & activate Remote Config, then return the unlock time.
 * `fromRemote` is true only if the network fetch actually succeeded.
 * Falls back silently to the default config on any error.
 */
export async function fetchUnlockConfig(): Promise<{
  hour: number;
  minute: number;
  fromRemote: boolean;
}> {
  let fromRemote = false;
  try {
    await fetchAndActivate(remoteConfig);
    fromRemote = true;
  } catch {
    // Network error, API not enabled, quota exceeded, etc. — use defaults
  }
  return {
    hour: getNumber(remoteConfig, "unlock_hour"),
    minute: getNumber(remoteConfig, "unlock_minute"),
    fromRemote,
  };
}

let authUserPromise: Promise<User> | null = null;

/** Ensure we have an anonymous Firebase user and return it. */
export async function ensureAnonymousUser(): Promise<User> {
  if (auth.currentUser) return auth.currentUser;

  if (!authUserPromise) {
    authUserPromise = signInAnonymously(auth)
      .then((cred) => cred.user)
      .finally(() => {
        authUserPromise = null;
      });
  }

  return authUserPromise;
}

export async function signOutAnonymousUser(): Promise<void> {
  await signOut(auth);
}
