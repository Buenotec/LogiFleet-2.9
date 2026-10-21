import React, { useRef, useState, useEffect } from 'react';
import { motion, useSpring } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';

export type Stat3DVariant = 'cyan' | 'blue' | 'emerald' | 'amber' | 'rose' | 'default' | 'warning' | 'danger';

export interface StatCard3DProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  variant?: Stat3DVariant;
  trend?: string;
  badge?: {
    text: string;
    subtext?: string;
    icon?: React.ReactNode;
  };
  description?: string;
  actionLabel?: string;
  onActionClick?: () => void;
  index?: number;
  isIsometric?: boolean;
}

const variantStyles: Record<string, {
  border: string;
  borderHover: string;
  boxGlow: string;
  titleColor: string;
  actionColor: string;
  sheenStroke: string;
  sheenGlow: string;
  sheenFill: string;
  iconBg: string;
  iconBorder: string;
  iconColor: string;
  waveColor: string;
  waveGlow: string;
  accentDot: string;
  pillBg: string;
  pillBorder: string;
  pillText: string;
  path: string;
  nodeX: number;
  nodeY: number;
}> = {
  cyan: {
    border: 'border-cyan-500/40 dark:border-cyan-400/45',
    borderHover: 'hover:border-cyan-300 dark:hover:border-cyan-200',
    boxGlow: 'rgba(6, 182, 212, 0.35)',
    titleColor: 'text-cyan-400 dark:text-cyan-300 drop-shadow-[0_0_10px_rgba(6,182,212,0.4)]',
    actionColor: 'text-cyan-400 hover:text-cyan-300 group-hover:text-cyan-300',
    sheenStroke: '#38bdf8',
    sheenGlow: 'rgba(56, 189, 248, 0.8)',
    sheenFill: 'rgba(56, 189, 248, 0.14)',
    iconBg: 'bg-[#0a1b2e]/80 dark:bg-[#071728]/90',
    iconBorder: 'border-cyan-400/60 shadow-[0_0_16px_rgba(6,182,212,0.5)]',
    iconColor: 'text-cyan-400 dark:text-cyan-300',
    waveColor: '#22d3ee',
    waveGlow: 'rgba(6, 182, 212, 0.75)',
    accentDot: '#67e8f9',
    pillBg: 'bg-[#061826]/90 dark:bg-[#04121d]/90',
    pillBorder: 'border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.3)]',
    pillText: 'text-cyan-300 dark:text-cyan-200',
    path: 'M 0,72 C 45,68 75,40 120,30 C 165,20 200,14 280,10',
    nodeX: 200,
    nodeY: 14
  },
  blue: {
    border: 'border-blue-500/40 dark:border-blue-400/45',
    borderHover: 'hover:border-blue-300 dark:hover:border-blue-200',
    boxGlow: 'rgba(59, 130, 246, 0.35)',
    titleColor: 'text-blue-400 dark:text-blue-300 drop-shadow-[0_0_10px_rgba(59,130,246,0.4)]',
    actionColor: 'text-blue-400 hover:text-blue-300 group-hover:text-blue-300',
    sheenStroke: '#60a5fa',
    sheenGlow: 'rgba(96, 165, 250, 0.8)',
    sheenFill: 'rgba(96, 165, 250, 0.14)',
    iconBg: 'bg-[#0d1c38]/80 dark:bg-[#09152b]/90',
    iconBorder: 'border-blue-400/60 shadow-[0_0_16px_rgba(59,130,246,0.5)]',
    iconColor: 'text-blue-400 dark:text-blue-300',
    waveColor: '#60a5fa',
    waveGlow: 'rgba(59, 130, 246, 0.75)',
    accentDot: '#93c5fd',
    pillBg: 'bg-[#08162b]/90 dark:bg-[#050f20]/90',
    pillBorder: 'border-blue-500/50 shadow-[0_0_12px_rgba(59,130,246,0.3)]',
    pillText: 'text-blue-300 dark:text-blue-200',
    path: 'M 0,74 C 40,76 75,55 110,34 C 150,12 185,26 280,38',
    nodeX: 185,
    nodeY: 26
  },
  emerald: {
    border: 'border-emerald-500/40 dark:border-emerald-400/45',
    borderHover: 'hover:border-emerald-300 dark:hover:border-emerald-200',
    boxGlow: 'rgba(16, 185, 129, 0.35)',
    titleColor: 'text-emerald-400 dark:text-emerald-300 drop-shadow-[0_0_10px_rgba(16,185,129,0.4)]',
    actionColor: 'text-emerald-400 hover:text-emerald-300 group-hover:text-emerald-300',
    sheenStroke: '#34d399',
    sheenGlow: 'rgba(52, 211, 153, 0.8)',
    sheenFill: 'rgba(52, 211, 153, 0.14)',
    iconBg: 'bg-[#082218]/80 dark:bg-[#051810]/90',
    iconBorder: 'border-emerald-400/60 shadow-[0_0_16px_rgba(16,185,129,0.5)]',
    iconColor: 'text-emerald-400 dark:text-emerald-300',
    waveColor: '#34d399',
    waveGlow: 'rgba(16, 185, 129, 0.75)',
    accentDot: '#6ee7b7',
    pillBg: 'bg-[#061b13]/90 dark:bg-[#04140e]/90',
    pillBorder: 'border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.3)]',
    pillText: 'text-emerald-300 dark:text-emerald-200',
    path: 'M 0,70 C 45,74 80,44 125,28 C 170,16 205,32 280,18',
    nodeX: 125,
    nodeY: 28
  },
  amber: {
    border: 'border-amber-500/40 dark:border-amber-400/45',
    borderHover: 'hover:border-amber-300 dark:hover:border-amber-200',
    boxGlow: 'rgba(245, 158, 11, 0.35)',
    titleColor: 'text-amber-400 dark:text-amber-300 drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]',
    actionColor: 'text-amber-400 hover:text-amber-300 group-hover:text-amber-300',
    sheenStroke: '#fbbf24',
    sheenGlow: 'rgba(251, 191, 36, 0.8)',
    sheenFill: 'rgba(251, 191, 36, 0.14)',
    iconBg: 'bg-[#261806]/80 dark:bg-[#1a1004]/90',
    iconBorder: 'border-amber-400/60 shadow-[0_0_16px_rgba(245,158,11,0.5)]',
    iconColor: 'text-amber-400 dark:text-amber-300',
    waveColor: '#fbbf24',
    waveGlow: 'rgba(245, 158, 11, 0.75)',
    accentDot: '#fde68a',
    pillBg: 'bg-[#201405]/90 dark:bg-[#160d03]/90',
    pillBorder: 'border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.3)]',
    pillText: 'text-amber-300 dark:text-amber-200',
    path: 'M 0,76 C 35,70 65,30 95,20 C 115,55 145,26 185,36 C 220,46 250,14 280,8',
    nodeX: 250,
    nodeY: 14
  },
  rose: {
    border: 'border-rose-500/40 dark:border-rose-400/45',
    borderHover: 'hover:border-rose-300 dark:hover:border-rose-200',
    boxGlow: 'rgba(244, 63, 94, 0.35)',
    titleColor: 'text-rose-400 dark:text-rose-300 drop-shadow-[0_0_10px_rgba(244,63,94,0.4)]',
    actionColor: 'text-rose-400 hover:text-rose-300 group-hover:text-rose-300',
    sheenStroke: '#fb7185',
    sheenGlow: 'rgba(251, 113, 133, 0.8)',
    sheenFill: 'rgba(251, 113, 133, 0.14)',
    iconBg: 'bg-[#290a14]/80 dark:bg-[#1d060d]/90',
    iconBorder: 'border-rose-400/60 shadow-[0_0_16px_rgba(244,63,94,0.5)]',
    iconColor: 'text-rose-400 dark:text-rose-300',
    waveColor: '#fb7185',
    waveGlow: 'rgba(244, 63, 94, 0.75)',
    accentDot: '#fecdd3',
    pillBg: 'bg-[#220710]/90 dark:bg-[#18040b]/90',
    pillBorder: 'border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.3)]',
    pillText: 'text-rose-300 dark:text-rose-200',
    path: 'M 0,78 C 40,75 70,30 100,18 C 120,54 150,28 190,38 C 225,48 250,14 280,6',
    nodeX: 100,
    nodeY: 18
  }
};

