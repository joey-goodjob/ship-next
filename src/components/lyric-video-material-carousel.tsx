"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Images } from "lucide-react";
import { cn } from "@/lib/utils";

const CAROUSEL_INTERVAL_MS = 3500;

const SAMPLE_MATERIALS = [
  { title: "Ace", description: "Cinematic character sample", image: "/character-library/openart-seed/ace-showcase.png" },
  { title: "Jay", description: "Music video lead sample", image: "/character-library/openart-seed/jay-showcase.png" },
  { title: "Jayden", description: "Animated lyric video sample", image: "/character-library/openart-seed/jayden-showcase.png" },
  { title: "Kai", description: "Stylized portrait sample", image: "/character-library/openart-seed/kai-showcase.png" },
  { title: "Luna", description: "Dream pop visual sample", image: "/character-library/openart-seed/luna-showcase.png" },
  { title: "Rosa", description: "Warm story scene sample", image: "/character-library/openart-seed/rosa-showcase.png" },
  { title: "Tex", description: "Performance scene sample", image: "/character-library/openart-seed/tex-showcase.png" },
  { title: "Ty", description: "Bold character sample", image: "/character-library/openart-seed/ty-showcase.png" },
  { title: "Vera", description: "Editorial visual sample", image: "/character-library/openart-seed/vera-showcase.png" },
] as const;

export function LyricVideoMaterialCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const activeMaterial = SAMPLE_MATERIALS[activeIndex] || SAMPLE_MATERIALS[0];
  const activeLabel = useMemo(() => `${activeMaterial.title}: ${activeMaterial.description}`, [activeMaterial]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);

    function updateMotionPreference(event: MediaQueryListEvent) {
      setReducedMotion(event.matches);
    }

    mediaQuery.addEventListener("change", updateMotionPreference);
    return () => mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % SAMPLE_MATERIALS.length);
    }, CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion]);

  function showPrevious() {
    setActiveIndex((current) => (current - 1 + SAMPLE_MATERIALS.length) % SAMPLE_MATERIALS.length);
  }

  function showNext() {
    setActiveIndex((current) => (current + 1) % SAMPLE_MATERIALS.length);
  }

  return (
    <aside
      className="flex h-full min-h-[440px] w-full min-w-0 flex-col rounded-[24px] border border-brand-line bg-brand-panel p-5 shadow-[0_30px_95px_var(--brand-elevation-shadow)] sm:p-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.08em] text-brand-muted">
            <Images className="size-4 text-brand-accent-hover" />
            Sample Materials
          </p>
          <p className="mt-2 truncate text-2xl font-black tracking-[-0.012em] text-brand-ink">{activeMaterial.title}</p>
        </div>
        <span className="shrink-0 rounded-md border border-brand-line bg-brand-soft px-3 py-1 text-xs font-black text-brand-muted">
          {activeIndex + 1}/{SAMPLE_MATERIALS.length}
        </span>
      </div>

      <div className="relative h-[320px] overflow-hidden rounded-[18px] border border-brand-line bg-brand-soft sm:h-[380px] lg:h-[430px]">
        <img key={activeMaterial.image} src={activeMaterial.image} alt={activeLabel} className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/72 via-black/18 to-transparent p-5 text-white">
          <p className="text-lg font-black">{activeMaterial.description}</p>
        </div>

        <button
          type="button"
          aria-label="Previous material"
          onClick={showPrevious}
          className="absolute left-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/48 text-white shadow-lg backdrop-blur transition-[background-color,transform] active:scale-95 [@media(hover:hover)]:hover:bg-black/64"
        >
          <ChevronLeft className="size-6" />
        </button>
        <button
          type="button"
          aria-label="Next material"
          onClick={showNext}
          className="absolute right-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/48 text-white shadow-lg backdrop-blur transition-[background-color,transform] active:scale-95 [@media(hover:hover)]:hover:bg-black/64"
        >
          <ChevronRight className="size-6" />
        </button>
      </div>

      <div className="mt-5 flex items-center justify-center gap-2">
        {SAMPLE_MATERIALS.map((material, index) => (
          <button
            key={material.image}
            type="button"
            aria-label={`Show ${material.title}`}
            onClick={() => setActiveIndex(index)}
            className={cn(
              "h-2.5 rounded-full transition-[background-color,width] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent",
              index === activeIndex ? "w-8 bg-brand-accent" : "w-2.5 bg-brand-line [@media(hover:hover)]:hover:bg-brand-subtle",
            )}
          />
        ))}
      </div>
    </aside>
  );
}
