import React from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";

interface PortalTooltipProps {
  isOpen: boolean;
  coords: { top: number; left: number };
  children: React.ReactNode;
  accentColor?: "cyan" | "amber" | "purple" | "emerald";
}

export const PortalTooltip: React.FC<PortalTooltipProps> = ({
  isOpen,
  coords,
  children,
  accentColor = "cyan"
}) => {
  if (!isOpen || typeof document === "undefined" || !coords.top) return null;

  // Configurações de cores de borda e feixes neon 3D
  const colorConfigs = {
    cyan: {
      border: "border-cyan-400/60",
      shadow: "shadow-[0_12px_32px_-6px_rgba(0,0,0,0.9),0_0_24px_rgba(6,182,212,0.45),inset_0_1px_1px_rgba(255,255,255,0.25)]",
      beamCore: "linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.2) 15%, rgba(34,211,238,0.9) 40%, #ffffff 50%, rgba(34,211,238,0.9) 60%, rgba(6,182,212,0.2) 85%, transparent 100%)",
      beamShadow: "0 0 16px #22d3ee, 0 0 32px #06b6d4",
      beamGlow: "linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.45) 50%, transparent 100%)",
      topRim: "via-cyan-200/50",
      arrowBg: "bg-[#070b16]",
    },
    amber: {
      border: "border-amber-400/60",
      shadow: "shadow-[0_12px_32px_-6px_rgba(0,0,0,0.9),0_0_24px_rgba(245,158,11,0.45),inset_0_1px_1px_rgba(255,255,255,0.25)]",
      beamCore: "linear-gradient(90deg, transparent 0%, rgba(245,158,11,0.2) 15%, rgba(251,191,36,0.9) 40%, #ffffff 50%, rgba(251,191,36,0.9) 60%, rgba(217,119,6,0.2) 85%, transparent 100%)",
      beamShadow: "0 0 16px #fbbf24, 0 0 32px #f59e0b",
      beamGlow: "linear-gradient(90deg, transparent 0%, rgba(245,158,11,0.45) 50%, transparent 100%)",
      topRim: "via-amber-200/50",
      arrowBg: "bg-[#070b16]",
    },
    purple: {
      border: "border-purple-400/60",
      shadow: "shadow-[0_12px_32px_-6px_rgba(0,0,0,0.9),0_0_24px_rgba(168,85,247,0.45),inset_0_1px_1px_rgba(255,255,255,0.25)]",
      beamCore: "linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.2) 15%, rgba(192,132,252,0.9) 40%, #ffffff 50%, rgba(192,132,252,0.9) 60%, rgba(147,51,234,0.2) 85%, transparent 100%)",
      beamShadow: "0 0 16px #c084fc, 0 0 32px #a855f7",
      beamGlow: "linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.45) 50%, transparent 100%)",
      topRim: "via-purple-200/50",
      arrowBg: "bg-[#070b16]",
    },
    emerald: {
      border: "border-emerald-400/60",
      shadow: "shadow-[0_12px_32px_-6px_rgba(0,0,0,0.9),0_0_24px_rgba(16,185,129,0.45),inset_0_1px_1px_rgba(255,255,255,0.25)]",
      beamCore: "linear-gradient(90deg, transparent 0%, rgba(16,185,129,0.2) 15%, rgba(52,211,153,0.9) 40%, #ffffff 50%, rgba(52,211,153,0.9) 60%, rgba(5,150,105,0.2) 85%, transparent 100%)",
      beamShadow: "0 0 16px #34d399, 0 0 32px #10b981",
      beamGlow: "linear-gradient(90deg, transparent 0%, rgba(16,185,129,0.45) 50%, transparent 100%)",
      topRim: "via-emerald-200/50",
      arrowBg: "bg-[#070b16]",
    },
  };

  const config = colorConfigs[accentColor] || colorConfigs.cyan;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        transform: "translateY(-50%)",
        zIndex: 99999,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        perspective: "800px"
      }}
      className="animate-in fade-in zoom-in-95 duration-150 select-none"
    >
      {/* Container Holográfico 3D */}
      <div
        className={cn(
          "relative py-2 px-3.5 rounded-xl bg-[#060a14]/95 backdrop-blur-2xl border text-white flex items-center gap-2.5 overflow-hidden",
          config.border,
          config.shadow
        )}
      >
        {/* Filete reflexivo chanfrado superior 3D */}
        <div 
          className={cn(
            "absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent to-transparent pointer-events-none z-20",
            config.topRim
          )} 
        />

        {/* Filete reflexivo inferior 3D */}
        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none z-20" />

        {/* Camada da Animação do Feixe de Luz Neon 3D */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl z-10">
          {/* Feixe Primário Ultrabrilhante com Núcleo Laser Branco + Neon */}
          <div
            className="absolute -inset-y-3 w-12 pointer-events-none animate-neon-laser-sweep"
            style={{
              background: config.beamCore,
              boxShadow: config.beamShadow,
            }}
          />

          {/* Feixe Secundário Difuso (Glow Volumétrico 3D que viaja junto) */}
          <div
            className="absolute -inset-y-4 w-24 pointer-events-none opacity-60 animate-neon-laser-sweep"
            style={{
              background: config.beamGlow,
              filter: "blur(8px)",
              animationDelay: "0.04s",
            }}
          />
        </div>

        {/* Conteúdo do Tooltip (Posicionado acima do feixe de luz) */}
        <div className="relative z-20 flex items-center gap-2.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          {children}
        </div>
      </div>

      {/* Micro seta apontando em direção ao botão do menu lateral */}
      <div
        className={cn(
          "absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 border-l border-b transform rotate-45 z-20",
          config.arrowBg,
          config.border
        )}
      />
    </div>,
    document.body
  );
};
