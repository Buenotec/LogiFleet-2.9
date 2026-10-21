import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Sparkles,
  Zap,
  Layers,
  ArrowLeft,
  ArrowRight
} from "lucide-react";
import { cn } from "../lib/utils";

interface SidebarToggleButton3DProps {
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

export const SidebarToggleButton3D: React.FC<SidebarToggleButton3DProps> = ({
  isOpen,
  onToggle,
  className
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className={cn("relative select-none", className)}>
      {/* Botão Principal com Efeito 3D e Neon */}
      <motion.button
        id="btn-sidebar-toggle-3d"
        type="button"
        onClick={onToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={cn(
          "group relative flex items-center justify-center rounded-2xl cursor-pointer overflow-hidden transition-all duration-300",
          "border shadow-lg",
          isOpen ? "w-full py-2.5 px-3.5" : "w-11 h-11 mx-auto",
          /* Estilo 3D Neon Dark/Light */
          "bg-gradient-to-r from-slate-900 via-indigo-950/80 to-slate-900",
          "hover:from-indigo-950 hover:via-blue-950 hover:to-slate-900",
          "border-cyan-500/40 hover:border-cyan-400",
          "shadow-[0_4px_20px_-4px_rgba(6,182,212,0.25),inset_0_1px_1px_rgba(255,255,255,0.15)]",
          "hover:shadow-[0_0_25px_rgba(6,182,212,0.5),inset_0_0_15px_rgba(59,130,246,0.3)]"
        )}
      >
        {/* Glow de Fundo e Feixe Neon Animado */}
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/15 to-purple-500/10 opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none" />
        
        {/* Linha Neon Superior com Efeito Laser */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-60 group-hover:opacity-100 transition-opacity" />

        {/* Linha Neon Inferior */}
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-40 group-hover:opacity-80 transition-opacity" />

        {/* Conteúdo do Botão quando EXPANDIDO */}
        {isOpen ? (
          <div className="relative z-10 flex items-center justify-between w-full">
            {/* Ícone com Setas Animadas para Trás (Esquerda / Recolher) */}
            <div className="flex items-center gap-2">
              <div className="relative w-7 h-7 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.4)]">
                {/* Feixe Pulsante */}
                <motion.div
                  animate={{ 
                    x: [0, -3, 0],
                    opacity: [0.7, 1, 0.7]
                  }}
                  transition={{ 
                    duration: 1.4, 
                    repeat: Infinity, 
                    ease: "easeInOut" 
                  }}
                  className="flex items-center justify-center"
                >
                  <ChevronsLeft size={16} className="text-cyan-300 drop-shadow-[0_0_6px_rgba(6,182,212,0.8)]" />
                </motion.div>
                <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-cyan-400/60 blur-[2px]" />
              </div>

              <div className="flex flex-col text-left">
                <span className="text-[11px] font-black uppercase tracking-widest text-cyan-200 group-hover:text-white drop-shadow-[0_0_8px_rgba(6,182,212,0.5)] transition-colors">
                  Recolher Menu
                </span>
                <span className="text-[9px] font-mono font-semibold text-cyan-400/70 tracking-wider">
                  MODO COMPACTO
                </span>
              </div>
            </div>

            {/* Indicador Cyber 3D Lateral */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-[9px] font-mono font-bold text-cyan-300 shadow-inner">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_#22d3ee]" />
              <span>HUD</span>
            </div>
          </div>
        ) : (
          /* Conteúdo do Botão quando RECOLHIDO / COMPACTO */
          <div className="relative z-10 flex items-center justify-center w-full h-full">
            {/* Ícone com Setas Animadas para Frente (Direita / Expandir) */}
            <motion.div
              animate={{ 
                x: [0, 3, 0],
                opacity: [0.8, 1, 0.8]
              }}
              transition={{ 
                duration: 1.4, 
                repeat: Infinity, 
                ease: "easeInOut" 
              }}
              className="flex items-center justify-center text-cyan-300"
            >
              <ChevronsRight 
                size={20} 
                className="text-cyan-300 drop-shadow-[0_0_8px_rgba(6,182,212,0.9)] group-hover:text-white transition-colors" 
              />
            </motion.div>
            
            {/* Ponto de Glow Neon */}
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400 animate-ping opacity-60" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_6px_#22d3ee]" />
          </div>
        )}
      </motion.button>

      {/* TOOLTIP 3D FUTURISTA & NEON */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: isOpen ? 8 : 0, x: isOpen ? 0 : 8 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: isOpen ? 6 : 0, x: isOpen ? 0 : 6 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            className={cn(
              "absolute z-[100] pointer-events-none whitespace-nowrap",
              isOpen 
                ? "bottom-full left-1/2 -translate-x-1/2 mb-3" 
                : "left-full top-1/2 -translate-y-1/2 ml-3"
            )}
          >
            {/* Container 3D HUD Tooltip */}
            <div className="relative p-3 rounded-2xl bg-[#080d1a]/95 backdrop-blur-xl border border-cyan-400/50 shadow-[0_15px_35px_-5px_rgba(0,0,0,0.8),0_0_25px_rgba(6,182,212,0.4),inset_0_1px_1px_rgba(255,255,255,0.2)] text-white overflow-hidden">
              {/* Efeito Glow Interno */}
              <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-cyan-500/20 rounded-full blur-xl pointer-events-none" />
              <div className="absolute -left-8 -top-8 w-24 h-24 bg-blue-500/20 rounded-full blur-xl pointer-events-none" />

              {/* Linha Neon Laser no Topo do Tooltip */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_8px_#22d3ee]" />

              <div className="relative z-10 flex items-center gap-3">
                {/* Ícone 3D no Tooltip */}
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.5)]">
                  {isOpen ? (
                    <motion.div animate={{ x: [-2, 0, -2] }} transition={{ repeat: Infinity, duration: 1 }}>
                      <ArrowLeft size={16} className="text-cyan-300" />
                    </motion.div>
                  ) : (
                    <motion.div animate={{ x: [0, 2, 0] }} transition={{ repeat: Infinity, duration: 1 }}>
                      <ArrowRight size={16} className="text-cyan-300" />
                    </motion.div>
                  )}
                </div>

                {/* Textos Informativos */}
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-display font-black tracking-wider uppercase text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]">
                      {isOpen ? "Recolher Navegação" : "Expandir Navegação"}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-black bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_6px_rgba(6,182,212,0.4)]">
                      {isOpen ? "COMPACT" : "FULL HUD"}
                    </span>
                  </div>

                  <p className="text-[10px] text-cyan-200/80 font-medium tracking-wide">
                    {isOpen 
                      ? "Oculta o menu lateral para ampliar a área de visualização" 
                      : "Abre o menu completo com títulos, filtros e navegação"}
                  </p>
                </div>
              </div>

              {/* Rodapé do Tooltip com Status e Tecla */}
              <div className="mt-2 pt-2 border-t border-cyan-500/20 flex items-center justify-between text-[9px] font-mono text-cyan-300/70">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_#34d399]" />
                  Sistema Ativo
                </span>
                <span className="text-cyan-400/90 font-bold">
                  Clique para {isOpen ? "Recuar (←)" : "Expandir (→)"}
                </span>
              </div>
            </div>

            {/* Triângulo / Seta do Tooltip */}
            {isOpen ? (
              <div className="w-3 h-3 bg-[#080d1a] border-r border-b border-cyan-400/50 transform rotate-45 mx-auto -mt-1.5 shadow-[0_4px_6px_rgba(0,0,0,0.5)]" />
            ) : (
              <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-[#080d1a] border-l border-b border-cyan-400/50 transform rotate-45 shadow-[-4px_4px_6px_rgba(0,0,0,0.5)]" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
