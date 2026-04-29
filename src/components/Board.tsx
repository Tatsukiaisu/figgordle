import { useEffect, useRef } from "react";
import type { TileState } from "../gameLogic";

const EMPTY_CHAR = "\0";

interface Props {
  targetWord: string;
  guesses: string[];
  guessStates: TileState[][];
  currentInput: string;
  cursorPos: number;
  maxAttempts: number;
  shakingRow: number | null;
  gameOver: boolean;
  onTileClick: (col: number) => void;
}

export default function Board({
  targetWord,
  guesses,
  guessStates,
  currentInput,
  cursorPos,
  maxAttempts,
  shakingRow,
  gameOver,
  onTileClick,
}: Props) {
  const len = targetWord.length;
  const sizeClass =
    len <= 7 ? "normal" : len <= 9 ? "compact" : len <= 12 ? "small" : "xsmall";

  const rows = Array.from({ length: maxAttempts }, (_, r) => {
    const isSubmitted = r < guesses.length;
    const isCurrent = r === guesses.length && !gameOver;

    const tiles = Array.from({ length: len }, (_, c) => {
      let letter = "";
      let state: TileState = "empty";
      let isCursor = false;

      if (targetWord[c] === " ") {
        state = "space";
      } else if (isSubmitted) {
        letter = guesses[r][c];
        state = guessStates[r][c];
      } else if (isCurrent) {
        if (c === 0) {
          letter = targetWord[0];
          state = "revealed";
        } else if (currentInput[c] && currentInput[c] !== EMPTY_CHAR) {
          letter = currentInput[c];
          state = "tbd";
        }
        isCursor = c === cursorPos;
      }

      return { letter, state, isCursor, key: c };
    });

    return { tiles, isShaking: shakingRow === r, isCurrent, key: r };
  });

  return (
    <div id="board" data-size={sizeClass}>
      {rows.map((row) => (
        <div key={row.key} className={`row${row.isShaking ? " shake" : ""}`}>
          {row.tiles.map((tile) => (
            <Tile
              key={tile.key}
              letter={tile.letter}
              state={tile.state}
              isCursor={tile.isCursor}
              onClick={
                row.isCurrent && tile.state !== "space" && tile.key !== 0
                  ? () => onTileClick(tile.key)
                  : undefined
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface TileProps {
  letter: string;
  state: TileState;
  isCursor: boolean;
  onClick?: () => void;
}

function Tile({ letter, state, isCursor, onClick }: TileProps) {
  const prev = useRef<string>("");
  const el = useRef<HTMLDivElement>(null);

  // Pop animation when a new letter is typed (always called before any early return)
  useEffect(() => {
    if (state === "tbd" && letter && letter !== prev.current && el.current) {
      const node = el.current;
      node.classList.remove("pop");
      void node.offsetWidth;
      node.classList.add("pop");
      node.addEventListener(
        "animationend",
        () => node.classList.remove("pop"),
        { once: true },
      );
    }
    prev.current = letter;
  }, [letter, state]);

  if (state === "space") {
    return <div className="tile" data-state="space" aria-hidden="true" />;
  }

  return (
    <div
      ref={el}
      className={`tile${isCursor ? " cursor" : ""}`}
      data-state={state}
      onClick={onClick}
      style={onClick ? { cursor: "pointer" } : undefined}
    >
      {letter}
    </div>
  );
}
