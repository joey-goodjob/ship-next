import { ArrowRight, CheckCircle2, CircleDollarSign, Clock3 } from "lucide-react";
import type { ReactNode } from "react";
import type { SeoPageContent } from "@/lib/seo-pages";
import { SectionHeading } from "./section-heading";

type MethodComparisonContent = NonNullable<SeoPageContent["methodComparison"]>;

export function MethodComparisonSection({ content }: { content: MethodComparisonContent }) {
  return (
    <section className="bg-brand-panel px-5 py-[70px] lg:py-[120px]">
      <div className="mx-auto max-w-[1180px]">
        <SectionHeading title={content.title} description={content.description} />

        <div className="mt-12 rounded-md border border-brand-line bg-brand-soft/45 p-5 lg:p-7">
          <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase leading-5 tracking-normal text-brand-accent-hover">
                {content.quickAnswer.title}
              </p>
              <p className="mt-3 text-base font-normal leading-7 text-brand-ink lg:text-lg lg:leading-8">
                {content.quickAnswer.description}
              </p>
              <a
                href="#seo-tool"
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-accent px-5 text-base font-semibold leading-6 text-brand-accent-ink transition-colors hover:bg-brand-accent-hover sm:w-auto"
              >
                {content.quickAnswer.cta}
                <ArrowRight className="size-4" />
              </a>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <SignalCard icon={<Clock3 className="size-5" />} label="Fastest" value={content.methods[0]?.title ?? ""} />
              <SignalCard
                icon={<CircleDollarSign className="size-5" />}
                label="Lowest effort"
                value={content.methods[3]?.title ?? ""}
              />
              <SignalCard
                icon={<CheckCircle2 className="size-5" />}
                label="Best first try"
                value={content.methods[0]?.bestFor ?? ""}
              />
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {content.methods.map((method, index) => (
            <article key={method.title} className="rounded-md border border-brand-line bg-brand-soft p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-accent text-base font-bold leading-6 text-brand-accent-ink">
                  {index + 1}
                </div>
                <div>
                  <h3 className="text-lg font-bold leading-7 text-brand-ink lg:text-2xl lg:leading-8">
                    {method.title}
                  </h3>
                  <p className="mt-2 text-sm font-semibold leading-5 text-brand-muted">
                    {method.meta}
                  </p>
                </div>
              </div>
              <p className="mt-5 text-sm font-normal leading-6 text-brand-muted lg:text-base lg:leading-7">
                {method.description}
              </p>
              <ul className="mt-5 space-y-2">
                {method.steps.map((step) => (
                  <li key={step} className="flex gap-2 text-sm leading-5 text-brand-muted">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-accent-hover" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 rounded-md border border-brand-line bg-brand-panel px-4 py-3 text-sm font-semibold leading-5 text-brand-ink">
                {method.bestFor}
              </p>
              {method.cta ? (
                <a
                  href="#seo-tool"
                  className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-ink px-4 text-sm font-semibold leading-5 text-brand-panel transition-colors hover:bg-brand-accent-hover sm:w-auto"
                >
                  {method.cta}
                  <ArrowRight className="size-4" />
                </a>
              ) : null}
            </article>
          ))}
        </div>

        <div className="mt-10">
          <h3 className="text-xl font-bold leading-7 text-brand-ink lg:text-3xl lg:leading-10">
            {content.comparison.title}
          </h3>
          <div className="mt-5 overflow-x-auto rounded-md border border-brand-line bg-brand-soft">
            <table className="min-w-[820px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-brand-line bg-brand-panel">
                  <th className="w-[170px] px-4 py-4 font-semibold leading-5 text-brand-ink">Decision</th>
                  {content.comparison.columns.map((column) => (
                    <th key={column} className="px-4 py-4 font-semibold leading-5 text-brand-ink">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {content.comparison.rows.map((row) => (
                  <tr key={row.label} className="border-b border-brand-line last:border-b-0">
                    <th className="px-4 py-4 align-top font-semibold leading-5 text-brand-ink">{row.label}</th>
                    {row.values.map((value, index) => (
                      <td key={`${row.label}-${content.comparison.columns[index]}`} className="px-4 py-4 align-top leading-6 text-brand-muted">
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 rounded-md border border-brand-line bg-brand-soft p-5">
            <p className="text-sm font-normal leading-6 text-brand-muted lg:text-base lg:leading-7">
              {content.comparison.bottomLine}
            </p>
            <a
              href="#seo-tool"
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-accent px-4 text-sm font-semibold leading-5 text-brand-accent-ink transition-colors hover:bg-brand-accent-hover sm:w-auto"
            >
              {content.comparison.cta}
              <ArrowRight className="size-4" />
            </a>
          </div>
        </div>

        <div className="mt-12">
          <h3 className="text-xl font-bold leading-7 text-brand-ink lg:text-3xl lg:leading-10">
            {content.tips.title}
          </h3>
          <ol className="mt-5 grid gap-3 md:grid-cols-2">
            {content.tips.items.map((tip, index) => (
              <li key={tip} className="flex gap-3 rounded-md border border-brand-line bg-brand-soft p-4 text-sm leading-6 text-brand-muted">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-accent-soft text-sm font-bold leading-5 text-brand-accent-hover">
                  {index + 1}
                </span>
                <span>{tip}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function SignalCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-brand-line bg-brand-panel p-4">
      <div className="text-brand-accent-hover">{icon}</div>
      <p className="mt-3 text-xs font-semibold uppercase leading-4 tracking-normal text-brand-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-5 text-brand-ink">{value}</p>
    </div>
  );
}
