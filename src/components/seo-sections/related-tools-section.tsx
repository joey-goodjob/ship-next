import { ArrowUpRight } from "lucide-react";
import { Link } from "@/core/i18n/navigation";
import type { SeoPageContent } from "@/lib/seo-pages";
import { SectionHeading } from "./section-heading";

export function RelatedToolsSection({
  content,
}: {
  content: NonNullable<SeoPageContent["relatedTools"]>;
}) {
  return (
    <section className="bg-brand-panel px-5 py-[70px] lg:py-[120px]">
      <div className="mx-auto max-w-[1180px]">
        <SectionHeading title={content.title} />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {content.items.map((item) => (
            <Link
              key={item.slug}
              href={`/${item.slug}`}
              className="group flex flex-col rounded-md border border-brand-line bg-brand-page p-5 shadow-sm transition-colors hover:border-brand-accent"
            >
              <span className="flex items-center justify-between gap-2 text-base font-semibold leading-6 text-brand-ink lg:text-lg">
                {item.label}
                <ArrowUpRight className="size-4 shrink-0 text-brand-muted transition-colors group-hover:text-brand-accent" />
              </span>
              <span className="mt-2 text-sm font-normal leading-5 text-brand-muted">{item.description}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
