import { Check, X } from "lucide-react";
import type { SeoPageContent } from "@/lib/seo-pages";
import { SectionHeading } from "./section-heading";

export function ManifestoSection({ content }: { content: NonNullable<SeoPageContent["manifesto"]> }) {
  return (
    <section className="px-5 py-[70px] lg:py-[120px]">
      <div className="mx-auto max-w-[860px]">
        <SectionHeading title={content.title} />
        <div className="mt-12 space-y-4">
          {content.rows.map((row) => (
            <div
              key={row.myth}
              className="grid items-center gap-4 rounded-md border border-brand-line bg-brand-panel p-4 shadow-sm md:grid-cols-2 md:gap-6 md:p-5"
            >
              <div className="flex items-start gap-3 text-brand-muted line-through decoration-brand-muted/40">
                <X className="mt-0.5 size-5 shrink-0 text-brand-muted/50" />
                <span className="text-sm leading-6 lg:text-base">{row.myth}</span>
              </div>
              <div className="flex items-start gap-3 text-brand-ink">
                <Check className="mt-0.5 size-5 shrink-0 text-brand-accent" />
                <span className="text-sm font-medium leading-6 lg:text-base">{row.reality}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
