import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import Board from "./components/Board";
import GameOverlay from "./components/GameOverlay";
import Keyboard from "./components/Keyboard";
import Legend from "./components/Legend";
import Modal from "./components/Modal";
import StatsModal from "./components/StatsModal";
import Toast from "./components/Toast";
import { getDailyWord, loadState, saveState, todayKey } from "./daily";
import { buildKeyStates, buildShareText, checkGuess } from "./gameLogic";
import { recordResult } from "./stats";
import { isValidGuess, loadWordSet } from "./wordValidation";
/** Base attempts for a normal word; +2 when the word contains a space */
const BASE_ATTEMPTS = 6;
const SPACE_WORD_BONUS = 2;

/** Sentinel character for an unfilled tile position */
const EMPTY_CHAR = "\0";

/** Returns a fixed-length string with revealed first letter, spaces from target,
 *  and EMPTY_CHAR for every unfilled position. */
function makeBlankInput(targetWord: string): string {
  return targetWord
    .split("")
    .map((ch, i) => (i === 0 ? ch : ch === " " ? " " : EMPTY_CHAR))
    .join("");
}

/** Returns the first editable (non-space, non-first) position in the word. */
function initCursorPos(targetWord: string): number {
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
  const saved = loadState();
  const blankInput = makeBlankInput(targetWord);
  const initialCursor = initCursorPos(targetWord);
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
      // Advance cursor to next non-space position
      let nextPos = state.cursorPos + 1;
      while (nextPos < tw.length && tw[nextPos] === " ") nextPos++;
      return {
        ...state,
        currentInput: chars.join(""),
        cursorPos: Math.min(nextPos, tw.length),
      };
    }

    case "BACKSPACE": {
      if (state.gameOver) return state;
      const tw = action.targetWord;
      // Find previous editable (non-space) position
      let prevPos = state.cursorPos - 1;
      while (prevPos > 0 && tw[prevPos] === " ") prevPos--;
      if (prevPos < 1) return state; // can't erase the revealed first letter
      const chars = state.currentInput.split("");
      chars[prevPos] = EMPTY_CHAR;
      return { ...state, currentInput: chars.join(""), cursorPos: prevPos };
    }

    case "SUBMIT": {
      const won = state.currentInput === action.targetWord;
      const newGuesses = [...state.guesses, state.currentInput];
      const gameOver = won || newGuesses.length >= action.maxAttempts;
      return {
        ...state,
        guesses: newGuesses,
        currentInput: gameOver ? "" : makeBlankInput(action.targetWord),
        cursorPos: gameOver ? 0 : initCursorPos(action.targetWord),
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
  const target = useRef(getDailyWord());
  const targetWord = target.current.word;
  const MAX_ATTEMPTS =
    BASE_ATTEMPTS + (targetWord.includes(" ") ? SPACE_WORD_BONUS : 0);

  const [state, dispatch] = useReducer(reducer, targetWord, init);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordSetRef = useRef<Awaited<ReturnType<typeof loadWordSet>>>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [overlayType, setOverlayType] = useState<"won" | "lost" | null>(null);
  const [statsVisible, setStatsVisible] = useState(false);
  // Track whether this gameOver was already present when the page loaded
  const prevGameOver = useRef<boolean>(state.gameOver);

  // Load the SUTOM dictionary for guess validation
  useEffect(() => {
    loadWordSet().then((set) => {
      wordSetRef.current = set;
    });
  }, []);

  // On mount: if game was already over (restored from save), record stats + show modal
  useEffect(() => {
    if (prevGameOver.current) {
      recordResult(state.won, state.guesses.length);
      setModalVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When gameOver transitions false → true (fresh finish), record stats and play overlay
  useEffect(() => {
    if (state.gameOver && !prevGameOver.current) {
      recordResult(state.won, state.guesses.length);
      setOverlayType(state.won ? "won" : "lost");
      setModalVisible(false);
    }
    prevGameOver.current = state.gameOver;
  }, [state.gameOver, state.won, state.guesses.length]);

  // Persist on every change
  useEffect(() => {
    if (state.guesses.length > 0 || state.gameOver) {
      saveState({
        date: todayKey(),
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
        let pos = state.cursorPos - 1;
        while (pos > 0 && targetWord[pos] === " ") pos--;
        if (pos >= 1) dispatch({ type: "MOVE_CURSOR", pos });
        return;
      }

      if (key === "ArrowRight") {
        let pos = state.cursorPos + 1;
        while (pos < targetWord.length && targetWord[pos] === " ") pos++;
        if (pos < targetWord.length) dispatch({ type: "MOVE_CURSOR", pos });
        return;
      }

      if (key === "ENTER" || key === "Enter") {
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
      state.guesses.length,
      targetWord,
      MAX_ATTEMPTS,
      showToast,
    ],
  );

  // Physical keyboard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      handleKey(e.key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  const keyStates = buildKeyStates(state.guesses, targetWord);

  const allGuessStates = state.guesses.map((g) => checkGuess(g, targetWord));

  return (
    <div id="app">
      <header>
        <div className="header-inner">
          <h1>FIGGORDLE</h1>
          <button
            className="header-stats-btn"
            onClick={() => setStatsVisible(true)}
            aria-label="Statistiques"
          >
            📊
          </button>
        </div>
        <p className="subtitle">Devinez le terme Figgo du jour !</p>
      </header>

      <Toast message={state.toast} />

      <main>
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

        <Keyboard
          rows={KB_ROWS as unknown as string[][]}
          keyStates={keyStates}
          onKey={handleKey}
        />

        {state.gameOver && !modalVisible && (
          <div className="game-over-bar">
            <button onClick={() => setModalVisible(true)}>📊 Résultats</button>
            <button
              className="btn-secondary"
              onClick={() => {
                const d = new Date();
                const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
                const text = buildShareText(
                  state.guesses,
                  targetWord,
                  MAX_ATTEMPTS,
                  label,
                );
                navigator.clipboard.writeText(text).then(
                  () => showToast("Résultat copié ! 📋"),
                  () => showToast("Échec de la copie"),
                );
              }}
            >
              📋 Partager
            </button>
          </div>
        )}
      </main>

      {overlayType && (
        <GameOverlay
          type={overlayType}
          onDone={() => {
            setOverlayType(null);
            setModalVisible(true);
          }}
        />
      )}

      {statsVisible && (
        <StatsModal
          maxAttempts={MAX_ATTEMPTS}
          onClose={() => setStatsVisible(false)}
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
          onShare={() => {
            const d = new Date();
            const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
            const text = buildShareText(
              state.guesses,
              targetWord,
              MAX_ATTEMPTS,
              label,
            );
            navigator.clipboard.writeText(text).then(
              () => showToast("Résultat copié ! 📋"),
              () => showToast("Échec de la copie"),
            );
          }}
        />
      )}
    </div>
  );
}
