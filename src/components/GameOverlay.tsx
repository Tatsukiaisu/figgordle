import { useEffect, useRef } from "react";

interface Props {
  type: "won" | "lost";
  onDone: () => void;
}

// ─── Confetti (win) ──────────────────────────────────────────────────────────

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  life: number;
};

const CONFETTI_COLORS = [
  "#6B76D2",
  "#161E5A",
  "#B3BED1",
  "#a0aaf0",
  "#ffffff",
  "#ffd700",
];
const CONFETTI_DURATION = 3200; // ms

function runConfetti(canvas: HTMLCanvasElement, onDone: () => void) {
  const ctx = canvas.getContext("2d")!;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles: Particle[] = [];

  // Burst from center-top in two arcs
  for (let i = 0; i < 180; i++) {
    const angle = Math.random() * Math.PI + Math.PI; // downward spread
    const speed = 4 + Math.random() * 10;
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 120,
      y: canvas.height * 0.3,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,
      color:
        CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 6 + Math.random() * 8,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.25,
      life: 1,
    });
  }

  const start = performance.now();
  let rafId: number;

  function frame(now: number) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.vy += 0.18; // gravity
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.life = Math.max(0, 1 - elapsed / CONFETTI_DURATION);

      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }

    if (elapsed < CONFETTI_DURATION) {
      rafId = requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      onDone();
    }
  }

  rafId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(rafId);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GameOverlay({ type, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (type === "won" && canvasRef.current) {
      return runConfetti(canvasRef.current, onDone);
    }
    if (type === "lost") {
      // CSS animation duration is 3.6s (see style.css .souls-*)
      const id = setTimeout(onDone, 3600);
      return () => clearTimeout(id);
    }
  }, [type, onDone]);

  if (type === "won") {
    return (
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 500,
        }}
      />
    );
  }

  // "YOU DIED" — Dark Souls style
  return (
    <div className="souls-overlay" aria-live="assertive">
      <div className="souls-content">
        <div className="souls-line" />
        <p className="souls-text">ERREUR 404 : MOT INTROUVABLE</p>
        <div className="souls-line" />
      </div>
    </div>
  );
}
