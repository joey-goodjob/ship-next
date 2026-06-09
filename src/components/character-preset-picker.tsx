"use client";

import { Check } from "lucide-react";
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
    <section className="w-full border-t border-slate-200 pt-7 text-left" aria-labelledby="character-preset-title">
      <span className="inline-flex h-11 items-center justify-center rounded-[10px] bg-teal-600 px-4 text-sm font-black text-white shadow-[0_10px_22px_rgba(13,148,136,0.22)]">
        Step 2
      </span>
      <div className="mt-5">
        <h3 id="character-preset-title" className="text-3xl font-black tracking-[-0.012em] text-[#050b24]">
          Choose your main actor
        </h3>
        <p className="mt-3 text-base font-semibold text-slate-500">Select the main actor for your lyric video.</p>
      </div>

      <div className="mt-6">
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid sm:grid-cols-9 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0">
          {presets.map((preset) => {
            const active = preset.slug === selectedSlug;
            return (
              <button
                key={preset.slug}
                type="button"
                disabled={disabled}
                onClick={() => onChange(preset.slug)}
                aria-pressed={active}
                className="group min-w-[78px] shrink-0 rounded-[12px] text-center outline-none disabled:cursor-not-allowed disabled:opacity-55"
              >
                <span
                  className={cn(
                    "relative mx-auto flex size-[76px] items-center justify-center rounded-full border-2 bg-slate-100 p-0.5 transition",
                    active
                      ? "border-teal-500 shadow-[0_0_0_4px_rgba(20,184,166,0.16)]"
                      : "border-slate-200 group-hover:border-teal-300 group-focus-visible:border-teal-500",
                  )}
                >
                  <img src={preset.thumbnailUrl} alt={preset.name} className="size-full rounded-full object-cover" />
                  {active ? (
                    <span className="absolute -right-1 -top-1 flex size-7 items-center justify-center rounded-full bg-teal-600 text-white shadow-sm">
                      <Check className="size-4 stroke-[3]" />
                    </span>
                  ) : null}
                </span>
                <span className={cn("mt-3 block truncate text-sm font-black", active ? "text-teal-700" : "text-[#050b24]")}>
                  {preset.name}
                </span>
              </button>
            );
          })}
        </div>

        {selected ? (
          <div className="mt-6 grid gap-5 rounded-[16px] border border-slate-200 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.08)] sm:grid-cols-[190px_1fr] sm:p-6">
            <img
              src={selected.thumbnailUrl}
              alt=""
              className="mx-auto size-40 rounded-full object-cover sm:size-44"
            />
            <div className="min-w-0 self-center">
              <div className="flex flex-wrap items-center gap-3">
                <h4 className="text-2xl font-black tracking-[-0.012em] text-[#050b24]">{selected.name}</h4>
                <span className="inline-flex rounded-full border border-teal-100 bg-teal-50 px-4 py-1.5 text-sm font-black text-teal-700">
                  Selected main actor
                </span>
              </div>
              <p className="mt-4 text-lg font-semibold leading-8 text-slate-600">{selected.description}</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
