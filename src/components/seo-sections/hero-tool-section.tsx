import { CirclePlay, Sparkles, Upload } from "lucide-react";
import { LyricVideoHomeTool } from "@/components/lyric-video-home-tool";
import type { SeoPageContent } from "@/lib/seo-pages";

function splitHeroH1(h1: string): [string, string | null] {
  // Highlight the part after the first em-dash run (" — " in en, "——" in zh).
  const m = h1.match(/—+/);
  if (!m || m.index === undefined) return [h1, null];
  let i = m.index + m[0].length;
  while (i < h1.length && h1[i] === " ") i += 1;
  const accent = h1.slice(i);
  if (!accent) return [h1, null];
  return [h1.slice(0, i), accent];
}

export function HeroToolSection({ hero }: { hero: NonNullable<SeoPageContent["hero"]> }) {
  const [h1Lead, h1Accent] = splitHeroH1(hero.h1);
  return (
    <section className="relative isolate overflow-hidden px-5 pb-[70px] pt-14 sm:px-8 lg:pb-[96px] lg:pt-20">
      <div className="pointer-events-none absolute left-0 top-28 -z-10 h-[380px] w-[260px] opacity-70 bg-brand-hero-dots-left" />
      <div className="pointer-events-none absolute right-0 top-28 -z-10 h-[420px] w-[300px] opacity-70 bg-brand-hero-dots-right" />

      <div className="mx-auto max-w-[1180px]">
        <div className="mx-auto max-w-[860px] text-center">
          <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-md border border-brand-line bg-brand-panel px-3 py-1.5 text-sm font-semibold leading-5 text-brand-muted">
            <Sparkles className="size-4 text-brand-accent-hover" />
            {hero.badge}
          </p>
          <h1 className="text-balance text-2xl font-bold leading-8 text-brand-ink lg:text-[40px] lg:leading-[60px]">
            {h1Lead}
            {h1Accent && (
              <span className="bg-gradient-to-r from-amber-200 via-brand-accent to-amber-500 bg-clip-text text-transparent">
                {h1Accent}
              </span>
            )}
          </h1>
          <p className="mx-auto mt-2.5 max-w-[760px] text-pretty text-sm font-normal leading-5 text-brand-muted lg:mt-4 lg:text-base lg:leading-6">
            {hero.subhead}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#seo-tool"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-accent px-6 text-base font-semibold leading-6 text-brand-accent-ink shadow-[0_16px_40px_var(--brand-accent-shadow-soft)] transition-colors hover:bg-brand-accent-hover sm:w-auto"
            >
              <Upload className="size-5" />
              {hero.primaryCta}
            </a>
            <a
              href="#seo-how-it-works"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-brand-line bg-brand-panel px-6 text-base font-semibold leading-6 text-brand-ink transition-colors hover:bg-brand-accent-soft sm:w-auto"
            >
              <CirclePlay className="size-5" />
              {hero.secondaryCta}
            </a>
          </div>
        </div>

        <div id="seo-tool" className="mx-auto mt-10 w-full max-w-[1220px] scroll-mt-28">
          <LyricVideoHomeTool showMaterialCarousel />
        </div>
      </div>
    </section>
  );
}
