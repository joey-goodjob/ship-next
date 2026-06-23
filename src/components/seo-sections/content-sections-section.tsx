import {
  Check,
  Lightbulb,
  ListChecks,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { SeoPageContent } from "@/lib/seo-pages";

type Block = NonNullable<SeoPageContent["contentSections"]>[number];

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  lightbulb: Lightbulb,
  list: ListChecks,
  check: Check,
};

function Paragraphs({ items }: { items: string[] }) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      {items.map((p, i) => (
        <p key={i} className="text-sm font-normal leading-7 text-brand-muted lg:text-base">
          {p}
        </p>
      ))}
    </div>
  );
}

function BulletCards({ items }: { items: string[] }) {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex gap-3 rounded-xl border border-brand-line bg-brand-panel p-4 shadow-sm"
        >
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand-accent-soft text-brand-accent">
            <Check className="size-4" />
          </span>
          <span className="text-sm font-normal leading-6 text-brand-muted">{item}</span>
        </div>
      ))}
    </div>
  );
}

function PrincipleCards({ items }: { items: NonNullable<Block["cards"]> }) {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((card, i) => (
        <article
          key={i}
          className="flex flex-col rounded-xl border border-brand-line bg-brand-panel p-5 shadow-sm"
        >
          <span className="mb-3 flex size-8 items-center justify-center rounded-lg bg-brand-accent-soft text-sm font-bold text-brand-accent">
            {i + 1}
          </span>
          <h3 className="text-base font-bold leading-6 text-brand-ink">{card.title}</h3>
          <p className="mt-2 text-sm font-normal leading-6 text-brand-muted">{card.description}</p>
        </article>
      ))}
    </div>
  );
}

function ContentTable({ table }: { table: NonNullable<Block["table"]> }) {
  return (
    <div className="mt-6 overflow-hidden overflow-x-auto rounded-xl border border-brand-line shadow-sm">
      <table className="w-full border-collapse text-left text-sm lg:text-base">
        <thead>
          <tr className="bg-brand-soft/70">
            {table.columns.map((col) => (
              <th key={col} className="px-5 py-3.5 font-bold text-brand-ink">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} className="border-t border-brand-line/70 odd:bg-brand-panel even:bg-brand-soft/25 align-top">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-5 py-3.5 ${ci === 0 ? "font-semibold text-brand-ink" : "text-brand-muted"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatTiles({ table }: { table: NonNullable<Block["table"]> }) {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {table.rows.map((row, i) => (
        <div key={i} className="rounded-xl border border-brand-line bg-brand-panel p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">{row[0]}</p>
          <p className="mt-1.5 text-sm font-bold leading-6 text-brand-ink lg:text-base">{row[1]}</p>
        </div>
      ))}
    </div>
  );
}

function CalloutBlock({ block }: { block: Block }) {
  const Icon = (block.icon && ICONS[block.icon]) || Sparkles;
  return (
    <div className="rounded-2xl border border-brand-accent/30 bg-brand-accent-soft/40 p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-brand-accent-ink">
          <Icon className="size-5" />
        </span>
        <h2 className="text-balance text-xl font-bold leading-7 text-brand-ink lg:text-2xl">
          {block.heading}
        </h2>
      </div>
      {block.intro ? (
        <p className="mt-4 text-sm font-normal leading-7 text-brand-ink/85 lg:text-base">{block.intro}</p>
      ) : null}
      {block.bullets?.length ? (
        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {block.bullets.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-6 text-brand-ink/80">
              <Check className="mt-0.5 size-4 shrink-0 text-brand-accent" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function StandardBlock({ block }: { block: Block }) {
  const isStats = block.variant === "stats";
  return (
    <article>
      <h2 className="text-balance text-xl font-bold leading-8 text-brand-ink lg:text-3xl lg:leading-10">
        {block.heading}
      </h2>
      {block.intro ? (
        <p className="mt-4 text-sm font-normal leading-7 text-brand-muted lg:text-base">{block.intro}</p>
      ) : null}
      {block.body?.length ? <Paragraphs items={block.body} /> : null}
      {block.cards?.length ? <PrincipleCards items={block.cards} /> : null}
      {block.bullets?.length ? <BulletCards items={block.bullets} /> : null}
      {block.table ? isStats ? <StatTiles table={block.table} /> : <ContentTable table={block.table} /> : null}
    </article>
  );
}

export function ContentSectionsSection({
  blocks,
}: {
  blocks: NonNullable<SeoPageContent["contentSections"]>;
}) {
  return (
    <section className="bg-brand-soft/30 px-5 py-[70px] lg:py-[120px]">
      <div className="mx-auto flex max-w-[860px] flex-col gap-14">
        {blocks.map((block) =>
          block.variant === "callout" ? (
            <CalloutBlock key={block.heading} block={block} />
          ) : (
            <StandardBlock key={block.heading} block={block} />
          ),
        )}
      </div>
    </section>
  );
}
