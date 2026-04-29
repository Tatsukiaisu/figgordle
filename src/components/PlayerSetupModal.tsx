import { useRef, useState } from "react";

interface Props {
  /** Called when the user confirms with a non-empty name. */
  onConfirm: (name: string) => void;
  /** Called when the user declines / closes without saving. */
  onCancel: () => void;
}

export default function PlayerSetupModal({ onConfirm, onCancel }: Props) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= 20;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm(trimmed);
  }

  return (
    <div className="ps-overlay" onClick={onCancel}>
      <div
        className="ps-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ps-title"
      >
        <button className="modal-close" onClick={onCancel} aria-label="Fermer">
          ✕
        </button>

        <h2 id="ps-title" className="ps-title">
          🏆 Rejoindre le classement
        </h2>

        <p className="ps-desc">
          Choisissez un pseudo pour apparaître dans les classements quotidien et
          global.
        </p>

        <form onSubmit={handleSubmit} className="ps-form">
          <label htmlFor="ps-name-input" className="ps-label">
            Votre pseudo
          </label>
          <input
            ref={inputRef}
            id="ps-name-input"
            type="text"
            className="ps-input"
            placeholder="Max 20 caractères"
            maxLength={20}
            value={name}
            autoComplete="off"
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />

          <div className="ps-consent">
            <p className="ps-consent-title">🔒 Protection des données (RGPD)</p>
            <p>
              En participant, vous acceptez que votre <strong>pseudo</strong> et
              vos <strong>résultats de jeu</strong> (victoire/défaite, nombre
              d'essais, date) soient enregistrés et affichés publiquement.
            </p>
            <p>
              Aucune donnée personnelle identifiable n'est collectée. Vous
              pouvez retirer votre participation à tout moment depuis le
              classement.
            </p>
          </div>

          <button
            type="submit"
            className="ps-btn-confirm"
            disabled={!canSubmit}
          >
            Participer
          </button>
        </form>

        <button className="ps-btn-skip" onClick={onCancel}>
          Non merci, continuer sans classement
        </button>
      </div>
    </div>
  );
}
