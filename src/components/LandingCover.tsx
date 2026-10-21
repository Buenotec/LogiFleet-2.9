import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { NeonLaserBeam } from './NeonLaserBeam';

interface LandingCoverProps {
  onStart: () => void;
  lastUpdated?: Date;
}

export function LandingCover({ onStart, lastUpdated }: LandingCoverProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isExiting, setIsExiting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Keep local clock updated
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Geometric Plexus and 3D Tech Cubes with Shadows (Sombras) and Glows (Brilhos)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Particle nodes for ambient constellation
    const particleCount = Math.min(Math.floor((width * height) / 14000), 70);
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      baseAlpha: number;
    }

    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: Math.random() * 1.8 + 1.0,
        baseAlpha: Math.random() * 0.4 + 0.4
      });
    }

    let mouseX = width / 2;
    let mouseY = height / 2;
    let targetMouseX = width / 2;
    let targetMouseY = height / 2;

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // 3D Cube Topology Definition
    const baseVertices = [
      [-1, -1, -1], // 0
      [ 1, -1, -1], // 1
      [ 1,  1, -1], // 2
      [-1,  1, -1], // 3
      [-1, -1,  1], // 4
      [ 1, -1,  1], // 5
      [ 1,  1,  1], // 6
      [-1,  1,  1], // 7
    ];

    // Cube Faces (indices into baseVertices) with normal definition
    const faces = [
      { indices: [4, 5, 6, 7], normal: [ 0,  0,  1], name: 'front' },
      { indices: [1, 0, 3, 2], normal: [ 0,  0, -1], name: 'back' },
      { indices: [7, 6, 2, 3], normal: [ 0,  1,  0], name: 'top' },
      { indices: [0, 1, 5, 4], normal: [ 0, -1,  0], name: 'bottom' },
      { indices: [5, 1, 2, 6], normal: [ 1,  0,  0], name: 'right' },
      { indices: [0, 4, 7, 3], normal: [-1,  0,  0], name: 'left' }
    ];

    // Edges of the cube (12 edges)
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0], // back
      [4, 5], [5, 6], [6, 7], [7, 4], // front
      [0, 4], [1, 5], [2, 6], [3, 7]  // connecting
    ];

    // Configurable 3D Tech Cubes
    interface TechCubeConfig {
      relX: number; // percentage of screen width (0 to 1)
      relY: number; // percentage of screen height (0 to 1)
      size: number;
      baseRotX: number;
      baseRotY: number;
      baseRotZ: number;
      rotSpeedX: number;
      rotSpeedY: number;
      rotSpeedZ: number;
      orangeLines?: boolean;
    }

    const cubesConfig: TechCubeConfig[] = [
      {
        relX: 0.28,
        relY: 0.46,
        size: 145,
        baseRotX: 0.55,
        baseRotY: 0.75,
        baseRotZ: 0.12,
        rotSpeedX: 0.0012,
        rotSpeedY: 0.0016,
        rotSpeedZ: 0.0006,
        orangeLines: true
      },
      {
        relX: 0.78,
        relY: 0.32,
        size: 110,
        baseRotX: 0.40,
        baseRotY: -0.65,
        baseRotZ: 0.25,
        rotSpeedX: 0.0014,
        rotSpeedY: -0.0018,
        rotSpeedZ: 0.0008,
        orangeLines: false
      },
      {
        relX: 0.15,
        relY: 0.78,
        size: 85,
        baseRotX: 0.35,
        baseRotY: 0.85,
        baseRotZ: -0.20,
        rotSpeedX: 0.0010,
        rotSpeedY: 0.0012,
        rotSpeedZ: 0.0005,
        orangeLines: true
      }
    ];

    // Directional Light Vector for volumetric shadows and highlights
    // Light coming from top-front-left: (-0.6, -0.7, 0.5) normalized
    const lightDir = { x: -0.55, y: -0.65, z: 0.52 };
    const lightLen = Math.sqrt(lightDir.x * lightDir.x + lightDir.y * lightDir.y + lightDir.z * lightDir.z);
    lightDir.x /= lightLen;
    lightDir.y /= lightLen;
    lightDir.z /= lightLen;

    let time = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      time += 0.016;

      // Smooth mouse interpolation
      mouseX += (targetMouseX - mouseX) * 0.06;
      mouseY += (targetMouseY - mouseY) * 0.06;
      const normMouseX = (mouseX / width - 0.5);
      const normMouseY = (mouseY / height - 0.5);

      // 1. Ambient Background HUD Arcs and Grid
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.06)';
      ctx.lineWidth = 1;
      const heroCenterX = width * 0.28;
      const heroCenterY = height * 0.46;
      
      // Blueprint concentric rings around hero cube
      ctx.beginPath();
      ctx.arc(heroCenterX, heroCenterY, 220, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.setLineDash([4, 12]);
      ctx.arc(heroCenterX, heroCenterY, 280, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // 2. Render 3D Tech Cubes with Realistic Shadows (Sombras) and Glows (Brilhos)
      for (const cube of cubesConfig) {
        const cx = width * cube.relX + normMouseX * 35;
        const cy = height * cube.relY + normMouseY * 35;
        const size = cube.size * (width < 768 ? 0.75 : 1.0);

        // Calculate rotation angles with organic time drift and mouse tilt
        const rotX = cube.baseRotX + time * cube.rotSpeedX * 60 + normMouseY * 0.45;
        const rotY = cube.baseRotY + time * cube.rotSpeedY * 60 + normMouseX * 0.45;
        const rotZ = cube.baseRotZ + time * cube.rotSpeedZ * 60;

        // Precompute sines and cosines
        const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

        // Transform 3D Vertices
        const transformedVertices = baseVertices.map(([vx, vy, vz]) => {
          // Around X
          const y1 = vy * cosX - vz * sinX;
          const z1 = vy * sinX + vz * cosX;
          // Around Y
          const x2 = vx * cosY + z1 * sinY;
          const z2 = -vx * sinY + z1 * cosY;
          // Around Z
          const x3 = x2 * cosZ - y1 * sinZ;
          const y3 = x2 * sinZ + y1 * cosZ;
          const z3 = z2;

          // Perspective Projection
          const fov = 700;
          const projScale = fov / (fov + z3 * size * 0.85);
          return {
            x: cx + x3 * size * projScale,
            y: cy + y3 * size * projScale,
            z: z3,
            projScale
          };
        });

        // Calculate and Sort Faces by Depth (Painter's algorithm)
        const faceData = faces.map((face) => {
          const p0 = transformedVertices[face.indices[0]];
          const p1 = transformedVertices[face.indices[1]];
          const p2 = transformedVertices[face.indices[2]];
          const p3 = transformedVertices[face.indices[3]];

          // Center Z depth
          const avgZ = (p0.z + p1.z + p2.z + p3.z) / 4;

          // Face Center Point in 2D
          const faceCenterX = (p0.x + p1.x + p2.x + p3.x) / 4;
          const faceCenterY = (p0.y + p1.y + p2.y + p3.y) / 4;

          // Transform normal vector to calculate lighting dot product
          const [nx, ny, nz] = face.normal;
          const ny1 = ny * cosX - nz * sinX;
          const nz1 = ny * sinX + nz * cosX;
          const nx2 = nx * cosY + nz1 * sinY;
          const nz2 = -nx * sinY + nz1 * cosY;
          const nx3 = nx2 * cosZ - ny1 * sinZ;
          const ny3 = nx2 * sinZ + ny1 * cosZ;
          const nz3 = nz2;

          // Dot product with light
          const dot = nx3 * lightDir.x + ny3 * lightDir.y + nz3 * lightDir.z;

          return {
            ...face,
            points: [p0, p1, p2, p3],
            center: { x: faceCenterX, y: faceCenterY },
            avgZ,
            dot
          };
        });

        // Sort faces back to front
        faceData.sort((a, b) => a.avgZ - b.avgZ);

        // DRAW FACES: Sombras e Brilhos
        for (const face of faceData) {
          const [p0, p1, p2, p3] = face.points;
          const dot = face.dot;

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();

          if (dot > 0.05) {
            // === BRILHO (Illuminated / Glowing Face) ===
            // Create luminous cyan / electric blue gradient across the face
            const glowIntensity = Math.min(1.0, dot * 1.35);
            const grad = ctx.createLinearGradient(p0.x, p0.y, p2.x, p2.y);
            grad.addColorStop(0, `rgba(0, 212, 255, ${0.32 * glowIntensity})`);
            grad.addColorStop(0.5, `rgba(14, 165, 233, ${0.18 * glowIntensity})`);
            grad.addColorStop(1, `rgba(3, 105, 161, ${0.04 * glowIntensity})`);

            ctx.fillStyle = grad;
            ctx.fill();

            // Specular light sweep beam across face diagonal
            const specGrad = ctx.createLinearGradient(p1.x, p1.y, p3.x, p3.y);
            specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
            specGrad.addColorStop(0.5, `rgba(224, 247, 255, ${0.28 * glowIntensity})`);
            specGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
            ctx.fillStyle = specGrad;
            ctx.fill();
          } else {
            // === SOMBRA (Shadow / Obscured Face) ===
            // Create deep volumetric dark navy / black shadow with ambient falloff
            const shadowDepth = Math.min(1.0, Math.abs(dot) * 1.1 + 0.2);
            const shadowGrad = ctx.createLinearGradient(p0.x, p0.y, p2.x, p2.y);
            shadowGrad.addColorStop(0, `rgba(2, 6, 23, ${0.82 * shadowDepth})`);
            shadowGrad.addColorStop(0.6, `rgba(4, 12, 34, ${0.68 * shadowDepth})`);
            shadowGrad.addColorStop(1, `rgba(1, 3, 10, ${0.92 * shadowDepth})`);

            ctx.fillStyle = shadowGrad;
            ctx.fill();
          }

          // === Cross Diagonals & Facet Partition (as seen in the blueprint screenshot) ===
          ctx.strokeStyle = dot > 0.05 
            ? `rgba(0, 212, 255, ${0.45 + dot * 0.3})` 
            : 'rgba(0, 212, 255, 0.16)';
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          // Diagonal 1: p0 to p2
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p2.x, p2.y);
          // Diagonal 2: p1 to p3
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.stroke();

          ctx.restore();
        }

        // DRAW 3D WIREFRAME EDGES (Neon Cyan Glowing Edges)
        ctx.save();
        ctx.shadowColor = '#00d4ff';
        ctx.shadowBlur = 12;

        for (const [i0, i1] of edges) {
          const p0 = transformedVertices[i0];
          const p1 = transformedVertices[i1];

          // Edge glow intensity based on depth
          const edgeAvgZ = (p0.z + p1.z) / 2;
          const edgeAlpha = Math.max(0.3, Math.min(0.95, 0.65 + edgeAvgZ * 0.25));

          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.strokeStyle = `rgba(0, 212, 255, ${edgeAlpha})`;
          ctx.lineWidth = edgeAvgZ > 0 ? 1.6 : 1.1;
          ctx.stroke();
        }
        ctx.restore();

        // DRAW VERTICES (Glowing Cyan Nodes)
        for (const pt of transformedVertices) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2.6, 0, Math.PI * 2);
          ctx.fillStyle = '#38bdf8';
          ctx.shadowColor = '#00d4ff';
          ctx.shadowBlur = 15;
          ctx.fill();

          // Subtle inner white core
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.restore();
        }

        // DRAW HUD AMBER / ORANGE LASER TRACKING LINES (as seen in the screenshot)
        if (cube.orangeLines) {
          ctx.save();
          ctx.strokeStyle = 'rgba(249, 115, 22, 0.65)';
          ctx.lineWidth = 1.1;
          ctx.setLineDash([3, 5]);

          // Drop guideline from bottom-most vertex down
          const bottomVertices = [...transformedVertices].sort((a, b) => b.y - a.y);
          const anchorV1 = bottomVertices[0];
          const anchorV2 = bottomVertices[1];

          if (anchorV1) {
            ctx.beginPath();
            ctx.moveTo(anchorV1.x, anchorV1.y);
            ctx.lineTo(anchorV1.x, anchorV1.y + 110);
            ctx.stroke();

            // Small coordinate crosshair at the tip
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(anchorV1.x - 4, anchorV1.y + 110);
            ctx.lineTo(anchorV1.x + 4, anchorV1.y + 110);
            ctx.stroke();
          }

          if (anchorV2) {
            ctx.setLineDash([3, 5]);
            ctx.beginPath();
            ctx.moveTo(anchorV2.x, anchorV2.y);
            ctx.lineTo(anchorV2.x, anchorV2.y + 70);
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(anchorV2.x - 3, anchorV2.y + 70);
            ctx.lineTo(anchorV2.x + 3, anchorV2.y + 70);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // 3. Ambient Constellation Network (Interconnected nodes)
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        else if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        else if (p.y > height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 212, 255, ${p.baseAlpha})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#00d4ff';
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 130) {
            const alpha = (1 - dist / 130) * 0.35;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(0, 212, 255, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const handleStart = () => {
    setIsExiting(true);
    setTimeout(() => {
      onStart();
    }, 800);
  };

  return (
    <div 
      onMouseMove={(e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 30;
        const y = (e.clientY / window.innerHeight - 0.5) * 30;
        setMousePos({ x, y });
      }}
      style={{ transitionDuration: '800ms' }}
      className={`fixed inset-0 w-full h-full overflow-hidden flex flex-col items-center justify-center z-[9999] bg-[#070b14] transition-all duration-800 ease-in-out ${
        isExiting ? 'scale-150 opacity-0 pointer-events-none' : 'scale-100 opacity-100'
      }`}
    >
      <style>
        {`
          @keyframes slowPan {
            0% { transform: scale(1.05) translate(0px, 0px); }
            50% { transform: scale(1.1) translate(-10px, -10px); }
            100% { transform: scale(1.05) translate(0px, 0px); }
          }
        `}
      </style>
      
      {/* Animated Background Image */}
      <div 
        className="absolute inset-0 z-0 transition-transform duration-300 ease-out pointer-events-none"
        style={{ 
          backgroundImage: 'url(/tech_bg.jpg)', 
          backgroundSize: 'cover', 
          backgroundPosition: 'center',
          animation: 'slowPan 20s ease-in-out infinite',
          transform: `scale(1.05) translate(${-mousePos.x}px, ${-mousePos.y}px)`
        }}
      />
      
      {/* Dark tint backdrop for legibility and neon contrast */}
      <div className={`absolute inset-0 bg-[#070b14]/40 bg-radial-[ellipse_at_center] from-[#0a1124]/20 via-[#070b14]/55 to-[#03060c]/80 z-[1] transition-opacity duration-800 pointer-events-none ${isExiting ? 'opacity-0' : 'opacity-100'}`} />

      {/* Geometric Lines Network Layer */}
      <canvas 
        ref={canvasRef} 
        className={`absolute inset-0 w-full h-full z-[2] pointer-events-none transition-opacity duration-700 ${isExiting ? 'opacity-0' : 'opacity-90'}`}
      />

      {/* Header */}
      <div className={`absolute top-0 w-full p-4 md:p-6 flex flex-col md:flex-row justify-between items-center z-10 transition-opacity duration-500 text-white/60 text-xs font-medium tracking-wide ${isExiting ? 'opacity-0' : 'opacity-100'}`}>
        <div className="mb-2 md:mb-0">
          Atualização do Sistema: <span className="text-white/80">{lastUpdated ? format(lastUpdated, "dd/MM/yyyy 'às' HH:mm:ss") : format(new Date(), "dd/MM/yyyy 'às' HH:mm:ss")}</span>
        </div>
        <div>
          Data/Hora Local: <span className="text-white/80">{format(currentTime, "dd/MM/yyyy 'às' HH:mm:ss")}</span>
        </div>
      </div>

      {/* Content */}
      <div className={`relative z-10 flex flex-col items-center justify-center px-6 text-center max-w-4xl mx-auto transition-all duration-500 ${isExiting ? 'opacity-0 translate-y-8' : 'opacity-100 translate-y-0'}`}>
        {/* Ambient subtle cyan glow behind header */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-cyan-500/10 blur-[90px] rounded-full pointer-events-none -z-10" />

        <div className="relative mb-8 flex justify-center items-center">
          <div className="absolute w-[180px] h-[100px] bg-cyan-400/20 blur-[50px] rounded-full pointer-events-none" />
          <img 
            src="https://raw.githubusercontent.com/Buenotec/Logo_UNI/refs/heads/main/logo_uni.png" 
            alt="UNI Logo" 
            className="relative w-[140px] md:w-[200px] object-contain drop-shadow-[0_15px_30px_rgba(0,0,0,0.9)]"
          />
        </div>
        
        <h1 
          className="text-[2.5rem] md:text-[3.5rem] font-bold mb-3 font-display leading-tight tracking-tight relative"
          style={{
            color: 'white',
            textShadow: '0 6px 30px rgba(0,0,0,1), 0 2px 10px rgba(0,0,0,0.9)'
          }}
        >
          DocInsight <span className="text-white/90">- BI de Documentação</span>
        </h1>
        
        <p 
          className="text-[1rem] md:text-[1.1rem] text-slate-200 mb-14 font-medium max-w-2xl tracking-wide relative"
          style={{ textShadow: '0 4px 15px rgba(0,0,0,1)' }}
        >
          Inteligência e visualização de dados documentais em tempo real
        </p>
        
        {/* Futuristic Button com Feixe de Luz Neon 3D */}
        <button
          onClick={handleStart}
          className="relative group bg-slate-900/70 backdrop-blur-md border border-cyan-500/60 text-white px-12 py-[16px] text-[1.1rem] md:text-[1.2rem] font-semibold rounded-[50px] cursor-pointer transition-all duration-300 shadow-[0_0_22px_rgba(0,212,255,0.3),inset_0_0_20px_rgba(0,212,255,0.18)] hover:scale-105 hover:bg-cyan-950/80 hover:border-cyan-300 hover:shadow-[0_0_40px_rgba(0,212,255,0.65),inset_0_0_30px_rgba(0,212,255,0.35)] focus:outline-none overflow-hidden select-none"
        >
          {/* Animação 3D com Feixe de Luz Laser Neon passando pelo botão */}
          <NeonLaserBeam alwaysAnimate roundedClass="rounded-[50px]" accentColor="cyan" />

          {/* Cyan Glow lines on sides inside button */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1/2 bg-cyan-400 rounded-r-full shadow-[0_0_12px_#00d4ff] opacity-85 group-hover:h-3/4 group-hover:opacity-100 transition-all duration-300 z-20" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1/2 bg-cyan-400 rounded-l-full shadow-[0_0_12px_#00d4ff] opacity-85 group-hover:h-3/4 group-hover:opacity-100 transition-all duration-300 z-20" />
          
          <span className="relative z-20 tracking-wide font-bold drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] text-white group-hover:text-cyan-100 transition-colors">
            Iniciar Sistema
          </span>
        </button>
      </div>

      {/* Developer Credit - Bottom Right (No background, only cube and text) */}
      <div 
        className={`absolute bottom-4 right-4 md:bottom-6 md:right-8 z-20 flex items-center gap-2.5 transition-opacity duration-500 pointer-events-none select-none ${isExiting ? 'opacity-0' : 'opacity-100'}`}
      >
        {/* Hexagon/Cube Icon SVG */}
        <svg 
          className="w-5 h-5 text-cyan-400 opacity-90 drop-shadow-[0_0_8px_rgba(0,212,255,0.7)] shrink-0" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="1.6" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
        <div 
          className="text-white/80 text-xs font-medium tracking-wider"
          style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.8)' }}
        >
          Desenvolvido por <strong className="text-white font-bold tracking-normal">rbtecX</strong> - Ribeirão Preto | SP
        </div>
      </div>
    </div>
  );
}
