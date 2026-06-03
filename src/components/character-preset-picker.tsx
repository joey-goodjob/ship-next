"use client";

import { Check, Sparkles, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CharacterPreset } from "@/lib/character-presets";

export function CharacterPresetPicker({
  presets,
  selectedSlug,
  disabled,
  onChange,
}: {
  presets: CharacterPreset[];
  selectedSlug: string;
  disabled?: boolean;
  onChange: (slug: string) => void;
}) {
  const selected = presets.find((preset) => preset.slug === selectedSlug) || presets[0];

  return (
    <section className="mx-auto mb-7 w-full max-w-[860px] text-left" aria-labelledby="character-preset-title">
      <div className="overflow-hidden rounded-md border border-slate-200 bg-[#101014] text-white shadow-[0_18px_55px_rgba(15,23,42,0.16)]">
        <div className="flex flex-col gap-4 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <div className="flex items-center gap-2">
              <UserRound className="size-5 text-[#fbbf24]" />
              <h3 id="character-preset-title" className="text-base font-black">
                Cast Your Actor
              </h3>
            </div>
            <p className="mt-1 text-xs font-semibold text-white/55">Lead look for this song.</p>
          </div>
          {selected ? (
            <div className="flex min-w-0 items-center gap-3 rounded-md border border-white/10 bg-white/[0.06] px-3 py-2">
              <img
                src={selected.thumbnailUrl}
                alt=""
                className="size-10 shrink-0 rounded-full border border-white/15 object-cover"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{selected.name}</p>
                <p className="truncate text-xs font-semibold text-white/50">Selected main actor</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="px-4 py-4 sm:px-5">
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-9 sm:overflow-visible sm:px-0 sm:pb-0">
            {presets.map((preset) => {
              const active = preset.slug === selectedSlug;
              return (
                <button
                  key={preset.slug}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(preset.slug)}
                  aria-pressed={active}
                  className="group min-w-[76px] shrink-0 rounded-md text-center outline-none disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <span
                    className={cn(
                      "relative mx-auto flex size-[68px] items-center justify-center rounded-full border-2 bg-white/10 transition",
                      active
                        ? "border-[#fbbf24] shadow-[0_0_0_4px_rgba(251,191,36,0.18)]"
                        : "border-white/10 group-hover:border-white/35 group-focus-visible:border-[#fbbf24]",
                    )}
                  >
                    <img src={preset.thumbnailUrl} alt={preset.name} className="size-full rounded-full object-cover" />
                    {active ? (
                      <span className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-[#fbbf24] text-slate-950">
                        <Check className="size-3.5 stroke-[3]" />
                      </span>
                    ) : null}
                  </span>
                  <span className={cn("mt-2 block truncate text-xs font-black", active ? "text-white" : "text-white/55")}>
                    {preset.name}
                  </span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="mt-4 flex items-start gap-3 rounded-md border border-white/10 bg-white/[0.05] px-4 py-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-[#fbbf24]" />
              <p className="text-sm font-semibold leading-6 text-white/68">{selected.description}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
