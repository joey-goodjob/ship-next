import { ArrowRight } from "lucide-react";
import type { SeoPageContent } from "@/lib/seo-pages";
import { SectionHeading } from "./section-heading";

type ComparisonTableContent = NonNullable<SeoPageContent["comparisonTable"]>;

export function ComparisonTableSection({ content }: { content: ComparisonTableContent }) {
  return (
    <section className="bg-brand-panel px-5 py-[70px] lg:py-[120px]">
      <div className="mx-auto max-w-[1180px]">
        <SectionHeading title={content.title} description={content.description} />
        <div className="mt-10 overflow-x-auto rounded-md border border-brand-line bg-brand-soft">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-brand-line bg-brand-panel">
                <th className="w-[190px] px-4 py-4 font-semibold leading-5 text-brand-ink">
                  Detail
                </th>
                {content.columns.map((column) => (
                  <th key={column} className="px-4 py-4 font-semibold leading-5 text-brand-ink">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {content.rows.map((row) => (
                <tr key={row.label} className="border-b border-brand-line last:border-b-0">
                  <th className="px-4 py-4 align-top font-semibold leading-5 text-brand-ink">
                    {row.label}
                  </th>
                  {row.values.map((value, index) => (
                    <td
                      key={`${row.label}-${content.columns[index]}`}
                      className="px-4 py-4 align-top leading-6 text-brand-muted"
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(content.note || content.cta) && (
          <div className="mt-5 rounded-md border border-brand-line bg-brand-soft p-5">
            {content.note ? (
              <p className="text-sm font-normal leading-6 text-brand-muted lg:text-base lg:leading-7">
                {content.note}
              </p>
            ) : null}
            {content.cta ? (
              <a
                href="#seo-tool"
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-accent px-4 text-sm font-semibold leading-5 text-brand-accent-ink transition-colors hover:bg-brand-accent-hover sm:w-auto"
              >
                {content.cta}
                <ArrowRight className="size-4" />
              </a>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
