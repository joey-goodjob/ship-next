"use client";

import { useEffect, useRef } from "react";

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseOpacity: number;
  phase: number;
  phaseSpeed: number;
  color: RgbColor;
};

type HeroNeuralBackgroundProps = {
  className?: string;
};

const COLORS: RgbColor[] = [
  { r: 236, g: 163, b: 7 },
  { r: 251, g: 191, b: 36 },
  { r: 245, g: 158, b: 11 },
  { r: 252, g: 211, b: 77 },
  { r: 234, g: 179, b: 8 },
  { r: 217, g: 119, b: 6 },
  { r: 251, g: 146, b: 60 },
  { r: 34, g: 211, b: 238 },
  { r: 14, g: 165, b: 233 },
  { r: 139, g: 92, b: 246 },
];

const CLUSTERS = [
  { x: 0.13, y: 0.26, spreadX: 0.18, spreadY: 0.18 },
  { x: 0.91, y: 0.72, spreadX: 0.16, spreadY: 0.2 },
  { x: 0.72, y: 0.16, spreadX: 0.24, spreadY: 0.22 },
  { x: 0.48, y: 0.9, spreadX: 0.22, spreadY: 0.16 },
];

function createSeededRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function rgba(color: RgbColor, alpha: number) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createParticles(width: number, height: number, isMobile: boolean) {
  const count = isMobile ? 35 : 85;
  const speed = isMobile ? 0.5 : 0.9;
  const random = createSeededRandom(Math.round(width * 17 + height * 31 + count));
  const particles: Particle[] = [];

  for (let index = 0; index < count; index += 1) {
    const cluster = CLUSTERS[index % CLUSTERS.length];
    const useCluster = random() < 0.7;
    const x = useCluster
      ? clamp(
          width * cluster.x + (random() - 0.5) * width * cluster.spreadX,
          -24,
          width + 24
        )
      : random() * width;
    const y = useCluster
      ? clamp(
          height * cluster.y + (random() - 0.5) * height * cluster.spreadY,
          -24,
          height + 24
        )
      : random() * height;
    const angle = random() * Math.PI * 2;
    const velocity = (0.08 + random() * 0.34) * speed;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      radius: 1.2 + random() * 1.8,
      baseOpacity: 0.45 + random() * 0.35,
      phase: random() * Math.PI * 2,
      phaseSpeed: 0.0008 + random() * 0.0014,
      color: COLORS[index % COLORS.length],
    });
  }

  return particles;
}

function drawFrame(
  context: CanvasRenderingContext2D,
  particles: Particle[],
  width: number,
  height: number,
  time: number,
  linkDistance: number,
  mouse: { x: number; y: number; active: boolean }
) {
  context.clearRect(0, 0, width, height);
  context.lineWidth = 1;

  for (let i = 0; i < particles.length; i += 1) {
    const particle = particles[i];

    for (let j = i + 1; j < particles.length; j += 1) {
      const next = particles[j];
      const dx = particle.x - next.x;
      const dy = particle.y - next.y;
      const distance = Math.hypot(dx, dy);

      if (distance < linkDistance) {
        const alpha = (1 - distance / linkDistance) * 0.4;
        context.strokeStyle = rgba(COLORS[(i + j) % COLORS.length], alpha);
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(next.x, next.y);
        context.stroke();
      }
    }

    if (mouse.active) {
      const dx = particle.x - mouse.x;
      const dy = particle.y - mouse.y;
      const distance = Math.hypot(dx, dy);

      if (distance < 180) {
        const alpha = (1 - distance / 180) * 0.8;
        context.strokeStyle = rgba(COLORS[i % COLORS.length], alpha);
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(mouse.x, mouse.y);
        context.stroke();
      }
    }
  }

  for (const particle of particles) {
    const pulse = Math.sin(time * particle.phaseSpeed + particle.phase);
    const radius = particle.radius + pulse * 0.35;
    const opacity = clamp(particle.baseOpacity + pulse * 0.18, 0.35, 0.95);

    context.shadowColor = rgba(particle.color, 0.7);
    context.shadowBlur = 10;
    context.fillStyle = rgba(particle.color, opacity);
    context.beginPath();
    context.arc(particle.x, particle.y, Math.max(radius, 0.8), 0, Math.PI * 2);
    context.fill();
  }

  context.shadowBlur = 0;
}

export function HeroNeuralBackground({ className = "" }: HeroNeuralBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!root || !canvas || !context) {
      return;
    }

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let lastTime = performance.now();
    const mouse = { x: 0, y: 0, active: false };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const rect = root.getBoundingClientRect();
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = createParticles(width, height, width < 768);
      drawFrame(context, particles, width, height, performance.now(), width < 768 ? 120 : 170, mouse);
    };

    const updateMouse = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      mouse.active = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
      mouse.x = x;
      mouse.y = y;
    };

    const clearMouse = () => {
      mouse.active = false;
    };

    const loop = (time: number) => {
      const delta = Math.min((time - lastTime) / 16.67, 2);
      lastTime = time;
      const isMobile = width < 768;
      const linkDistance = isMobile ? 120 : 170;

      for (const particle of particles) {
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;

        if (particle.x < -32 || particle.x > width + 32) {
          particle.vx *= -1;
        }

        if (particle.y < -32 || particle.y > height + 32) {
          particle.vy *= -1;
        }
      }

      drawFrame(context, particles, width, height, time, linkDistance, mouse);
      animationFrame = window.requestAnimationFrame(loop);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(root);
    window.addEventListener("pointermove", updateMouse);
    window.addEventListener("pointerleave", clearMouse);

    resize();

    if (!reduceMotion) {
      animationFrame = window.requestAnimationFrame(loop);
    }

    return () => {
      observer.disconnect();
      window.removeEventListener("pointermove", updateMouse);
      window.removeEventListener("pointerleave", clearMouse);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden={true}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <div className="absolute left-[6%] top-[18%] h-72 w-72 rounded-full bg-amber-400/12 blur-3xl" />
      <div className="absolute bottom-[8%] right-[4%] h-80 w-80 rounded-full bg-yellow-500/8 blur-3xl" />
      <div className="absolute right-[28%] top-[10%] h-64 w-64 rounded-full bg-cyan-400/6 blur-3xl" />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
