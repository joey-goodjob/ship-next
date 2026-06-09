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
    <section className="relative isolate overflow-hidden bg-[#fbfcfc] px-5 pb-8 pt-14 text-slate-950 sm:px-8 lg:pb-10 lg:pt-16">
      <div className="pointer-events-none absolute -left-24 top-40 -z-10 h-[560px] w-[320px] rounded-full bg-teal-100/60 blur-3xl" />
      <div className="pointer-events-none absolute -right-28 top-32 -z-10 h-[620px] w-[380px] rounded-full bg-indigo-100/55 blur-3xl" />
      <div className="pointer-events-none absolute left-0 top-36 -z-10 h-[420px] w-[260px] opacity-70 [background:repeating-radial-gradient(ellipse_at_left,rgba(20,184,166,0.15)_0_1px,transparent_1px_13px)]" />
      <div className="pointer-events-none absolute right-0 top-32 -z-10 h-[480px] w-[300px] opacity-70 [background:repeating-radial-gradient(ellipse_at_right,rgba(99,102,241,0.14)_0_1px,transparent_1px_13px)]" />

      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto max-w-[760px] text-center">
          <h1 className="text-balance text-[44px] font-black leading-[1.08] tracking-[-0.022em] text-[#050b24] sm:text-[64px] lg:text-[72px]">
            {t("hero.headline_start")}
            <span className="text-cyan-500"> {t("hero.headline_accent")}</span>
          </h1>

          <p className="mx-auto mt-7 max-w-[680px] text-pretty text-lg font-semibold leading-8 text-slate-500 lg:text-xl">
            {t("hero.subheadline")}
          </p>

          <div className="mx-auto mt-7 h-14 max-w-[380px] text-cyan-400">
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

        <div className="mx-auto mt-6 w-full max-w-[960px]">
          <LyricVideoHomeTool />
        </div>

        <div className="mt-12 rounded-[18px] border border-slate-200/90 bg-white/78 px-6 py-8 shadow-[0_18px_55px_rgba(15,23,42,0.06)] sm:px-10">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map(({ key, icon: Icon }) => (
              <div key={key} className="text-center lg:border-r lg:border-slate-200 lg:px-8 lg:last:border-r-0">
                <span className="mx-auto flex size-16 items-center justify-center rounded-[16px] bg-teal-50 text-teal-700 shadow-[inset_0_0_0_1px_rgba(20,184,166,0.08)]">
                  <Icon className="size-7" />
                </span>
                <h3 className="mt-5 text-base font-extrabold text-[#050b24]">{t(`hero.benefits.${key}.title`)}</h3>
                <p className="mt-3 text-sm font-medium leading-6 text-slate-500">
                  {t(`hero.benefits.${key}.description`)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-7 flex items-center justify-center gap-3 text-center text-sm font-semibold text-slate-500">
          <Heart className="size-5 fill-cyan-400 text-cyan-400" />
          {t("hero.loved_by")}
        </p>
      </div>
    </section>
  );
}
