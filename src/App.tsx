import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import Board from "./components/Board";
import WordHistory from "./components/GameHistory";
import GameOverlay from "./components/GameOverlay";
import Keyboard from "./components/Keyboard";
import Legend from "./components/Legend";
import Modal from "./components/Modal";
import PlayerSetupModal from "./components/PlayerSetupModal";
import Toast from "./components/Toast";
import {
  UNLOCK_HOUR,
  UNLOCK_MINUTE,
  getDailyWord,
  getSecondsUntilAvailable,
  isWordAvailable,
  isWeekendParis,
  loadState,
  saveState,
  saveWordToHistory,
  todayKey,
} from "./daily";
import {
  buildKeyStates,
  buildShareText,
  checkGuess,
  confirmedCorrectPositions,
} from "./gameLogic";
import {
  clearPendingSubmission,
  getWordLetterCounts,
  hasConsented,
  loadPlayerName,
  savePendingSubmission,
  savePlayerIdentity,
  submitDailyScore,
  warmAnonymousIdentity,
} from "./leaderboard";
import { isValidGuess, loadWordSet } from "./wordValidation";
import { DEBUG, debugPersistedState } from "./debug";

let leaderboardModulePromise: Promise<
  typeof import("./components/Leaderboard")
> | null = null;

function loadLeaderboardModule() {
  if (!leaderboardModulePromise) {
    leaderboardModulePromise = import("./components/Leaderboard");
  }
  return leaderboardModulePromise;
}

const Leaderboard = lazy(loadLeaderboardModule);

function LeaderboardLoading() {
  return (
    <div
      className="lb-loading-shell"
      role="status"
      aria-live="polite"
      aria-label="Chargement du classement"
    >
      <div className="lb-loading-head lb-stagger-1" />
      <div className="lb-loading-row lb-stagger-2" />
      <div className="lb-loading-row lb-stagger-3" />
      <div className="lb-loading-row lb-stagger-4" />
      <div className="lb-loading-row short lb-stagger-5" />
      <div className="lb-loading-bar lb-stagger-6" />
      <p className="lb-loading-text">Chargement du classement...</p>
    </div>
  );
}

/** Base attempts for a normal word; +2 when the word contains a space */
const BASE_ATTEMPTS = 6;
const SPACE_WORD_BONUS = 2;

/** Sentinel character for an unfilled tile position */
const EMPTY_CHAR = "\0";

/** Returns a fixed-length string with the revealed first letter, spaces from
 *  target, every confirmed-correct position pre-filled with its letter, and
 *  EMPTY_CHAR for every position still to fill. */
function makeBlankInput(targetWord: string, confirmed: Set<number>): string {
  return targetWord
    .split("")
    .map((ch, i) =>
      i === 0 || confirmed.has(i) ? ch : ch === " " ? " " : EMPTY_CHAR,
    )
    .join("");
}

/** Returns the first position still to fill (EMPTY_CHAR) in the built input.
 *  Falls back to the first editable non-space position if none remain. */
function initCursorPos(targetWord: string, input: string): number {
  for (let i = 1; i < targetWord.length; i++) {
    if (input[i] === EMPTY_CHAR) return i;
  }
  for (let i = 1; i < targetWord.length; i++) {
    if (targetWord[i] !== " ") return i;
  }
  return 1;
}

