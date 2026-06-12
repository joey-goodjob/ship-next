import { getTranslations } from "next-intl/server";
import {
  Heart,
  Globe2,
  LockKeyhole,
  MonitorPlay,
  SlidersHorizontal,
} from "lucide-react";
import { LyricVideoHomeTool } from "@/components/lyric-video-home-tool";

const BENEFITS = [
  { key: "free_preview", icon: MonitorPlay },
  { key: "customizable", icon: SlidersHorizontal },
  { key: "languages", icon: Globe2 },
  { key: "secure_private", icon: LockKeyhole },
] as const;

export async function Hero() {
  const t = await getTranslations("landing");

  return (
    <section className="relative isolate overflow-hidden bg-brand-page px-5 pb-[70px] pt-14 text-brand-ink sm:px-8 lg:pb-[96px] lg:pt-16">
      <div className="pointer-events-none absolute left-0 top-36 -z-10 h-[420px] w-[260px] opacity-70 bg-brand-hero-dots-left" />
      <div className="pointer-events-none absolute right-0 top-32 -z-10 h-[480px] w-[300px] opacity-70 bg-brand-hero-dots-right" />

      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto max-w-[1060px] text-center">
          <h1 className="text-balance text-2xl font-bold leading-8 text-brand-ink lg:text-[40px] lg:leading-[60px]">
            {t("hero.headline_start")}
            <span className="text-brand-accent"> {t("hero.headline_accent")}</span>
          </h1>

          <p className="mx-auto mt-2.5 max-w-[680px] text-pretty text-sm font-normal leading-5 text-brand-muted lg:mt-4 lg:text-base lg:leading-6">
            {t("hero.subheadline")}
          </p>

          <div className="mx-auto mt-7 h-14 max-w-[380px] text-brand-accent">
            <svg viewBox="0 0 380 64" preserveAspectRatio="none" className="h-full w-full" aria-hidden={true}>
              {Array.from({ length: 48 }).map((_, index) => {
                const centerWeight = 1 - Math.abs(index - 23.5) / 23.5;
                const height = Math.round(4 + centerWeight * 32 + Math.abs(Math.sin(index * 0.88)) * 18);
                const x = 18 + index * 7;
                const y = (64 - height) / 2;
                return (
                  <line
                    key={index}
                    x1={x}
                    x2={x}
                    y1={y}
                    y2={y + height}
                    stroke="currentColor"
                    strokeOpacity={index % 3 === 0 ? 0.48 : 0.82}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                );
              })}
            </svg>
          </div>
        </div>

        <div className="mx-auto mt-6 w-full max-w-[1220px]">
          <LyricVideoHomeTool showMaterialCarousel />
        </div>

        <div className="mt-12 rounded-[18px] border border-brand-line/90 bg-brand-panel/78 px-6 py-8 shadow-[0_18px_55px_var(--brand-elevation-shadow-soft)] sm:px-10">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map(({ key, icon: Icon }) => (
              <div key={key} className="text-center lg:border-r lg:border-brand-line lg:px-8 lg:last:border-r-0">
                <span className="mx-auto flex size-16 items-center justify-center rounded-[16px] bg-brand-accent-soft text-brand-accent-hover shadow-[inset_0_0_0_1px_var(--brand-accent-hairline)]">
                  <Icon className="size-7" />
                </span>
                <h3 className="mt-5 text-base font-semibold leading-6 text-brand-ink">{t(`hero.benefits.${key}.title`)}</h3>
                <p className="mt-3 text-sm font-normal leading-5 text-brand-muted">
                  {t(`hero.benefits.${key}.description`)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-7 flex items-center justify-center gap-3 text-center text-sm font-normal leading-5 text-brand-muted">
          <Heart className="size-5 fill-brand-accent text-brand-accent" />
          {t("hero.loved_by")}
        </p>
      </div>
    </section>
  );
}
