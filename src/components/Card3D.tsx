import React, { useRef, useState } from 'react';
import { cn } from '../lib/utils';

export type Card3DVariant = 'blue' | 'emerald' | 'rose' | 'amber' | 'indigo' | 'sky' | 'purple' | 'default';

interface Card3DProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: Card3DVariant;
  isSelected?: boolean;
  interactive?: boolean;
  className?: string;
  glowColor?: string;
  onClick?: () => void;
}

export const Card3D: React.FC<Card3DProps> = ({
  children,
  variant = 'default',
  isSelected = false,
  interactive = true,
  className,
  glowColor,
  onClick,
  ...rest
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const variantStyles: Record<Card3DVariant, { base: string; selected: string; glow: string }> = {
    blue: {
      base: "border-slate-200/90 dark:border-blue-500/30 bg-white/95 dark:bg-slate-900/95 hover:border-blue-400 dark:hover:border-cyan-400/70 hover:shadow-[0_16px_36px_-6px_rgba(37,99,235,0.25),0_0_24px_rgba(56,189,248,0.3)] dark:hover:shadow-[0_20px_45px_-10px_rgba(0,0,0,0.95),0_0_35px_rgba(6,182,212,0.45)]",
      selected: "ring-2 ring-blue-600 dark:ring-cyan-400 border-blue-500 dark:border-cyan-400 bg-blue-50/50 dark:bg-blue-950/70 shadow-[0_12px_32px_rgba(37,99,235,0.25)] dark:shadow-[0_0_30px_rgba(6,182,212,0.4)]",
      glow: "rgba(6, 182, 212, 0.25)"
    },
    emerald: {
      base: "border-slate-200/90 dark:border-emerald-500/30 bg-white/95 dark:bg-slate-900/95 hover:border-emerald-400 dark:hover:border-emerald-400/70 hover:shadow-[0_16px_36px_-6px_rgba(16,185,129,0.25),0_0_24px_rgba(52,211,153,0.3)] dark:hover:shadow-[0_20px_45px_-10px_rgba(0,0,0,0.95),0_0_35px_rgba(16,185,129,0.45)]",
      selected: "ring-2 ring-emerald-500 dark:ring-emerald-400 border-emerald-500 dark:border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/70 shadow-[0_12px_32px_rgba(16,185,129,0.25)] dark:shadow-[0_0_30px_rgba(16,185,129,0.4)]",
      glow: "rgba(16, 185, 129, 0.25)"
    },
    rose: {
      base: "border-slate-200/90 dark:border-rose-500/30 bg-white/95 dark:bg-slate-900/95 hover:border-rose-400 dark:hover:border-rose-400/70 hover:shadow-[0_16px_36px_-6px_rgba(244,63,94,0.25),0_0_24px_rgba(251,113,133,0.3)] dark:hover:shadow-[0_20px_45px_-10px_rgba(0,0,0,0.95),0_0_35px_rgba(244,63,94,0.45)]",
      selected: "ring-2 ring-rose-500 dark:ring-rose-400 border-rose-500 dark:border-rose-400 bg-rose-50/50 dark:bg-rose-950/70 shadow-[0_12px_32px_rgba(244,63,94,0.25)] dark:shadow-[0_0_30px_rgba(244,63,94,0.4)]",
      glow: "rgba(244, 63, 94, 0.25)"
    },
    amber: {
      base: "border-slate-200/90 dark:border-amber-500/30 bg-white/95 dark:bg-slate-900/95 hover:border-amber-400 dark:hover:border-amber-400/70 hover:shadow-[0_16px_36px_-6px_rgba(245,158,11,0.25),0_0_24px_rgba(251,191,36,0.3)] dark:hover:shadow-[0_20px_45px_-10px_rgba(0,0,0,0.95),0_0_35px_rgba(245,158,11,0.45)]",
      selected: "ring-2 ring-amber-500 dark:ring-amber-400 border-amber-500 dark:border-amber-400 bg-amber-50/50 dark:bg-amber-950/70 shadow-[0_12px_32px_rgba(245,158,11,0.25)] dark:shadow-[0_0_30px_rgba(245,158,11,0.4)]",
      glow: "rgba(245, 158, 11, 0.25)"
    },
    indigo: {
      base: "border-slate-200/90 dark:border-indigo-500/30 bg-white/95 dark:bg-slate-900/95 hover:border-indigo-400 dark:hover:border-indigo-400/70 hover:shadow-[0_16px_36px_-6px_rgba(99,102,241,0.25),0_0_24px_rgba(129,140,248,0.3)] dark:hover:shadow-[0_20px_45px_-10px_rgba(0,0,0,0.95),0_0_35px_rgba(99,102,241,0.45)]",
      selected: "ring-2 ring-indigo-500 dark:ring-indigo-400 border-indigo-500 dark:border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/70 shadow-[0_12px_32px_rgba(99,102,241,0.25)] dark:shadow-[0_0_30px_rgba(99,102,241,0.4)]",
      glow: "rgba(99, 102, 241, 0.25)"
    },
    sky: {
      base: "border-slate-200/90 dark:border-sky-500/30 bg-white/95 dark:bg-slate-900/95 hover:border-sky-400 dark:hover:border-sky-400/70 hover:shadow-[0_16px_36px_-6px_rgba(14,165,233,0.25),0_0_24px_rgba(56,189,248,0.3)] dark:hover:shadow-[0_20px_45px_-10px_rgba(0,0,0,0.95),0_0_35px_rgba(14,165,233,0.45)]",
      selected: "ring-2 ring-sky-500 dark:ring-sky-400 border-sky-500 dark:border-sky-400 bg-sky-50/50 dark:bg-sky-950/70 shadow-[0_12px_32px_rgba(14,165,233,0.25)] dark:shadow-[0_0_30px_rgba(14,165,233,0.4)]",
      glow: "rgba(14, 165, 233, 0.25)"
    },
    purple: {
      base: "border-slate-200/90 dark:border-purple-500/30 bg-white/95 dark:bg-slate-900/95 hover:border-purple-400 dark:hover:border-purple-400/70 hover:shadow-[0_16px_36px_-6px_rgba(168,85,247,0.25),0_0_24px_rgba(192,132,252,0.3)] dark:hover:shadow-[0_20px_45px_-10px_rgba(0,0,0,0.95),0_0_35px_rgba(168,85,247,0.45)]",
      selected: "ring-2 ring-purple-500 dark:ring-purple-400 border-purple-500 dark:border-purple-400 bg-purple-50/50 dark:bg-purple-950/70 shadow-[0_12px_32px_rgba(168,85,247,0.25)] dark:shadow-[0_0_30px_rgba(168,85,247,0.4)]",
      glow: "rgba(168, 85, 247, 0.25)"
    },
    default: {
      base: "border-slate-200/90 dark:border-slate-800/90 bg-white/95 dark:bg-slate-900/95 hover:border-blue-400 dark:hover:border-cyan-400/60 hover:shadow-[0_16px_36px_-6px_rgba(37,99,235,0.2),0_0_20px_rgba(56,189,248,0.25)] dark:hover:shadow-[0_20px_45px_-10px_rgba(0,0,0,0.95),0_0_35px_rgba(6,182,212,0.35)]",
      selected: "ring-2 ring-blue-600 dark:ring-cyan-400 border-blue-500 dark:border-cyan-400 bg-blue-50/40 dark:bg-blue-950/60 shadow-[0_12px_30px_rgba(37,99,235,0.25)] dark:shadow-[0_12px_30px_rgba(6,182,212,0.35)]",
      glow: "rgba(6, 182, 212, 0.2)"
    }
  };

  const styleConfig = variantStyles[variant] || variantStyles.default;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -8;
    const rotateY = ((x - centerX) / centerX) * 8;
    setRotate({ x: rotateX, y: rotateY });
    setGlare({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.6
    });
  };

  return (
    <div 
      ref={cardRef}
      style={{ perspective: 850 }} 
      onMouseMove={handleMouseMove}
      onMouseEnter={() => interactive && setIsHovered(true)}
      onMouseLeave={() => {
        if (!interactive) return;
        setIsHovered(false);
        setRotate({ x: 0, y: 0 });
        setGlare(prev => ({ ...prev, opacity: 0 }));
      }}
      className="relative select-none h-full"
    >
      <div
        onClick={onClick}
        style={{
          transform: interactive && isHovered
            ? `perspective(800px) rotateX(${rotate.x}deg) rotateY(${rotate.y}deg) translateZ(12px) translateY(-4px) scale(1.018)`
            : isSelected
              ? 'perspective(800px) rotateX(0deg) rotateY(0deg) translateZ(6px) translateY(-2px) scale(1.01)'
              : 'perspective(800px) rotateX(0deg) rotateY(0deg) translateZ(0px) translateY(0px)',
          transition: isHovered ? 'transform 0.12s ease-out' : 'transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)',
          transformStyle: 'preserve-3d'
        }}
        className={cn(
          "glass-card relative overflow-hidden rounded-3xl p-4 transition-all duration-300 border flex flex-col justify-between h-full",
          isSelected ? styleConfig.selected : styleConfig.base,
          interactive ? "cursor-pointer group" : "",
          className
        )}
        {...rest}
      >
        {/* Dynamic Specular Glare */}
        {interactive && (
          <div
            style={{
              background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.22) 0%, transparent 60%)`,
              opacity: glare.opacity
            }}
            className="absolute inset-0 pointer-events-none transition-opacity duration-200 z-10"
          />
        )}

        {/* Diagonal Translucent Light Streak */}
        <div className="absolute -top-14 -right-14 w-32 h-44 bg-gradient-to-b from-white/12 via-white/2 to-transparent rotate-25 pointer-events-none opacity-40 group-hover:opacity-85 transition-opacity" />

        {/* Subtle Ambient Radial Backlight in Dark Mode */}
        <div
          style={{ background: glowColor || styleConfig.glow }}
          className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full opacity-0 dark:opacity-20 blur-2xl pointer-events-none group-hover:opacity-40 transition-opacity duration-500"
        />

        <div className="relative z-20 h-full flex flex-col justify-between">
          {children}
        </div>
      </div>
    </div>
  );
};
