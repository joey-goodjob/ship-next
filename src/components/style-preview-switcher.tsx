"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

export type StylePreviewItem = {
  name: string;
  description: string;
  previewImage: string;
  free: boolean;
};

type StylePreviewSwitcherProps = {
  title: string;
  subtitle: string;
  items: StylePreviewItem[];
};

export function StylePreviewSwitcher({ title, subtitle, items }: StylePreviewSwitcherProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeItem = items[activeIndex] || items[0];

  const titleParts = useMemo(() => {
    const normalizedTitle = title.trim();
    const words = normalizedTitle.split(/\s+/);
    if (words.length === 1 && normalizedTitle.length > 4) {
      return {
        lead: normalizedTitle.slice(0, -2),
        accent: normalizedTitle.slice(-2),
      };
    }
    if (words.length < 3) return { lead: title, accent: "" };
    return {
      lead: words.slice(0, -2).join(" "),
      accent: words.slice(-2).join(" "),
    };
  }, [title]);

  if (!activeItem) return null;

  return (
    <section className="bg-brand-soft px-5 py-[70px] text-brand-ink lg:py-[120px]">
      <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[0.38fr_0.62fr] lg:items-center lg:gap-14">
        <div className="min-w-0">
          <div>
            <h2 className="text-balance text-3xl font-black leading-[1.08] tracking-normal text-brand-ink sm:text-4xl lg:text-5xl">
              {titleParts.lead}
              {titleParts.accent ? (
                <>
                  <br />
                  <span className="text-brand-accent">{titleParts.accent}</span>
                </>
              ) : null}
            </h2>
            <p className="mt-5 max-w-xl text-base font-semibold leading-7 text-brand-muted lg:text-lg lg:leading-8">
              {subtitle}
            </p>
          </div>

          <div className="mt-8 flex gap-3 overflow-x-auto pb-2 lg:mt-10 lg:flex-col lg:overflow-visible lg:pb-0">
            {items.map((item, index) => {
              const active = index === activeIndex;

              return (
                <button
                  key={item.name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    "group relative flex min-w-[220px] items-center justify-between gap-4 rounded-md px-5 py-4 text-left transition-[background-color,color,border-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-soft active:scale-[0.99] lg:min-w-0 lg:w-full",
                    active
                      ? "bg-brand-accent-soft text-brand-ink shadow-[inset_4px_0_0_var(--brand-accent)]"
                      : "text-brand-muted hover:bg-brand-panel hover:text-brand-ink",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base font-bold leading-6 lg:text-lg lg:leading-7">
                      {item.name}
                    </span>
                    <span
                      className={cn(
                        "mt-1 block text-sm leading-5 lg:hidden",
                        active ? "text-brand-muted" : "text-brand-muted/80",
                      )}
                    >
                      {item.description}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase leading-4",
                      active ? "bg-brand-accent text-brand-accent-ink" : "bg-brand-panel-strong text-brand-muted",
                    )}
                  >
                    {item.free ? "FREE" : "PRO"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0">
          <div className="relative overflow-hidden rounded-[18px] border border-brand-line bg-brand-panel shadow-[0_28px_80px_var(--brand-elevation-shadow)]">
            <div className="relative aspect-video">
              <div key={activeItem.previewImage} className="absolute inset-0 animate-[style-preview-fade_260ms_ease-out]">
                <Image
                  src={activeItem.previewImage}
                  alt={`${activeItem.name} style preview`}
                  fill
                  priority={activeIndex === 0}
                  sizes="(min-width: 1280px) 700px, (min-width: 1024px) 58vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/62 via-black/8 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                <div className="max-w-xl">
                  <p className="text-xl font-black leading-7 text-white sm:text-2xl sm:leading-8">
                    {activeItem.name}
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-5 text-white/72 sm:text-base sm:leading-6">
                    {activeItem.description}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
