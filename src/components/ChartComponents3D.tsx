import React, { useRef, useState, useEffect } from 'react';
import { motion, useSpring } from 'motion/react';
import { cn } from '../lib/utils';
import { Sparkles, Layers } from 'lucide-react';

interface ChartContainer3DProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  legendBadge?: string;
  badgeColor?: string;
  children: React.ReactNode;
  className?: string;
  height?: string;
  headerRight?: React.ReactNode;
}

export const ChartContainer3D: React.FC<ChartContainer3DProps> = ({
  title,
  subtitle,
  icon,
  legendBadge,
  badgeColor = '#38bdf8',
  children,
  className,
  height = 'h-[490px]',
  headerRight
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });
  const [is3DActive, setIs3DActive] = useState(true);

  // Fluid physics springs for continuous, non-flickering motion
  const springConfig = { stiffness: 220, damping: 26, mass: 0.6 };
  const rotateX = useSpring(is3DActive ? 1 : 0, springConfig);
  const rotateY = useSpring(is3DActive ? -1 : 0, springConfig);
  const translateY = useSpring(0, springConfig);
  const translateZ = useSpring(0, springConfig);

  useEffect(() => {
    if (!isHovered) {
      rotateX.set(is3DActive ? 1 : 0);
      rotateY.set(is3DActive ? -1 : 0);
      translateY.set(0);
      translateZ.set(0);
    }
  }, [is3DActive, isHovered, rotateX, rotateY, translateY, translateZ]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!is3DActive || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Fixed relative coords against stationary outer boundary (never shifts!)
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const normX = relX - 0.5;
    const normY = relY - 0.5;

    // Gentle 3D tilt
    const targetX = -normY * 6;
    const targetY = normX * 6;

    rotateX.set(targetX);
    rotateY.set(targetY);

    setGlare({
      x: Math.round(relX * 100),
      y: Math.round(relY * 100),
      opacity: 0.45
    });
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!is3DActive) return;
    setIsHovered(true);
    translateY.set(-4);
    translateZ.set(12);
    handleMouseMove(e);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    rotateX.set(is3DActive ? 1 : 0);
    rotateY.set(is3DActive ? -1 : 0);
    translateY.set(0);
    translateZ.set(0);
    setGlare(prev => ({ ...prev, opacity: 0 }));
  };

  return (
    <div
      ref={containerRef}
      style={{ perspective: is3DActive ? 1200 : undefined }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      className={cn("relative select-none", height, className)}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          translateY,
          translateZ,
          transformStyle: 'preserve-3d',
          boxShadow: isHovered
            ? '0 24px 50px -10px rgba(0,0,0,0.7), 0 0 25px rgba(56,189,248,0.18)'
            : '0 12px 30px -10px rgba(0,0,0,0.5), 0 0 15px rgba(56,189,248,0.08)'
        }}
        className={cn(
          "relative overflow-hidden rounded-[28px] p-6 h-full flex flex-col justify-between border transition-colors duration-300",
          "bg-gradient-to-br from-[#0c1224] via-[#090e1c] to-[#060913] dark:from-[#080d1a] dark:via-[#070b16] dark:to-[#04070e]",
          "border-slate-800/80 hover:border-cyan-500/40 group"
        )}
      >
        {/* Dynamic Specular Glare */}
        <div
          style={{
            background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.18) 0%, transparent 60%)`,
            opacity: glare.opacity
          }}
          className="absolute inset-0 pointer-events-none transition-opacity duration-200 z-10"
        />

        {/* Diagonal Translucent Light Sheen */}
        <div 
          className="absolute -inset-y-20 left-1/4 w-44 -rotate-[25deg] pointer-events-none opacity-30 group-hover:opacity-60 transition-opacity duration-700 z-10"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.02) 20%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.02) 80%, transparent 100%)',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        />

        {/* Ambient Corner Neon Backlight */}
        <div 
          className="absolute -top-16 -right-16 w-36 h-36 rounded-full blur-3xl pointer-events-none opacity-25 group-hover:opacity-45 transition-opacity"
          style={{ background: badgeColor }}
        />

        {/* Chart Header */}
        <div className="flex items-center justify-between mb-4 shrink-0 relative z-20">
          <div>
            <h3 className="font-display font-black text-base sm:text-lg text-white tracking-tight flex items-center gap-2">
              {icon}
              {title}
            </h3>
            {subtitle && (
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase tracking-widest mt-0.5">
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {legendBadge && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 shadow-sm">
                <span 
                  className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]"
                  style={{ backgroundColor: badgeColor, color: badgeColor }}
                />
                <span className="text-[10px] font-black text-slate-300 tracking-wider uppercase">
                  {legendBadge}
                </span>
              </div>
            )}

            {headerRight}

            {/* 3D Depth Toggle */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIs3DActive(!is3DActive);
              }}
              className={cn(
                "p-1.5 rounded-lg text-xs font-black transition-all border cursor-pointer",
                is3DActive
                  ? "bg-cyan-950/60 border-cyan-500/50 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                  : "bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200"
              )}
              title={is3DActive ? "Efeito 3D Ativo (clique para plano)" : "Modo Plano (clique para 3D)"}
            >
              <Layers size={13} />
            </button>
          </div>
        </div>

        {/* Chart Content Area */}
        <div className="flex-1 min-h-0 relative z-20 h-full">
          {children}
        </div>
      </motion.div>
    </div>
  );
};

// 3D Animated Beam Cursor for Recharts Composed / Bar Charts
export const AnimatedChartCursor = (props: any) => {
  const { x, y, width, height } = props;
  if (x === undefined || y === undefined || width === undefined || height === undefined) return null;

  return (
    <g className="pointer-events-none">
      <defs>
        <linearGradient id="cursorBeamGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.28} />
          <stop offset="60%" stopColor="#38bdf8" stopOpacity={0.08} />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.01} />
        </linearGradient>
      </defs>

      {/* Animated soft neon vertical column glow */}
      <rect
        x={x - 2}
        y={y}
        width={width + 4}
        height={height}
        fill="url(#cursorBeamGlow)"
        rx={8}
        className="animate-pulse"
        style={{ animationDuration: '2.5s' }}
      />

      {/* Floating top neon border line */}
      <rect
        x={x + 3}
        y={y}
        width={Math.max(4, width - 6)}
        height={3}
        fill="#38bdf8"
        rx={1.5}
        filter="drop-shadow(0 0 6px #38bdf8)"
      />
    </g>
  );
};

// 3D Neon Tooltip with Animated Progress / Ratio Bar for Composed / Bar / Line Charts
export const ChartTooltip3D = ({ active, payload, label, unit = "unidades" }: any) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0];
  const value = Number(data?.value ?? 0);
  const color = data?.color || data?.fill || '#38bdf8';
  const total = Number(data?.payload?.total ?? 0);

  // Dynamic percentage / proportion
  const percentage = total > 0 
    ? Math.min(100, Math.round((value / total) * 100))
    : Math.min(100, Math.max(10, value * 5));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      style={{
        transform: 'perspective(700px) rotateX(4deg) translateZ(20px)',
        transformStyle: 'preserve-3d',
        boxShadow: `0 24px 45px -10px rgba(0,0,0,0.85), 0 0 30px ${color}35, inset 0 1px 1px rgba(255,255,255,0.22)`
      }}
      className="relative rounded-2xl p-4 min-w-[210px] max-w-[260px] border border-slate-700/80 bg-[#0a1224]/95 backdrop-blur-2xl z-50 select-none overflow-hidden shadow-2xl"
    >
      {/* Specular Glare across tooltip */}
      <div 
        className="absolute -inset-y-10 left-1/3 w-20 -rotate-12 pointer-events-none opacity-25"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)'
        }}
      />

      {/* Top Animated Neon Scanning Line */}
      <div className="absolute top-0 inset-x-0 h-[2.5px] overflow-hidden">
        <div 
          className="w-full h-full shadow-[0_0_12px_currentColor]"
          style={{ backgroundColor: color, color: color }}
        />
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/80 to-transparent"
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Header Row: Indicator Dot + Title + Sparkle */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2 min-w-0">
          <span 
            className="w-2.5 h-2.5 rounded-full shadow-[0_0_10px_currentColor] shrink-0"
            style={{ backgroundColor: color, color: color }}
          />
          <span className="text-xs font-black text-slate-100 uppercase tracking-wider truncate" title={label || data?.name}>
            {label || data?.name}
          </span>
        </div>
        <Sparkles size={12} className="text-cyan-400 shrink-0 opacity-80" />
      </div>

      {/* Main Stat Row */}
      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-black text-white font-display tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
            {value}
          </span>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {unit}
          </span>
        </div>

        {total > 0 && (
          <span 
            className="text-[10px] font-black px-2 py-0.5 rounded-full border shadow-sm shrink-0"
            style={{
              backgroundColor: `${color}18`,
              borderColor: `${color}45`,
              color: color
            }}
          >
            {percentage}%
          </span>
        )}
      </div>

      {/* 
        BARRA ANIMADA INTERATIVA:
        Linha de progresso neon com animação de preenchimento fluido e efeito de feixe correndo 
      */}
      <div className="space-y-1.5 pt-1 border-t border-slate-800/70">
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
          <span className="flex items-center gap-1 text-slate-300 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Participação:
          </span>
          <span className="font-mono font-black text-cyan-400">
            {total > 0 ? `${value} de ${total} (${percentage}%)` : `${percentage}%`}
          </span>
        </div>

        {/* Track Container */}
        <div className="h-2.5 w-full rounded-full bg-slate-900/90 border border-slate-700/80 p-[2px] relative overflow-hidden shadow-inner">
          {/* Animated Fill Bar */}
          <motion.div
            className="h-full rounded-full relative overflow-hidden shadow-[0_0_12px_currentColor]"
            style={{
              background: `linear-gradient(90deg, #2563eb 0%, #38bdf8 50%, #22c55e 100%)`,
              color: color
            }}
            initial={{ width: '0%' }}
            animate={{ width: `${Math.max(6, percentage)}%` }}
            transition={{
              type: "spring",
              stiffness: 140,
              damping: 18,
              mass: 0.6
            }}
          >
            {/* Animated Travelling Shimmer Sweep */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
              animate={{ x: ['-100%', '200%'] }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                ease: 'linear'
              }}
            />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

