import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CirclePlay,
  Film,
  Instagram,
  Mic2,
  Music2,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  Youtube,
} from "lucide-react";
import { LyricVideoHomeTool } from "@/components/lyric-video-home-tool";
import { Link } from "@/core/i18n/navigation";

type TextPair = {
  other: string;
  here: string;
};

type StyleItem = {
  name: string;
  badge: "FREE" | "PRO";
  description: string;
};

type StepItem = {
  label: string;
  title: string;
  description: string;
};

type ComparisonRow = {
  feature: string;
  free: string;
  pro: string;
  unlimited: string;
};

type UseCaseItem = {
  title: string;
  description: string;
};

type FaqItem = {
  question: string;
  answer: string;
};

const STYLE_BACKGROUNDS = [
  "from-cyan-300 via-fuchsia-400 to-brand-ink",
  "from-brand-panel via-brand-soft to-slate-300",
  "from-indigo-950 via-violet-700 to-rose-500",
  "from-amber-100 via-brand-panel to-stone-400",
  "from-zinc-950 via-zinc-700 to-zinc-200",
  "from-orange-300 via-pink-400 to-sky-500",
] as const;

const USE_CASE_ICONS = [Youtube, Music2, Instagram, Film, Mic2, Sparkles] as const;

function SectionHeading({
  title,
  description,
  align = "center",
}: {
  title: string;
  description?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <h2 className="text-balance text-3xl font-black leading-tight text-brand-ink sm:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base font-semibold leading-7 text-brand-muted sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function StylePreview({ index }: { index: number }) {
  return (
    <div className={`relative aspect-video overflow-hidden rounded-md bg-gradient-to-br ${STYLE_BACKGROUNDS[index % STYLE_BACKGROUNDS.length]}`}>
      <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.28),transparent)] opacity-70" />
      <div className="absolute inset-x-5 bottom-5 flex h-14 items-end gap-1.5">
        {Array.from({ length: 15 }).map((_, barIndex) => (
          <span
            key={barIndex}
            className="w-full animate-pulse rounded-full bg-white/80"
            style={{
              height: `${18 + ((barIndex * 19 + index * 11) % 38)}px`,
              animationDelay: `${barIndex * 90}ms`,
            }}
          />
        ))}
      </div>
      <div className="absolute left-5 top-5 flex items-center gap-2 rounded-md bg-black/32 px-3 py-1.5 text-xs font-black uppercase text-white backdrop-blur">
        <Music2 className="size-3.5" />
        Preview
      </div>
    </div>
  );
}

