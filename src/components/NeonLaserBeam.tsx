import React from "react";
import { cn } from "../lib/utils";

export interface NeonLaserBeamProps {
  /** Se o botão está ativo (selecionado). Se ativo, o feixe pode ficar sempre visível ou pulsante */
  active?: boolean;
  /** Se true, o feixe percorre continuamente mesmo sem hover */
  alwaysAnimate?: boolean;
  /** Cor temática do feixe de luz neon */
  accentColor?: "cyan" | "amber" | "purple" | "emerald";
  /** Classe de borda arredondada do botão para contenção precisa */
  roundedClass?: string;
  /** Se deve reagir ao passar o mouse com group-hover */
  showOnHover?: boolean;
}

export const NeonLaserBeam: React.FC<NeonLaserBeamProps> = ({
  active = false,
  alwaysAnimate = false,
  accentColor = "cyan",
  roundedClass = "rounded-2xl",
  showOnHover = true,
}) => {
  const colorConfigs = {
    cyan: {
      beamCore: "linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.2) 15%, rgba(34,211,238,0.95) 42%, #ffffff 50%, rgba(34,211,238,0.95) 58%, rgba(6,182,212,0.2) 85%, transparent 100%)",
      beamShadow: "0 0 16px #22d3ee, 0 0 32px #06b6d4",
      beamGlow: "linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.55) 50%, transparent 100%)",
      topRim: "via-cyan-300/60",
      ambientGlow: "rgba(6,182,212,0.25)",
    },
    amber: {
      beamCore: "linear-gradient(90deg, transparent 0%, rgba(245,158,11,0.2) 15%, rgba(251,191,36,0.95) 42%, #ffffff 50%, rgba(251,191,36,0.95) 58%, rgba(217,119,6,0.2) 85%, transparent 100%)",
      beamShadow: "0 0 16px #fbbf24, 0 0 32px #f59e0b",
      beamGlow: "linear-gradient(90deg, transparent 0%, rgba(245,158,11,0.55) 50%, transparent 100%)",
      topRim: "via-amber-300/60",
      ambientGlow: "rgba(245,158,11,0.25)",
    },
    purple: {
      beamCore: "linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.2) 15%, rgba(192,132,252,0.95) 42%, #ffffff 50%, rgba(192,132,252,0.95) 58%, rgba(147,51,234,0.2) 85%, transparent 100%)",
      beamShadow: "0 0 16px #c084fc, 0 0 32px #a855f7",
      beamGlow: "linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.55) 50%, transparent 100%)",
      topRim: "via-purple-300/60",
      ambientGlow: "rgba(168,85,247,0.25)",
    },
    emerald: {
      beamCore: "linear-gradient(90deg, transparent 0%, rgba(16,185,129,0.2) 15%, rgba(52,211,153,0.95) 42%, #ffffff 50%, rgba(52,211,153,0.95) 58%, rgba(5,150,105,0.2) 85%, transparent 100%)",
      beamShadow: "0 0 16px #34d399, 0 0 32px #10b981",
      beamGlow: "linear-gradient(90deg, transparent 0%, rgba(16,185,129,0.55) 50%, transparent 100%)",
      topRim: "via-emerald-300/60",
      ambientGlow: "rgba(16,185,129,0.25)",
    },
  };

  const config = colorConfigs[accentColor] || colorConfigs.cyan;
  const isVisible = alwaysAnimate || active;

  return (
    <div
      className={cn(
        "absolute inset-0 pointer-events-none overflow-hidden z-0 select-none",
        roundedClass
      )}
    >
      {/* Filete 3D superior chanfrado reflexivo */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent to-transparent pointer-events-none z-20 transition-opacity duration-300",
          config.topRim,
          isVisible
            ? "opacity-90"
            : showOnHover
            ? "opacity-0 group-hover:opacity-90"
            : "opacity-0"
        )}
      />

      {/* Filete 3D inferior reflexivo */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none z-20 transition-opacity duration-300",
          isVisible
            ? "opacity-60"
            : showOnHover
            ? "opacity-0 group-hover:opacity-60"
            : "opacity-0"
        )}
      />

      {/* Camada do Feixe de Laser Neon 3D */}
      <div
        className={cn(
          "absolute inset-0 pointer-events-none transition-opacity duration-300 z-10",
          isVisible
            ? "opacity-100"
            : showOnHover
            ? "opacity-0 group-hover:opacity-100"
            : "opacity-0"
        )}
      >
        {/* Feixe Principal Ultrabrilhante com Núcleo Laser Branco + Neon */}
        <div
          className="absolute -inset-y-4 w-16 pointer-events-none animate-neon-laser-sweep"
          style={{
            background: config.beamCore,
            boxShadow: config.beamShadow,
          }}
        />

        {/* Feixe Secundário Difuso (Glow Volumétrico 3D) */}
        <div
          className="absolute -inset-y-6 w-32 pointer-events-none animate-neon-laser-sweep"
          style={{
            background: config.beamGlow,
            filter: "blur(10px)",
            animationDelay: "0.04s",
          }}
        />
      </div>
    </div>
  );
};
