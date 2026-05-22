import { Link } from "@/core/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Languages, MonitorPlay, SlidersHorizontal, Upload } from "lucide-react";

const VIDEO_EXAMPLES = [
  ["The Giants Are Marching Home", "Automatic Ape", "https://media.lyricedits.ai/featured/the-giants-are-marching-home-4k.webm"],
  ["Bubbles", "Biffy Clyro", "https://media.lyricedits.ai/featured/bubbles-4k.webm"],
  ["Filla On Ets", "Ferran Saurina", "https://media.lyricedits.ai/featured/filla-on-ets.webm"],
  ["Tease Her", "Strange Fiction", "https://media.lyricedits.ai/featured/tease-her-4k.webm"],
  ["Ultimo Aliento", "Daeria", "https://media.lyricedits.ai/featured/ultimo-aliento-4k.webm"],
  ["Bad Chick", "The Madpix Project", "https://media.lyricedits.ai/featured/bad-chick-4k.webm"],
] as const;

export async function Hero() {
  const t = await getTranslations("landing");

  return (
    <>
      <section className="bg-white px-5 pb-14 pt-6 text-slate-950">
        <div className="mx-auto max-w-[1040px] text-center">
          <h1 className="mx-auto mt-10 max-w-[640px] text-balance text-5xl font-black leading-[0.98] tracking-[-0.04em] sm:text-[64px]">
            {t("hero.headline_start")}
            <span className="text-[#fbbf24]"> {t("hero.headline_accent")}</span>
          </h1>
          <p className="mt-5 text-base font-semibold text-slate-500">
            {t("hero.subheadline")}
          </p>

          <div className="mx-auto mt-9 rounded-md border border-slate-200 bg-white px-5 py-8 shadow-[0_1px_0_rgba(15,23,42,0.02)] sm:px-10">
            <h2 className="text-xl font-bold text-slate-600">{t("hero.upload_title")}</h2>
            <div className="mx-auto my-7 flex h-8 items-center justify-center gap-1 text-[#fbbf24]">
              {Array.from({ length: 18 }).map((_, index) => (
                <span
                  key={index}
                  className="w-1 rounded-full bg-gradient-to-b from-[#fde68a] to-[#f97316]"
                  style={{ height: `${8 + Math.abs(9 - index) * 2}px` }}
                />
              ))}
            </div>
            <Link
              href="/dashboard/lyric-videos/upload"
              className="inline-flex h-[54px] items-center justify-center gap-3 rounded-[9px] bg-[#fbbf24] px-8 text-xl font-extrabold text-slate-950 transition-colors hover:bg-[#f59e0b]"
            >
              <Upload className="size-5" />
              {t("hero.cta")}
            </Link>
            <p className="mt-4 text-xs font-semibold text-slate-500">
              {t("hero.file_note")}
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-[1040px] gap-8 text-left md:grid-cols-3">
            {[
              { icon: MonitorPlay, key: "free_preview" },
              { icon: SlidersHorizontal, key: "customizable" },
              { icon: Languages, key: "languages" },
            ].map(({ icon: Icon, key }) => (
              <div key={key} className="flex gap-3">
                <Icon className="mt-1 size-5 shrink-0 text-slate-950" />
                <div>
                  <h3 className="font-extrabold">{t(`hero.benefits.${key}.title`)}</h3>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                    {t(`hero.benefits.${key}.description`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f4f4f5] px-5 py-20 text-slate-950">
        <div className="mx-auto max-w-[1360px]">
          <div className="text-center">
            <h2 className="text-3xl font-black tracking-[-0.03em] sm:text-4xl">
              {t("featured.title")}
            </h2>
            <p className="mt-4 font-semibold text-slate-500">{t("featured.description")}</p>
          </div>

          <div className="mt-20 grid gap-x-10 gap-y-20 md:grid-cols-3">
            {VIDEO_EXAMPLES.map(([title, artist, src]) => (
              <div key={title}>
                <video
                  className="aspect-video w-full rounded-sm bg-zinc-200 object-cover"
                  src={src}
                  autoPlay
                  muted
                  loop
                  playsInline
                />
                <h3 className="mt-4 text-sm font-extrabold">{title}</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">{artist}</p>
              </div>
            ))}
          </div>

          <div className="mt-20 text-center">
            <Link
              href="/dashboard/lyric-videos/upload"
              className="inline-flex h-[54px] items-center justify-center gap-3 rounded-[9px] bg-[#fbbf24] px-8 text-xl font-extrabold text-slate-950 hover:bg-[#f59e0b]"
            >
              <Upload className="size-5" />
              {t("hero.cta")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
