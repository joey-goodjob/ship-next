import { ArrowRight } from "lucide-react";
import type { SeoPageContent } from "@/lib/seo-pages";

export function BottomCtaSection({ content }: { content: NonNullable<SeoPageContent["bottomCta"]> }) {
  return (
    <section className="bg-[#151519] px-5 py-[70px] text-center text-white lg:py-24">
      <div className="mx-auto max-w-[780px]">
        <h2 className="text-balance text-xl font-bold leading-[25px] lg:text-4xl lg:leading-10">
          {content.title}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-sm font-normal leading-5 text-white/72 lg:text-base lg:leading-6">
          {content.description}
        </p>
        <a
          href="#seo-tool"
          className="mt-8 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-accent px-6 text-base font-semibold leading-6 text-brand-accent-ink hover:bg-brand-accent-hover sm:w-auto"
        >
          {content.button}
          <ArrowRight className="size-4" />
        </a>
        {content.upsell && (
          <p className="mt-4 text-xs leading-4 text-white/50">
            {content.upsell}
          </p>
        )}
      </div>
    </section>
  );
}
