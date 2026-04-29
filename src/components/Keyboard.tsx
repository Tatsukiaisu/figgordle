import type { TileState } from "../gameLogic";

interface Props {
  rows: string[][];
  keyStates: Map<string, TileState>;
  onKey: (key: string) => void;
}

export default function Keyboard({ rows, keyStates, onKey }: Props) {
  return (
    <div id="keyboard">
      {rows.map((row, r) => (
        <div key={r} className="kb-row">
          {row.map((k) => (
            <button
              key={k}
              className={`kb-key${k === "ENTER" || k === "⌫" ? " kb-wide" : ""}`}
              data-state={keyStates.get(k) ?? undefined}
              onPointerDown={(e) => {
                e.preventDefault(); // prevent mobile double-fire
                onKey(k);
              }}
            >
              {k}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
