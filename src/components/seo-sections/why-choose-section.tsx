import { Film, Mic2, Music2, Sparkles } from "lucide-react";
import type { SeoPageContent } from "@/lib/seo-pages";
import { SamplePreview } from "./sample-preview";
import { SectionHeading } from "./section-heading";

const FEATURE_ICONS = [Music2, Mic2, Film, Sparkles] as const;
const SEO_IMAGE_VERSION = "20260622";

export function WhyChooseSection({
  content,
  previewImage,
}: {
  content: NonNullable<SeoPageContent["whyChoose"]>;
  previewImage?: string;
}) {
  const imageSrc = previewImage ? `${previewImage}?v=${SEO_IMAGE_VERSION}` : null;

  return (
    <section className="bg-brand-soft px-5 py-[70px] lg:py-[120px]">
      <div className="mx-auto max-w-[1180px]">
        <SectionHeading title={content.title} description={content.description} />

        <div className="mt-12 grid items-center gap-8 rounded-md border border-brand-line bg-brand-panel p-5 shadow-sm lg:grid-cols-[0.95fr_1.05fr] lg:p-8">
          <div>
            <h3 className="text-balance text-xl font-bold leading-7 text-brand-ink lg:text-3xl lg:leading-10">
              {content.highlight.title}
            </h3>
            <p className="mt-5 text-sm font-normal leading-5 text-brand-muted lg:text-base lg:leading-7">
              {content.highlight.description}
            </p>
          </div>
          {imageSrc ? (
            <div className="relative aspect-video overflow-hidden rounded-md border border-brand-line bg-brand-stage-gradient shadow-[0_22px_70px_var(--brand-elevation-shadow-soft)]">
              <img
                src={imageSrc}
                alt={content.highlight.title}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          ) : (
            <SamplePreview />
          )}
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {content.cards.slice(0, 3).map((feature, index) => {
            const Icon = FEATURE_ICONS[index % FEATURE_ICONS.length];
            return (
              <article key={feature.title} className="rounded-md border border-brand-line bg-brand-panel p-6 shadow-sm">
                <div className="mb-5 flex size-12 items-center justify-center rounded-md bg-brand-accent-soft text-brand-accent-hover">
                  <Icon className="size-6" />
                </div>
                <h3 className="text-base font-semibold leading-6 text-brand-ink lg:text-2xl lg:leading-8">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm font-normal leading-5 text-brand-muted lg:text-base lg:leading-6">
                  {feature.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
