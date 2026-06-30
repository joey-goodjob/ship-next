import { getTranslations } from "next-intl/server";
import { Link } from "@/core/i18n/navigation";
import { ArrowRight, AudioLines, Clapperboard, Upload, WandSparkles } from "lucide-react";

type FeatureCard = {
  icon: "lyrics" | "video" | "export";
  title: string;
  description: string;
  tags: string[];
  cta: string;
  href: string;
};

const CARD_ICONS = {
  lyrics: AudioLines,
  video: WandSparkles,
  export: Clapperboard,
} as const;

const HOME_FEATURE_IMAGE_BASE = "https://cdn.lyricvideomaker.app/imgs/seo/home";

const CARD_IMAGES: Record<FeatureCard["icon"], string | undefined> = {
  lyrics: `${HOME_FEATURE_IMAGE_BASE}/feature-lyrics.webp`,
  video: `${HOME_FEATURE_IMAGE_BASE}/feature-video.webp`,
  export: `${HOME_FEATURE_IMAGE_BASE}/feature-export.webp`,
};

export async function Features() {
  const t = await getTranslations("landing");
  const cards = t.raw("feature_cards") as FeatureCard[];

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

          <div className="mt-16 text-center lg:mt-20">
            <Link href="/#create" className="inline-flex h-11 items-center justify-center gap-3 rounded-[9px] bg-brand-accent px-6 text-base font-semibold leading-6 text-brand-accent-ink hover:bg-brand-accent-hover">
              <Upload className="size-5" />
              {t("hero.cta")}
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-brand-soft px-5 py-[70px] text-brand-ink lg:py-[120px]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 lg:gap-8">
          {cards.map((card, index) => {
            const Icon = CARD_ICONS[card.icon];
            const imageSrc = CARD_IMAGES[card.icon];
            const imageFirst = index % 2 === 0;

            return (
              <article
                key={card.title}
                className="grid items-stretch overflow-hidden rounded-2xl border border-brand-line bg-brand-panel shadow-[0_18px_50px_var(--brand-elevation-shadow-soft)] lg:grid-cols-2"
              >
                <div
                  className={`relative min-h-[240px] bg-brand-stage-gradient lg:min-h-[320px] ${
                    imageFirst ? "lg:order-1" : "lg:order-2"
                  }`}
                >
                  {imageSrc ? (
                    <img src={imageSrc} alt={card.title} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Icon className="size-20 text-brand-accent/70 drop-shadow lg:size-24" aria-hidden={true} />
                    </div>
                  )}
                </div>

                <div
                  className={`flex flex-col justify-center gap-5 p-8 lg:p-12 ${
                    imageFirst ? "lg:order-2" : "lg:order-1"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-brand-accent-soft text-brand-accent">
                      <Icon className="size-5" />
                    </span>
                    <h2 className="text-xl font-bold leading-7 lg:text-2xl lg:leading-8">{card.title}</h2>
                  </div>

                  <p className="text-sm font-normal leading-6 text-brand-muted lg:text-base lg:leading-7">
                    {card.description}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {card.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-brand-line bg-brand-panel-strong px-3 py-1 text-xs font-medium text-brand-ink"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <Link
                    href={card.href}
                    className="mt-1 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-brand-accent px-5 text-sm font-semibold leading-5 text-brand-accent-ink hover:bg-brand-accent-hover"
                  >
                    {card.cta}
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

    </>
  );
}