const KB_ROWS = [
  ["A", "Z", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["Q", "S", "D", "F", "G", "H", "J", "K", "L", "M"],
  ["ENTER", "W", "X", "C", "V", "B", "N", "⌫"],
] as const;

// ─── State ───────────────────────────────────────────────────────────────────

interface State {
  guesses: string[];
  /** Fixed-length string; EMPTY_CHAR marks unfilled positions. */
  currentInput: string;
  /** Index of the next editable position (the active cursor). */
  cursorPos: number;
  gameOver: boolean;
  won: boolean;
  toast: string | null;
  shakingRow: number | null;
}

type Action =
  | {
      type: "RESTORE";
      payload: { guesses: string[]; gameOver: boolean; won: boolean };
    }
  | { type: "TYPE"; letter: string; targetWord: string }
  | { type: "BACKSPACE"; targetWord: string }
  | { type: "SUBMIT"; targetWord: string; maxAttempts: number }
  | { type: "MOVE_CURSOR"; pos: number }
  | { type: "TOAST"; msg: string | null }
  | { type: "SHAKE"; row: number | null };

function init(targetWord: string): State {
  const saved = DEBUG ? debugPersistedState(targetWord) : loadState();
  const confirmed = confirmedCorrectPositions(saved?.guesses ?? [], targetWord);
  const blankInput = makeBlankInput(targetWord, confirmed);
  const initialCursor = initCursorPos(targetWord, blankInput);
  if (saved) {
    return {
      guesses: saved.guesses,
      currentInput: saved.gameOver ? "" : blankInput,
      cursorPos: saved.gameOver ? 0 : initialCursor,
      gameOver: saved.gameOver,
      won: saved.won,
      toast: null,
      shakingRow: null,
    };
  }
  return {
    guesses: [],
    currentInput: blankInput,
    cursorPos: initialCursor,
    gameOver: false,
    won: false,
    toast: null,
    shakingRow: null,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "RESTORE":
      return {
        ...state,
        guesses: action.payload.guesses,
        gameOver: action.payload.gameOver,
        won: action.payload.won,
      };

    case "TYPE": {
      if (state.gameOver) return state;
      const tw = action.targetWord;
      if (state.cursorPos >= tw.length) return state;
      // Overwrite letter at cursor position
      const chars = state.currentInput.split("");
      chars[state.cursorPos] = action.letter;
      // Advance cursor to next position to fill, skipping spaces and
      // confirmed-correct (green) cells so typing never clobbers a good letter.
      const confirmed = confirmedCorrectPositions(state.guesses, tw);
      let nextPos = state.cursorPos + 1;
      while (
        nextPos < tw.length &&
        (tw[nextPos] === " " || confirmed.has(nextPos))
      )
        nextPos++;
      return {
        ...state,
        currentInput: chars.join(""),
        cursorPos: Math.min(nextPos, tw.length),
      };
    }

    case "BACKSPACE": {
      if (state.gameOver) return state;
      const tw = action.targetWord;
      // Find previous editable position, skipping spaces and confirmed cells.
      const confirmed = confirmedCorrectPositions(state.guesses, tw);
      let prevPos = state.cursorPos - 1;
      while (
        prevPos > 0 &&
        (tw[prevPos] === " " || confirmed.has(prevPos))
      )
        prevPos--;
      if (prevPos < 1) return state; // can't erase the revealed first letter
      const chars = state.currentInput.split("");
      chars[prevPos] = EMPTY_CHAR;
      return { ...state, currentInput: chars.join(""), cursorPos: prevPos };
    }

    case "SUBMIT": {
      const won = state.currentInput === action.targetWord;
      const newGuesses = [...state.guesses, state.currentInput];
      const gameOver = won || newGuesses.length >= action.maxAttempts;
      // Pre-fill the next row with every position confirmed so far (incl. this guess).
      const confirmed = confirmedCorrectPositions(newGuesses, action.targetWord);
      const nextInput = makeBlankInput(action.targetWord, confirmed);
      return {
        ...state,
        guesses: newGuesses,
        currentInput: gameOver ? "" : nextInput,
        cursorPos: gameOver ? 0 : initCursorPos(action.targetWord, nextInput),
        gameOver,
        won,
        toast: null,
      };
    }

    case "MOVE_CURSOR": {
      if (state.gameOver) return state;
      return { ...state, cursorPos: action.pos };
    }

    case "TOAST":
      return { ...state, toast: action.msg };

    case "SHAKE":
      return { ...state, shakingRow: action.row };

    default:
      return state;
  }
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  // Unlock time — starts with local fallback, then overridden by Remote Config
  const [unlockHour, setUnlockHour] = useState(UNLOCK_HOUR);
  const [unlockMinute, setUnlockMinute] = useState(UNLOCK_MINUTE);
  const [configSource, setConfigSource] = useState<"fallback" | "remote">(
    "fallback",
  );

  // Fetch Remote Config once on mount
  useEffect(() => {
    // Dynamic import keeps Firebase out of the main bundle (lazy chunk).
    import("./firebase").then(({ fetchUnlockConfig }) =>
      fetchUnlockConfig().then(({ hour, minute, fromRemote }) => {
        setUnlockHour(hour);
        setUnlockMinute(minute);
        if (fromRemote) setConfigSource("remote");
      }),
    );
  }, []);

  const [wordAvailable, setWordAvailable] = useState(() =>
    isWordAvailable(UNLOCK_HOUR, UNLOCK_MINUTE),
  );
  const [secondsLeft, setSecondsLeft] = useState(() =>
    getSecondsUntilAvailable(UNLOCK_HOUR, UNLOCK_MINUTE),
  );

  // Tick every second: unlock at configured time, re-lock at midnight (Paris time)
  useEffect(() => {
    const id = setInterval(() => {
      setWordAvailable(isWordAvailable(unlockHour, unlockMinute));
      setSecondsLeft(getSecondsUntilAvailable(unlockHour, unlockMinute));
    }, 1000);
    return () => clearInterval(id);
  }, [unlockHour, unlockMinute]);

  // Immediately recheck when Remote Config values arrive
  useEffect(() => {
    setWordAvailable(isWordAvailable(unlockHour, unlockMinute));
    setSecondsLeft(getSecondsUntilAvailable(unlockHour, unlockMinute));
  }, [unlockHour, unlockMinute]);

  // Weekend flag (Saturday & Sunday in Paris) — early return happens AFTER all
  // hooks are declared, otherwise React hooks would be called conditionally.
  const weekend = isWeekendParis();

  const weekendScreen = (
      <div id="app">
        <header>
          <div className="header-inner">
            <h1>FIGGORDLE</h1>
          </div>
          <p className="subtitle">Devinez le terme Figgo du jour !</p>
          <p className={`unlock-badge unlock-badge--${configSource}`} title={configSource === "remote" ? "Heure chargée depuis Firebase Remote Config" : "Heure locale (fallback)"} aria-label={`Heure de déverrouillage : ${unlockHour}h${String(unlockMinute).padStart(2, "0")} ${configSource === "remote" ? "(Remote Config)" : "(fallback)"}`}>
            {configSource === "remote" ? "☁️" : "📴"} {unlockHour}h{String(unlockMinute).padStart(2, "0")}
          </p>
        </header>
        <main>
          <div className="maintenance-card">
            <div className="maintenance-icon">🛠️</div>
            <h2 className="maintenance-title">Maintenance du week‑end</h2>
            <p className="maintenance-desc">Le jeu est désactivé le samedi et le dimanche pour maintenance. Reprise lundi à <strong>{unlockHour}h{String(unlockMinute).padStart(2, "0")}</strong>.</p>
            <div className="maintenance-meta">
              <div className="meta-item">
                <div className="meta-label">Prochaine ouverture</div>
                <div className="meta-value">Lundi — {unlockHour}h{String(unlockMinute).padStart(2, "0")}</div>
              </div>
              <div className="meta-item">
                <div className="meta-label">Statut</div>
                <div className="meta-value status-closed">Fermé</div>
              </div>
            </div>
          </div>
        </main>
      </div>
  );

  const target = useRef(getDailyWord());
  const targetWord = target.current.word;
  const MAX_ATTEMPTS =
    BASE_ATTEMPTS + (targetWord.includes(" ") ? SPACE_WORD_BONUS : 0);

  // Date the game was loaded for — used to detect a stale tab left open
  // overnight (suspended timers) so yesterday's word can't be played today.
  const loadedDate = useRef(todayKey());

  const [state, dispatch] = useReducer(reducer, targetWord, init);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordSetRef = useRef<Awaited<ReturnType<typeof loadWordSet>>>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [overlayType, setOverlayType] = useState<"won" | "lost" | null>(null);
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);
  const [playerSetupVisible, setPlayerSetupVisible] = useState(false);
  const [playerName, setPlayerName] = useState<string | null>(null);
  // Mode debug : déclenche l'overlay de victoire "Julo" (minion Super Saiyan)
  const [debugJulo, setDebugJulo] = useState(false);
  const [playerNameLoaded, setPlayerNameLoaded] = useState(false);
  // Track whether this gameOver was already present when the page loaded
  const prevGameOver = useRef<boolean>(state.gameOver);
  const scoreSubmitStatus = useRef<"idle" | "pending" | "done">("idle");

  // Load the SUTOM dictionary for guess validation
  useEffect(() => {
    loadWordSet().then((set) => {
      wordSetRef.current = set;
    });
  }, []);

  // If player identity is configured, pre-warm anonymous auth in the background.
  useEffect(() => {
    loadPlayerName()
      .then((name) => setPlayerName(name))
      .catch(console.error)
      .finally(() => setPlayerNameLoaded(true));
  }, []);

  useEffect(() => {
    if (!playerName || !hasConsented()) return;
    warmAnonymousIdentity().catch(console.error);
  }, [playerName]);

  // Reload if the date changes while the page is open (e.g. left open overnight).
  // The interval alone is not enough: browsers freeze timers in suspended tabs,
  // which let players submit yesterday's word the next morning. Also check when
  // the tab becomes visible or focused again.
  useEffect(() => {
    const checkDate = () => {
      if (todayKey() !== loadedDate.current) {
        window.location.reload();
      }
    };
    const id = setInterval(checkDate, 60_000);
    document.addEventListener("visibilitychange", checkDate);
    window.addEventListener("focus", checkDate);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", checkDate);
      window.removeEventListener("focus", checkDate);
    };
  }, []);

  /** Submit to Firebase if the player has a name and hasn't submitted yet today. */
  const trySubmitScore = useCallback(
    (won: boolean, attempts: number, guesses: string[]) => {
      // Don't submit scores during weekend maintenance
      if (isWeekendParis()) return;
      const guessStates = guesses.map((g) =>
        checkGuess(g, targetWord).map(String),
      );
      const submissionParams = {
        date: loadedDate.current,
        won,
        attempts,
        maxAttempts: MAX_ATTEMPTS,
        wordLetterCounts: getWordLetterCounts(targetWord),
        guessStates,
        partial: false as const,
      };
      // Always persist locally so it can be submitted later if name isn't ready yet
      savePendingSubmission(submissionParams);

      if (
        !hasConsented() ||
        !playerName ||
        scoreSubmitStatus.current !== "idle"
      ) {
        return;
      }
      scoreSubmitStatus.current = "pending";
      submitDailyScore(submissionParams)
        .then(() => {
          scoreSubmitStatus.current = "done";
          clearPendingSubmission();
        })
        .catch((err) => {
          scoreSubmitStatus.current = "idle";
          console.error(err);
        });
    },
    [MAX_ATTEMPTS, playerName, targetWord],
  );

  // On mount: if game was already over (restored from save), show modal
  useEffect(() => {
    if (prevGameOver.current) {
      trySubmitScore(state.won, state.guesses.length, state.guesses);
      setModalVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry submission when player connects their identity after a completed game
  useEffect(() => {
    if (state.gameOver && playerName && scoreSubmitStatus.current === "idle") {
      trySubmitScore(state.won, state.guesses.length, state.guesses);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerName]);

  // After each guess (mid-game): submit a partial score to Firestore if connected.
  // This ensures abandoned games are recorded even if the player never returns.
  useEffect(() => {
    if (state.gameOver || state.guesses.length < 1) return;
    if (isWeekendParis()) return;
    if (!hasConsented() || !playerName) return;
    submitDailyScore({
      date: loadedDate.current,
      won: false,
      attempts: state.guesses.length,
      maxAttempts: MAX_ATTEMPTS,
      wordLetterCounts: getWordLetterCounts(targetWord),
      guessStates: state.guesses.map((g) =>
        checkGuess(g, targetWord).map(String),
      ),
      partial: true,
    }).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.guesses]);

  // When gameOver transitions false → true (fresh finish), play overlay and save to history
  useEffect(() => {
    let modalTimer: ReturnType<typeof setTimeout> | null = null;
    if (state.gameOver && !prevGameOver.current) {
      // Save to word history on Firebase (skip during weekend)
      if (!isWeekendParis()) {
        saveWordToHistory(loadedDate.current, targetWord);
      }

      trySubmitScore(state.won, state.guesses.length, state.guesses);
      setOverlayType(state.won ? "won" : "lost");
      setModalVisible(false);
      // Open the modal shortly after the animation starts
      modalTimer = setTimeout(
        () => setModalVisible(true),
        state.won ? 1200 : 3700,
      );
    }
    prevGameOver.current = state.gameOver;
    return () => {
      if (modalTimer) clearTimeout(modalTimer);
    };
  }, [state.gameOver, state.won, state.guesses.length, trySubmitScore]);

  // Persist on every change
  useEffect(() => {
    if (DEBUG) return; // mode debug : ne pas persister la fausse partie
    if (state.guesses.length > 0 || state.gameOver) {
      saveState({
        date: loadedDate.current,
        guesses: state.guesses,
        gameOver: state.gameOver,
        won: state.won,
      });
    }
  }, [state.guesses, state.gameOver, state.won]);

  const showToast = useCallback((msg: string, duration = 1800) => {
    dispatch({ type: "TOAST", msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => dispatch({ type: "TOAST", msg: null }),
      duration,
    );
  }, []);

  const shareResult = useCallback(() => {
    const d = new Date();
    const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    const text = buildShareText(state.guesses, targetWord, MAX_ATTEMPTS, label);
    navigator.clipboard.writeText(text).then(
      () => showToast("Résultat copié ! 📋"),
      () => showToast("Échec de la copie"),
    );
  }, [MAX_ATTEMPTS, showToast, state.guesses, targetWord]);

  const onTileClick = useCallback(
    (col: number) => {
      if (state.gameOver) return;
      if (col === 0 || targetWord[col] === " ") return;
      dispatch({ type: "MOVE_CURSOR", pos: col });
    },
    [state.gameOver, targetWord],
  );

  const handleKey = useCallback(
    (key: string) => {
      if (state.gameOver) return;

      if (key === "⌫" || key === "Backspace") {
        dispatch({ type: "BACKSPACE", targetWord });
        return;
      }

      if (key === "ArrowLeft") {
        const confirmed = confirmedCorrectPositions(state.guesses, targetWord);
        let pos = state.cursorPos - 1;
        while (pos > 0 && (targetWord[pos] === " " || confirmed.has(pos))) pos--;
        if (pos >= 1 && !confirmed.has(pos))
          dispatch({ type: "MOVE_CURSOR", pos });
        return;
      }

      if (key === "ArrowRight") {
        const confirmed = confirmedCorrectPositions(state.guesses, targetWord);
        let pos = state.cursorPos + 1;
        while (
          pos < targetWord.length &&
          (targetWord[pos] === " " || confirmed.has(pos))
        )
          pos++;
        if (pos < targetWord.length && !confirmed.has(pos))
          dispatch({ type: "MOVE_CURSOR", pos });
        return;
      }

      if (key === "ENTER" || key === "Enter") {
        // Stale tab guard: the target word belongs to the day the page was
        // loaded. If the date has changed since, reload instead of accepting
        // a guess against yesterday's word.
        if (todayKey() !== loadedDate.current) {
          window.location.reload();
          return;
        }
        if (state.currentInput.includes(EMPTY_CHAR)) {
          dispatch({ type: "SHAKE", row: state.guesses.length });
          setTimeout(() => dispatch({ type: "SHAKE", row: null }), 500);
          const letterCount = targetWord.replace(/ /g, "").length;
          showToast(`Le mot doit faire ${letterCount} lettres`);
          return;
        }
        if (!isValidGuess(state.currentInput, wordSetRef.current)) {
          dispatch({ type: "SHAKE", row: state.guesses.length });
          setTimeout(() => dispatch({ type: "SHAKE", row: null }), 500);
          showToast("Mot absent du dictionnaire");
          return;
        }
        if (state.guesses.includes(state.currentInput)) {
          dispatch({ type: "SHAKE", row: state.guesses.length });
          setTimeout(() => dispatch({ type: "SHAKE", row: null }), 500);
          showToast("Mot déjà proposé");
          return;
        }
        dispatch({ type: "SUBMIT", targetWord, maxAttempts: MAX_ATTEMPTS });
        return;
      }

      const letter = key.toUpperCase();
      if (/^[A-Z]$/.test(letter) && state.cursorPos < targetWord.length) {
        dispatch({ type: "TYPE", letter, targetWord });
      }
    },
    [
      state.gameOver,
      state.currentInput,
      state.cursorPos,
      state.guesses,
      targetWord,
      MAX_ATTEMPTS,
      showToast,
    ],
  );

  // Physical keyboard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Don't hijack keys while the user is typing in an input or textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      handleKey(e.key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  const keyStates = buildKeyStates(state.guesses, targetWord);

  const allGuessStates = state.guesses.map((g) => checkGuess(g, targetWord));

  // ── Weekend maintenance screen ──────────────────────────────────────────────
  if (weekend) {
    return weekendScreen;
  }

  // ── Countdown screen ────────────────────────────────────────────────────────
  if (!wordAvailable) {
    const pad = (n: number) => String(n).padStart(2, "0");
    const h = Math.floor(secondsLeft / 3600);
    const m = Math.floor((secondsLeft % 3600) / 60);
    const s = secondsLeft % 60;
    const isFinal = secondsLeft <= 10 && secondsLeft > 0;
    const intensityClass =
      secondsLeft === 1
        ? " cd-1"
        : secondsLeft === 2
          ? " cd-2"
          : secondsLeft === 3
            ? " cd-3"
            : "";
    const burstCount =
      secondsLeft === 1
        ? 24
        : secondsLeft === 2
          ? 18
          : secondsLeft === 3
            ? 14
            : 12;
    return (
      <div id="app">
        <header>
          <div className="header-inner">
            <h1>FIGGORDLE</h1>
          </div>
          <p className="subtitle">Devinez le terme Figgo du jour !</p>
          <p
            className={`unlock-badge unlock-badge--${configSource}`}
            title={
              configSource === "remote"
                ? "Heure chargée depuis Firebase Remote Config"
                : "Heure locale (fallback)"
            }
            aria-label={`Heure de déverrouillage : ${unlockHour}h${String(unlockMinute).padStart(2, "0")} ${configSource === "remote" ? "(Remote Config)" : "(fallback)"}`}
          >
            {configSource === "remote" ? "☁️" : "📴"} {unlockHour}h
            {String(unlockMinute).padStart(2, "0")}
          </p>
        </header>
        <main>
          <div
            className={`countdown-screen${isFinal ? " countdown-final" + intensityClass : ""}`}
          >
            <p className="countdown-label">
              {isFinal ? (
                <>
                  <strong>C'est pour dans…</strong>
                </>
              ) : (
                <>
                  Le mot du jour sera disponible à{" "}
                  <strong>
                    {unlockHour}h{String(unlockMinute).padStart(2, "0")}
                  </strong>
                </>
              )}
            </p>
            {isFinal ? (
              <div
                className="countdown-big"
                aria-live="assertive"
                aria-atomic="true"
              >
                <span key={secondsLeft} className="countdown-big-number">
                  {secondsLeft}
                </span>
              </div>
            ) : (
              <div
                className="countdown-timer"
                aria-live="polite"
                aria-atomic="true"
              >
                <span>{pad(h)}</span>
                <span className="countdown-sep">:</span>
                <span>{pad(m)}</span>
                <span className="countdown-sep">:</span>
                <span>{pad(s)}</span>
              </div>
            )}
            {isFinal && (
              <div className="countdown-burst">
                {Array.from({ length: burstCount }).map((_, i) => (
                  <span
                    key={i}
                    className="burst-particle"
                    style={{ "--i": i } as React.CSSProperties}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div id="app">
      <header>
        <div className="header-inner">
          <button
            className={[
              "header-leaderboard-btn",
              playerName
                ? "header-leaderboard-btn-connected"
                : "header-leaderboard-btn-invite",
              leaderboardVisible && playerName
                ? "header-leaderboard-btn-active"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onPointerEnter={loadLeaderboardModule}
            onFocus={loadLeaderboardModule}
            onClick={() => {
              if (!playerNameLoaded) return;
              if (!playerName) {
                setPlayerSetupVisible(true);
              } else {
                setLeaderboardVisible((v) => !v);
              }
            }}
            aria-label="Classement"
          >
            🏆 Classement
          </button>
          <h1>FIGGORDLE</h1>
        </div>
        <p className="subtitle">Devinez le terme Figgo du jour !</p>
        <p
          className={`unlock-badge unlock-badge--${configSource}`}
          title={
            configSource === "remote"
              ? "Heure chargée depuis Firebase Remote Config"
              : "Heure locale (fallback)"
          }
          aria-label={`Heure de déverrouillage : ${unlockHour}h${String(unlockMinute).padStart(2, "0")} ${configSource === "remote" ? "(Remote Config)" : "(fallback)"}`}
        >
          {configSource === "remote" ? "☁️" : "📴"} {unlockHour}h
          {String(unlockMinute).padStart(2, "0")}
        </p>
      </header>

      <Toast message={state.toast} />

      <main>
        <WordHistory visible={true} />
        
        <Legend />
        <Board
          targetWord={targetWord}
          guesses={state.guesses}
          guessStates={allGuessStates}
          currentInput={state.currentInput}
          cursorPos={state.cursorPos}
          maxAttempts={MAX_ATTEMPTS}
          shakingRow={state.shakingRow}
          gameOver={state.gameOver}
          onTileClick={onTileClick}
        />

        <Keyboard rows={KB_ROWS} keyStates={keyStates} onKey={handleKey} />

        {leaderboardVisible && playerName && (
          <>
            <div
              className="drawer-backdrop"
              onClick={() => setLeaderboardVisible(false)}
            />
            <div className="drawer">
              <div className="drawer-handle" />
              <button
                className="drawer-close"
                onClick={() => setLeaderboardVisible(false)}
                aria-label="Fermer"
              >
                ✕
              </button>
              <Suspense fallback={<LeaderboardLoading />}>
                <Leaderboard
                  gameOver={state.gameOver}
                  date={loadedDate.current}
                  playerName={playerName}
                  onPlayerNameChange={setPlayerName}
                  onOptOut={() => {
                    setPlayerName(null);
                    setLeaderboardVisible(false);
                  }}
                />
              </Suspense>
            </div>
          </>
        )}

        {state.gameOver && !modalVisible && (
          <div className="game-over-bar">
            <button onClick={() => setModalVisible(true)}>📊 Résultats</button>
            <button className="btn-secondary" onClick={shareResult}>
              📋 Partager
            </button>
          </div>
        )}
      </main>

      {overlayType && (
        <GameOverlay
          type={overlayType}
          onDone={() => setOverlayType(null)}
          playerName={playerName}
        />
      )}

      {DEBUG && !debugJulo && (
        <button
          className="debug-julo-btn"
          onClick={() => setDebugJulo(true)}
          title="Debug : déclencher l'animation de victoire de Julo"
        >
          ⚡ Julo
        </button>
      )}
      {debugJulo && (
        <GameOverlay
          type="won"
          playerName="Julo"
          onDone={() => setDebugJulo(false)}
        />
      )}

      {playerSetupVisible && (
        <PlayerSetupModal
          onConfirm={async (name) => {
            await savePlayerIdentity(name);
            setPlayerName(name);
            setPlayerSetupVisible(false);
            setLeaderboardVisible(true);
          }}
          onCancel={() => setPlayerSetupVisible(false)}
        />
      )}

      {state.gameOver && modalVisible && (
        <Modal
          won={state.won}
          target={target.current}
          attempts={state.guesses.length}
          guessStates={allGuessStates}
          maxAttempts={MAX_ATTEMPTS}
          onClose={() => setModalVisible(false)}
          onShare={shareResult}
        />
      )}
    </div>
  );
}
