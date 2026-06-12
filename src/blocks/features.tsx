import { getTranslations } from "next-intl/server";
import { Link } from "@/core/i18n/navigation";
import { Check, Clapperboard, MonitorPlay, ShieldCheck, Upload, WandSparkles } from "lucide-react";

const STATS = [
  ["90,000+", "lyric videos created"],
  ["20,000+", "music creators and labels"],
  ["85+", "languages supported"],
] as const;

export async function Features() {
  const t = await getTranslations("landing");

  return (
    <>
      <section id="features" className="bg-brand-panel px-5 py-[70px] text-brand-ink lg:py-[120px]">
        <div className="mx-auto max-w-[720px]">
          <h2 className="text-balance text-xl font-bold leading-[25px] lg:text-4xl lg:leading-10">
            {t("story.title")}
          </h2>
          <div className="mt-8 space-y-5 text-sm font-normal leading-5 text-brand-muted lg:mt-12 lg:text-base lg:leading-6">
            <p>{t("story.p1")}</p>
            <p>{t("story.p2")}</p>
            <blockquote className="border-l-4 border-brand-line py-2 pl-6 text-base italic leading-6 text-brand-ink lg:text-lg lg:leading-7">
              {t("story.quote")}
            </blockquote>
            <p>{t("story.p3")}</p>
          </div>

          <h3 className="mt-16 text-center text-xl font-bold leading-[25px] lg:mt-20 lg:text-4xl lg:leading-10">
            {t("story.exists")}
          </h3>
          <div className="mt-12 grid gap-10 md:grid-cols-2">
            <div className="space-y-5 text-sm font-normal leading-5 text-brand-muted lg:text-base lg:leading-6">
              <p>{t("story.solution_left_1")}</p>
              <p>{t("story.solution_left_2")}</p>
            </div>
            <div className="border-l border-brand-line pl-8">
              {["not_magic", "human"].map((key) => (
                <div key={key} className="mb-8">
                  <h4 className="flex items-center gap-3 text-sm font-semibold leading-5">
                    <span className="size-2 rounded-sm bg-brand-ink" />
                    {t(`story.${key}.title`)}
                  </h4>
                  <p className="mt-4 text-sm font-normal leading-5 text-brand-muted lg:text-base lg:leading-6">
                    {t(`story.${key}.description`)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-24 text-center">
            <h3 className="text-balance text-xl font-bold leading-[25px] lg:text-4xl lg:leading-10">
              {t("creativity.title")} <span className="text-brand-accent">{t("creativity.accent")}</span>
            </h3>
            <p className="mt-5 text-sm font-normal leading-5 text-brand-muted lg:mt-6 lg:text-base lg:leading-6">{t("creativity.description")}</p>
            <Link href="/#create" className="mt-8 inline-flex h-11 items-center justify-center gap-3 rounded-[9px] bg-brand-accent px-6 text-base font-semibold leading-6 text-brand-ink hover:bg-brand-accent-hover">
              <Upload className="size-5" />
              {t("hero.cta")}
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-brand-soft px-5 py-[70px] text-brand-ink lg:py-[120px]">
        <div className="mx-auto grid max-w-[1200px] items-center gap-14 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="flex items-center gap-3 text-xl font-bold leading-[25px] lg:text-4xl lg:leading-10">
              <WandSparkles className="size-7" />
              {t("maker.title")}
            </h2>
            <div className="mt-6 space-y-5 text-sm font-normal leading-5 lg:mt-8 lg:text-base lg:leading-6">
              <p>{t("maker.p1")}</p>
              <p>{t("maker.p2")}</p>
              <p>{t("maker.p3")}</p>
            </div>
            <Link href="/#create" className="mt-6 inline-flex items-center gap-2 border-b border-brand-ink text-base font-semibold leading-6">
              {t("maker.link")} <span>→</span>
            </Link>
          </div>

          <div className="relative rounded-sm bg-brand-preview-gradient p-3 shadow-xl">
            <div className="overflow-hidden bg-brand-panel shadow-sm">
              <div className="flex h-8 items-center border-b bg-brand-panel-strong px-3 text-[10px] font-semibold text-brand-muted">
                LyricVideo AI Editor
              </div>
              <div className="grid aspect-video grid-cols-[0.72fr_1fr] gap-4 p-5">
                <div className="relative overflow-hidden rounded-sm bg-brand-stage-gradient">
                  <span className="absolute bottom-8 left-1/2 -translate-x-1/2 text-2xl font-bold leading-8 text-brand-accent drop-shadow">TIME ME</span>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="h-8 rounded bg-brand-soft" />
                  <div className="h-14 rounded bg-brand-soft" />
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <div key={index} className="aspect-square rounded bg-brand-tile-gradient" />
                    ))}
                  </div>
                </div>
              </div>
              <div className="h-10 border-t bg-brand-panel-strong" />
            </div>
          </div>
        </div>

        <div className="mx-auto mt-24 max-w-[980px] text-center">
          <h2 className="text-xl font-bold leading-[25px] lg:text-4xl lg:leading-10">{t("stats.title")}</h2>
          <p className="mt-4 text-sm font-normal leading-5 text-brand-muted lg:mt-5 lg:text-base lg:leading-6">{t("stats.description")}</p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {STATS.map(([value, label]) => (
              <div key={value} className="rounded-2xl border border-brand-line bg-brand-panel px-8 py-7 shadow-sm">
                <div className="text-2xl font-bold leading-8 text-brand-ink lg:text-[28px] lg:leading-[42px]">{value}</div>
                <p className="mt-2 text-sm font-normal leading-5 text-brand-muted lg:text-base lg:leading-6">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-soft px-5 py-[70px] text-brand-ink lg:py-[120px]">
        <div className="mx-auto grid max-w-[1200px] items-center gap-14 lg:grid-cols-2">
          <div>
            <h2 className="flex items-center gap-3 text-xl font-bold leading-[25px] lg:text-4xl lg:leading-10">
              <Clapperboard className="size-7" />
              {t("export.title")}
            </h2>
            <p className="mt-5 max-w-xl text-sm font-normal leading-5 lg:mt-7 lg:text-base lg:leading-6">{t("export.description")}</p>
            <Link href="/pricing" className="mt-6 inline-flex items-center gap-2 border-b border-brand-ink text-base font-semibold leading-6">
              {t("export.link")} <span>→</span>
            </Link>
          </div>
          <div className="flex items-center justify-center gap-8">
            <img src="/lyricedits-assets/premiere.svg" alt="Premiere" className="w-24 lg:w-32" />
            <img src="/lyricedits-assets/davinci-big.png" alt="DaVinci Resolve" className="w-28 lg:w-36" />
            <img src="/lyricedits-assets/fcpx-big.png" alt="Final Cut Pro" className="w-24 lg:w-32" />
          </div>
        </div>
      </section>

      <section className="bg-brand-panel px-5 py-[70px] text-center text-brand-ink lg:py-[120px]">
        <h2 className="text-xl font-bold leading-[25px] lg:text-4xl lg:leading-10">{t("try_free.title")}</h2>
        <p className="mt-4 text-sm font-normal leading-5 text-brand-muted lg:mt-6 lg:text-base lg:leading-6">{t("try_free.description")}</p>
        <div className="mx-auto mt-10 grid max-w-[620px] grid-cols-2 gap-8 md:grid-cols-4">
          {[
            ["preview", MonitorPlay],
            ["watermark", Check],
            ["rights", ShieldCheck],
            ["cancel", Upload],
          ].map(([key, Icon]) => (
            <div key={key as string} className="flex flex-col items-center gap-3">
              <Icon className="size-8" />
              <span className="text-sm font-semibold leading-5 lg:text-base lg:leading-6">{t(`try_free.${key}`)}</span>
            </div>
          ))}
        </div>
        <Link href="/#create" className="mt-12 inline-flex h-11 items-center justify-center gap-3 rounded-[9px] bg-brand-accent px-6 text-base font-semibold leading-6 text-brand-ink hover:bg-brand-accent-hover">
          <Upload className="size-5" />
          {t("try_free.button")}
        </Link>
      </section>
    </>
  );
}