// 3D Neon Tooltip with Animated Progress Bar for Donut / Pie Charts
export const PieTooltip3D = ({ active, payload, total }: any) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0];
  const name = data?.name;
  const value = Number(data?.value ?? 0);
  const color = data?.payload?.color || data?.color || '#22c55e';
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      style={{
        transform: 'perspective(700px) rotateX(4deg) translateZ(20px)',
        transformStyle: 'preserve-3d',
        boxShadow: `0 24px 45px -10px rgba(0,0,0,0.85), 0 0 30px ${color}35, inset 0 1px 1px rgba(255,255,255,0.22)`
      }}
      className="relative rounded-2xl p-4 min-w-[200px] max-w-[250px] border border-slate-700/80 bg-[#0a1224]/95 backdrop-blur-2xl z-50 select-none overflow-hidden shadow-2xl"
    >
      {/* Top Animated Neon Scanning Line */}
      <div className="absolute top-0 inset-x-0 h-[2.5px] overflow-hidden">
        <div 
          className="w-full h-full shadow-[0_0_12px_currentColor]"
          style={{ backgroundColor: color, color: color }}
        />
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/80 to-transparent"
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2 min-w-0">
          <span 
            className="w-2.5 h-2.5 rounded-full shadow-[0_0_10px_currentColor] shrink-0"
            style={{ backgroundColor: color, color: color }}
          />
          <span className="text-xs font-black text-slate-100 uppercase tracking-wider truncate">
            {name}
          </span>
        </div>
        <span 
          className="text-[10px] font-black px-2 py-0.5 rounded-full border shadow-sm shrink-0"
          style={{
            backgroundColor: `${color}18`,
            borderColor: `${color}45`,
            color: color
          }}
        >
          {percentage}%
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <span className="text-3xl font-black text-white font-display tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
          {value}
        </span>
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          itens
        </span>
      </div>

      {/* Barra Animada de Percentual no Donut */}
      <div className="space-y-1.5 pt-1 border-t border-slate-800/70">
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
          <span className="text-slate-300 font-medium">Fração do Total:</span>
          <span className="font-mono font-black" style={{ color }}>
            {percentage}% {total > 0 ? `(${value}/${total})` : ''}
          </span>
        </div>

        <div className="h-2.5 w-full rounded-full bg-slate-900/90 border border-slate-700/80 p-[2px] relative overflow-hidden shadow-inner">
          <motion.div
            className="h-full rounded-full relative overflow-hidden shadow-[0_0_12px_currentColor]"
            style={{
              backgroundColor: color,
              color: color
            }}
            initial={{ width: '0%' }}
            animate={{ width: `${Math.max(5, percentage)}%` }}
            transition={{
              type: "spring",
              stiffness: 140,
              damping: 18,
              mass: 0.6
            }}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
              animate={{ x: ['-100%', '200%'] }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                ease: 'linear'
              }}
            />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};