export async function FreePage() {
  const t = await getTranslations("landing.free_page");
  const trustItems = t.raw("trust.items") as string[];
  const manifestoRows = t.raw("manifesto.rows") as TextPair[];
  const styleItems = t.raw("styles.items") as StyleItem[];
  const steps = t.raw("how_it_works.steps") as StepItem[];
  const comparisonRows = t.raw("comparison.rows") as ComparisonRow[];
  const useCases = t.raw("use_cases.items") as UseCaseItem[];
  const faqs = t.raw("faq.items") as FaqItem[];

  return (
    <main className="flex-1 bg-brand-page text-brand-ink">
      <section className="relative isolate overflow-hidden px-5 pb-12 pt-14 sm:px-8 lg:pb-16 lg:pt-20">
        <div className="pointer-events-none absolute left-0 top-28 -z-10 h-[380px] w-[260px] opacity-70 bg-brand-hero-dots-left" />
        <div className="pointer-events-none absolute right-0 top-28 -z-10 h-[420px] w-[300px] opacity-70 bg-brand-hero-dots-right" />

        <div className="mx-auto max-w-[1180px]">
          <div className="mx-auto max-w-[820px] text-center">
            <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-md border border-brand-line bg-brand-panel px-3 py-1.5 text-sm font-black text-brand-muted">
              <ShieldCheck className="size-4 text-brand-accent-hover" />
              {t("hero.badge")}
            </p>
            <h1 className="text-balance text-[42px] font-black leading-tight text-brand-ink sm:text-[64px] lg:text-[72px]">
              {t("hero.h1")}
            </h1>
            <p className="mx-auto mt-6 max-w-[760px] text-pretty text-lg font-semibold leading-8 text-brand-muted lg:text-xl">
              {t("hero.subhead")}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="#free-tool"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand-accent px-6 text-base font-black text-brand-accent-ink shadow-[0_16px_40px_var(--brand-accent-shadow-soft)] transition-colors hover:bg-brand-accent-hover sm:w-auto"
              >
                <Upload className="size-5" />
                {t("hero.primary_cta")}
              </a>
              <a
                href="#free-styles"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-brand-line bg-brand-panel px-6 text-base font-black text-brand-ink transition-colors hover:bg-brand-accent-soft sm:w-auto"
              >
                <CirclePlay className="size-5" />
                {t("hero.secondary_cta")}
              </a>
            </div>
          </div>

          <div id="free-tool" className="mx-auto mt-10 w-full max-w-[960px] scroll-mt-28">
            <div className="mb-4 rounded-md border border-brand-line bg-brand-panel px-4 py-3 text-center text-sm font-semibold text-brand-muted">
              {t("hero.upload_note")}
            </div>
            <LyricVideoHomeTool />
            <p className="mt-4 text-center text-sm font-semibold text-brand-muted">
              {t("hero.lyrics_option")}
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-brand-line bg-brand-panel px-5 py-5">
        <div className="mx-auto grid max-w-[980px] grid-cols-2 gap-3 text-sm font-black text-brand-ink sm:text-base lg:grid-cols-4">
          {trustItems.map((item) => (
            <div key={item} className="flex items-center justify-center gap-2">
              <CheckCircle2 className="size-5 shrink-0 text-brand-accent-hover" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-brand-soft px-5 py-20 text-brand-ink sm:py-28">
        <div className="mx-auto max-w-[1080px]">
          <SectionHeading title={t("manifesto.title")} />
          <div className="mt-10 overflow-hidden rounded-md border border-brand-line bg-brand-panel shadow-[0_22px_70px_var(--brand-elevation-shadow-soft)]">
            <div className="grid border-b border-brand-line bg-brand-panel-strong text-sm font-black uppercase text-brand-muted md:grid-cols-2">
              <div className="px-5 py-4">{t("manifesto.other_label")}</div>
              <div className="border-t border-brand-line px-5 py-4 md:border-l md:border-t-0">
                {t("manifesto.here_label")}
              </div>
            </div>
            {manifestoRows.map((row) => (
              <div key={row.other} className="grid border-b border-brand-line last:border-b-0 md:grid-cols-2">
                <div className="flex items-start gap-3 bg-brand-soft/70 px-5 py-5 text-base font-semibold text-brand-muted line-through decoration-2">
                  <X className="mt-1 size-5 shrink-0 text-brand-subtle" />
                  <span>{row.other}</span>
                </div>
                <div className="flex items-start gap-3 border-t border-brand-line px-5 py-5 text-base font-black text-brand-ink md:border-l md:border-t-0">
                  <Check className="mt-1 size-5 shrink-0 text-brand-accent-hover" />
                  <span>{row.here}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="free-styles" className="px-5 py-20 sm:py-28">
        <div className="mx-auto max-w-[1180px]">
          <SectionHeading title={t("styles.title")} description={t("styles.description")} />
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {styleItems.map((style, index) => (
              <article key={style.name} className="rounded-md border border-brand-line bg-brand-panel p-3 shadow-sm">
                <StylePreview index={index} />
                <div className="flex items-start justify-between gap-4 px-2 py-4">
                  <div>
                    <h3 className="text-xl font-black text-brand-ink">{style.name}</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">{style.description}</p>
                  </div>
                  <span className={style.badge === "FREE" ? "rounded-md bg-brand-accent px-2.5 py-1 text-xs font-black text-brand-accent-ink" : "rounded-md bg-brand-ink px-2.5 py-1 text-xs font-black text-brand-panel"}>
                    {style.badge}
                  </span>
                </div>
                <a
                  href="#free-tool"
                  className="mx-2 mb-2 flex h-11 items-center justify-center gap-2 rounded-md border border-brand-line font-black text-brand-ink transition-colors hover:bg-brand-accent-soft"
                >
                  {t("styles.button")}
                  <ArrowRight className="size-4" />
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-panel px-5 py-20 sm:py-28">
        <div className="mx-auto max-w-[1060px]">
          <SectionHeading title={t("how_it_works.title")} />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {steps.map((step) => (
              <article key={step.label} className="rounded-md border border-brand-line bg-brand-soft/45 p-6">
                <div className="mb-6 flex size-12 items-center justify-center rounded-md bg-brand-accent text-lg font-black text-brand-accent-ink">
                  {step.label}
                </div>
                <h3 className="text-2xl font-black text-brand-ink">{step.title}</h3>
                <p className="mt-4 text-base font-semibold leading-7 text-brand-muted">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-soft px-5 py-20 sm:py-28">
        <div className="mx-auto max-w-[1120px]">
          <SectionHeading title={t("comparison.title")} />
          <div className="mt-10 overflow-x-auto rounded-md border border-brand-line bg-brand-panel shadow-sm">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <thead>
                <tr className="border-b border-brand-line bg-brand-panel-strong">
                  <th className="px-5 py-4 text-sm font-black text-brand-muted">{t("comparison.feature_label")}</th>
                  <th className="px-5 py-4 text-sm font-black text-brand-ink">{t("comparison.free_label")}</th>
                  <th className="px-5 py-4 text-sm font-black text-brand-ink">{t("comparison.pro_label")}</th>
                  <th className="px-5 py-4 text-sm font-black text-brand-ink">{t("comparison.unlimited_label")}</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.feature} className="border-b border-brand-line last:border-b-0">
                    <th className="px-5 py-4 text-sm font-black text-brand-ink">{row.feature}</th>
                    <td className="px-5 py-4 text-sm font-semibold text-brand-ink">{row.free}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-brand-muted">{row.pro}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-brand-muted">{row.unlimited}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="#free-tool" className="inline-flex h-12 w-full items-center justify-center rounded-md bg-brand-accent px-6 font-black text-brand-accent-ink hover:bg-brand-accent-hover sm:w-auto">
              {t("comparison.free_button")}
            </a>
            <Link href="/pricing" className="inline-flex h-12 w-full items-center justify-center rounded-md border border-brand-line bg-brand-panel px-6 font-black text-brand-ink hover:bg-brand-accent-soft sm:w-auto">
              {t("comparison.pro_button")}
            </Link>
          </div>
          <p className="mt-5 text-center text-sm font-semibold text-brand-muted">{t("comparison.note")}</p>
        </div>
      </section>

      <section className="px-5 py-20 sm:py-28">
        <div className="mx-auto max-w-[1180px]">
          <SectionHeading title={t("use_cases.title")} />
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {useCases.map((item, index) => {
              const Icon = USE_CASE_ICONS[index % USE_CASE_ICONS.length];
              return (
                <article key={item.title} className="rounded-md border border-brand-line bg-brand-panel p-5 shadow-sm">
                  <div className="mb-5 flex aspect-video items-center justify-center rounded-md bg-brand-stage-gradient text-brand-panel">
                    <Icon className="size-12 drop-shadow" />
                  </div>
                  <h3 className="text-xl font-black text-brand-ink">{item.title}</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">{item.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="faq" className="bg-brand-soft px-5 py-20 sm:py-28">
        <div className="mx-auto max-w-[900px]">
          <SectionHeading title={t("faq.title")} />
          <div className="mt-10 divide-y divide-brand-line overflow-hidden rounded-md border border-brand-line bg-brand-panel">
            {faqs.map((faq) => (
              <details key={faq.question} className="group px-5 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-base font-black text-brand-ink">
                  {faq.question}
                  <span className="text-2xl leading-none text-brand-accent-hover group-open:rotate-45">+</span>
                </summary>
                <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-brand-muted">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-ink px-5 py-20 text-center text-brand-panel sm:py-24">
        <div className="mx-auto max-w-[780px]">
          <h2 className="text-balance text-4xl font-black leading-tight sm:text-6xl">{t("bottom_cta.title")}</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg font-semibold leading-8 text-brand-panel/78">
            {t("bottom_cta.description")}
          </p>
          <a
            href="#free-tool"
            className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-md bg-brand-accent px-8 font-black text-brand-accent-ink hover:bg-brand-accent-hover sm:w-auto"
          >
            {t("bottom_cta.primary")}
          </a>
          <p className="mt-5 text-sm font-semibold text-brand-panel/70">
            {t("bottom_cta.pricing_prefix")}{" "}
            <Link href="/pricing" className="text-brand-accent underline underline-offset-4">
              {t("bottom_cta.pricing_link")}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