// Aliases
variantStyles.default = variantStyles.cyan;
variantStyles.warning = variantStyles.amber;
variantStyles.danger = variantStyles.rose;

export const StatCard3D: React.FC<StatCard3DProps> = ({
  title,
  value,
  icon,
  variant = 'cyan',
  trend,
  badge,
  description,
  actionLabel,
  onActionClick,
  index = 0,
  isIsometric = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const style = variantStyles[variant] || variantStyles.cyan;

  // Authentic 3D diagonal isometric angles matching reference image
  // rotateX: tilts card backward in space (top edge recedes)
  // rotateY: turns card diagonally towards right (right edge recedes deeply, left edge faces viewer)
  // rotateZ: subtle diagonal tilt matching the reference slope
  const baseRotateX = isIsometric ? 13 : 0;
  const baseRotateY = isIsometric ? -17 : 0;
  const baseRotateZ = isIsometric ? 3.2 : 0;
  const baseTranslateZ = isIsometric ? index * 8 : 0;

  // Fluid physics springs for continuous, non-flickering motion
  const springConfig = { stiffness: 200, damping: 22, mass: 0.6 };
  const rotateX = useSpring(baseRotateX, springConfig);
  const rotateY = useSpring(baseRotateY, springConfig);
  const rotateZ = useSpring(baseRotateZ, springConfig);
  const translateY = useSpring(0, springConfig);
  const translateZ = useSpring(baseTranslateZ, springConfig);
  const scale = useSpring(1, springConfig);

  // Synchronize base values when isIsometric or index updates
  useEffect(() => {
    if (!isHovered) {
      rotateX.set(baseRotateX);
      rotateY.set(baseRotateY);
      rotateZ.set(baseRotateZ);
      translateY.set(0);
      translateZ.set(baseTranslateZ);
      scale.set(1);
    }
  }, [isIsometric, index, isHovered, baseRotateX, baseRotateY, baseRotateZ, baseTranslateZ, rotateX, rotateY, rotateZ, translateY, translateZ, scale]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Fixed relative coords against stationary outer boundary
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const normX = relX - 0.5;
    const normY = relY - 0.5;

    // Gentle, natural 3D tilt while keeping the diagonal character
    const targetX = baseRotateX - normY * 7;
    const targetY = baseRotateY + normX * 7;

    rotateX.set(targetX);
    rotateY.set(targetY);
    rotateZ.set(baseRotateZ);

    setGlare({
      x: Math.round(relX * 100),
      y: Math.round(relY * 100),
      opacity: 0.45
    });
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsHovered(true);
    scale.set(1.035);
    translateY.set(-10);
    translateZ.set(baseTranslateZ + 26);
    handleMouseMove(e);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    rotateX.set(baseRotateX);
    rotateY.set(baseRotateY);
    rotateZ.set(baseRotateZ);
    translateY.set(0);
    translateZ.set(baseTranslateZ);
    scale.set(1);
    setGlare(prev => ({ ...prev, opacity: 0 }));
  };

  // Contextual action label fallback
  const displayAction = actionLabel || (
    title.toLowerCase().includes('veículo') ? 'Abrir Frota' :
    title.toLowerCase().includes('operaç') ? 'Ver Operações' :
    title.toLowerCase().includes('vencer') ? 'Ver a Vencer' :
    title.toLowerCase().includes('vencido') ? 'Ação Imediata' :
    'Abrir Gráficos'
  );

  return (
    <div
      ref={containerRef}
      style={{ perspective: 1000 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      className="relative select-none w-full h-full cursor-pointer group py-2"
      onClick={onActionClick}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          rotateZ,
          translateY,
          translateZ,
          scale,
          transformStyle: 'preserve-3d',
          boxShadow: isHovered
            ? `0 32px 64px -12px rgba(0,0,0,0.85), 0 0 38px ${style.boxGlow}`
            : `0 18px 42px -10px rgba(0,0,0,0.65), 0 0 24px ${style.boxGlow}`
        }}
        className={cn(
          "relative overflow-hidden rounded-[28px] p-5 md:p-6 transition-colors duration-300 border backdrop-blur-xl",
          "bg-gradient-to-br from-[#0c1626]/95 via-[#08101e]/95 to-[#050912]/98 dark:from-[#091220]/95 dark:via-[#070d18]/95 dark:to-[#04060c]/98",
          style.border,
          style.borderHover,
          "flex flex-col justify-between min-h-[250px] h-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]"
        )}
      >
        {/* Dynamic Specular Glare */}
        <div
          style={{
            background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.24) 0%, transparent 60%)`,
            opacity: glare.opacity
          }}
          className="absolute inset-0 pointer-events-none transition-opacity duration-200 z-30"
        />

        {/* 
          CURVED DIAGONAL GLASS LIGHT RAY (MODELO DO ANEXO)
          Reproduz com precisão o feixe curvo de luz e o reflexo em diagonal que corta o card da esquerda
        */}
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
          <svg
            className="w-full h-full"
            viewBox="0 0 300 250"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={`sheenGradient-${index}-${variant}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                <stop offset="35%" stopColor={style.sheenStroke} stopOpacity="0.8" />
                <stop offset="75%" stopColor={style.sheenStroke} stopOpacity="0.3" />
                <stop offset="100%" stopColor={style.sheenStroke} stopOpacity="0" />
              </linearGradient>

              <linearGradient id={`sheenAreaFill-${index}-${variant}`} x1="0%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor={style.sheenFill} stopOpacity="1" />
                <stop offset="60%" stopColor={style.sheenFill} stopOpacity="0.3" />
                <stop offset="100%" stopColor="transparent" stopOpacity="0" />
              </linearGradient>

              <filter id={`sheenBlur-${index}-${variant}`} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Translucent glass light pool to the left of the curve */}
            <path
              d="M 0,0 L 135,0 Q 82,105 0,185 Z"
              fill={`url(#sheenAreaFill-${index}-${variant})`}
              className="opacity-70 group-hover:opacity-95 transition-opacity duration-300"
            />

            {/* Glowing curved diagonal reflection ray line */}
            <path
              d="M 135,0 Q 82,105 0,185"
              fill="none"
              stroke={`url(#sheenGradient-${index}-${variant})`}
              strokeWidth="2.2"
              filter={`url(#sheenBlur-${index}-${variant})`}
              className="opacity-80 group-hover:opacity-100 transition-opacity duration-300"
            />
          </svg>
        </div>

        {/* Ambient Corner Glow */}
        <div 
          style={{ background: style.boxGlow }}
          className="absolute -top-14 -right-14 w-36 h-36 rounded-full blur-3xl pointer-events-none opacity-55 group-hover:opacity-85 transition-opacity"
        />
        <div 
          style={{ background: style.boxGlow }}
          className="absolute -bottom-14 -left-14 w-36 h-36 rounded-full blur-3xl pointer-events-none opacity-30 group-hover:opacity-60 transition-opacity"
        />

        {/* TOP ROW: Squircle Icon Box (Left) & Pill Badge with Equalizer (Right) */}
        <div className="flex items-start justify-between relative z-20 mb-3">
          {/* Top-Left Squircle Icon Box (Directly modeled after the attachment icon box) */}
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center border backdrop-blur-md shrink-0 transition-transform duration-300 group-hover:scale-105",
            style.iconBg,
            style.iconBorder,
            style.iconColor
          )}>
            {React.cloneElement(icon as React.ReactElement<any>, { size: 24, strokeWidth: 2.2 })}
          </div>

          {/* Top-Right Pill Badge (with glowing equalizer bars like LIVE indicator in attachment) */}
          <div className={cn(
            "px-3 py-1.5 rounded-full border backdrop-blur-md flex items-center gap-2 shrink-0 transition-all",
            style.pillBg,
            style.pillBorder,
            style.pillText
          )}>
            <div className="flex items-end gap-[3px] h-3.5 pb-0.5">
              <span className="w-1 h-2 rounded-full bg-current opacity-75 animate-pulse" />
              <span className="w-1 h-3.5 rounded-full bg-current shadow-[0_0_6px_currentColor]" />
              <span className="w-1 h-2.5 rounded-full bg-current opacity-85 animate-pulse" style={{ animationDelay: '200ms' }} />
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[10px] font-black leading-tight tracking-wider uppercase">
                {badge?.text || trend || "MONITORANDO"}
              </span>
              {badge?.subtext && (
                <span className="text-[8px] font-bold text-slate-300/80 tracking-wider uppercase leading-none">
                  {badge.subtext}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* TITLE ROW: Prominent Colored Headline (Directly modeled after "Dashboard Principal" in attachment) */}
        <div className="relative z-20 mt-2 mb-1">
          <h3 className={cn(
            "text-base sm:text-lg font-display font-black tracking-tight leading-tight",
            style.titleColor
          )}>
            {title}
          </h3>
        </div>

        {/* MIDDLE STAT: Impactful Big Value + Glowing Neon Wave Background */}
        <div className="relative z-20 my-1 flex items-baseline justify-between gap-3">
          <div className="relative">
            <h4 className="text-3xl sm:text-4xl font-display font-black text-white tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
              {value}
            </h4>
          </div>
        </div>

        {/* GLOWING NEON WAVE (SVG) - Smooth dynamic baseline */}
        <div className="absolute inset-x-0 bottom-16 h-16 pointer-events-none z-10 overflow-hidden opacity-40 group-hover:opacity-75 transition-opacity">
          <svg
            className="w-full h-full overflow-visible"
            viewBox="0 0 280 90"
            preserveAspectRatio="none"
          >
            <defs>
              <filter id={`neon-glow-${index}-${variant}`} x="-20%" y="-50%" width="140%" height="200%">
                <feGaussianBlur stdDeviation="5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Ambient Glow Wave */}
            <path
              d={style.path}
              fill="none"
              stroke={style.waveGlow}
              strokeWidth="6"
              strokeLinecap="round"
              opacity="0.5"
              filter={`url(#neon-glow-${index}-${variant})`}
            />

            {/* Core Crisp Neon Wave */}
            <path
              d={style.path}
              fill="none"
              stroke={style.waveColor}
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.9"
            />

            {/* Animated Energy Traveling Pulse */}
            <motion.path
              d={style.path}
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="20 120"
              animate={{
                strokeDashoffset: [280, 0]
              }}
              transition={{
                duration: 2.8,
                repeat: Infinity,
                ease: "linear"
              }}
              opacity="0.9"
            />
          </svg>
        </div>

        {/* DESCRIPTION: Clean, High-Contrast Slate Typography */}
        <div className="relative z-20 mt-2">
          <p className="text-xs text-slate-400 dark:text-slate-300/85 leading-relaxed line-clamp-2">
            {description || 'Monitoramento analítico em tempo real com controle dinâmico da frota.'}
          </p>
        </div>

        {/* BOTTOM ACTION ROW: "Abrir Gráficos ->" (Directly modeled after attachment footer CTA) */}
        <div className="relative z-20 mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
          <span className={cn(
            "text-xs sm:text-sm font-bold tracking-tight flex items-center gap-1.5 transition-all duration-300",
            style.actionColor
          )}>
            {displayAction}
          </span>
          <div className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1.5",
            style.iconBg,
            style.iconColor
          )}>
            <ArrowRight size={15} strokeWidth={2.5} />
          </div>
        </div>
      </motion.div>
    </div>
  );
};


