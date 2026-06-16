import { Palette } from "lucide-react";
import type { SeoPageContent } from "@/lib/seo-pages";
import { SectionHeading } from "./section-heading";

export function StylesSection({ content }: { content: NonNullable<SeoPageContent["styles"]> }) {
  return (
    <section className="bg-brand-soft px-5 py-[70px] lg:py-[120px]">
      <div className="mx-auto max-w-[1180px]">
        <SectionHeading title={content.title} description={content.subtitle} />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {content.items.map((style) => (
            <article
              key={style.name}
              className="relative rounded-md border border-brand-line bg-brand-panel p-5 shadow-sm"
            >
              <span
                className={`absolute right-4 top-4 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                  style.free
                    ? "bg-brand-accent-soft text-brand-accent"
                    : "bg-brand-muted/10 text-brand-muted"
                }`}
              >
                {style.free ? "FREE" : "PRO"}
              </span>
              <div className="mb-4 flex aspect-video items-center justify-center rounded-md bg-brand-stage-gradient text-brand-panel">
                <Palette className="size-10 drop-shadow" />
              </div>
              <h3 className="text-base font-semibold leading-6 text-brand-ink">{style.name}</h3>
              <p className="mt-1.5 text-sm leading-5 text-brand-muted">{style.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
