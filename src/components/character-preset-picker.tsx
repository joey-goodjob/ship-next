"use client";

import { Check, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  characterPresetSelectionSummary,
  type CharacterPreset,
  type CharacterPresetDescriptions,
} from "@/lib/character-presets";

export type CharacterPresetPickerCopy = {
  stepLabel: string;
  title: string;
  description: string;
  selectedCount: (count: number, max: number) => string;
  selectedHint: string;
  selectedCastLibrary: string;
  selectedPrimaryActor: string;
  primaryLabel: string;
  roleLabel: string;
  chooseAtLeastOne: string;
  maxCharacters: string;
};

export function CharacterPresetPicker({
  presets,
  selectedSlugs,
  selectedSlug,
  copy,
  descriptions,
  disabled,
  onChange,
  onSelectionChange,
}: {
  presets: CharacterPreset[];
  selectedSlug?: string;
  selectedSlugs?: string[];
  copy: CharacterPresetPickerCopy;
  descriptions?: CharacterPresetDescriptions;
  disabled?: boolean;
  onChange?: (slug: string) => void;
  onSelectionChange?: (slugs: string[]) => void;
}) {
  const selected = selectedSlugs ?? (selectedSlug ? [selectedSlug] : []);
  const selectedPresets = selected.map((slug) => presets.find((preset) => preset.slug === slug)).filter(Boolean) as CharacterPreset[];
  const primary = selectedPresets[0] || null;

  function setSelection(slugs: string[]) {
    const cleanSlugs = Array.from(new Set(slugs.filter(Boolean))).slice(0, 4);
    if (cleanSlugs.length === 0) {
      toast.error(copy.chooseAtLeastOne);
      return;
    }
    onSelectionChange?.(cleanSlugs);
    if (cleanSlugs[0]) onChange?.(cleanSlugs[0]);
  }

  function togglePreset(slug: string) {
    if (selected.includes(slug)) {
      if (selected.length <= 1) {
        toast.error(copy.chooseAtLeastOne);
        return;
      }
      setSelection(selected.filter((item) => item !== slug));
      return;
    }
    if (selected.length >= 4) {
      toast.error(copy.maxCharacters);
      return;
    }
    setSelection([...selected, slug]);
  }

  return (
    <section className="w-full border-t border-brand-line pt-7 text-left" aria-labelledby="character-preset-title">
      <span className="inline-flex h-11 items-center justify-center rounded-[10px] bg-brand-accent px-4 text-sm font-black text-brand-accent-ink shadow-[0_10px_22px_var(--brand-accent-shadow)]">
        {copy.stepLabel}
      </span>
      <div className="mt-5">
        <h3 id="character-preset-title" className="text-3xl font-black tracking-[-0.012em] text-brand-ink">
          {copy.title}
        </h3>
        <p className="mt-3 text-base font-semibold text-brand-muted">{copy.description}</p>
      </div>

      <div className="mt-6 rounded-[12px] border border-brand-line bg-brand-panel p-4">
        <span className="flex items-center gap-2 text-sm font-black text-brand-ink">
          <Users className="size-4" />
          {copy.selectedCount(selected.length, 4)}
        </span>
        <span className="mt-2 block text-xs font-semibold leading-5 text-brand-muted">
          {copy.selectedHint}
        </span>
      </div>

      <div className="mt-6">
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid sm:grid-cols-9 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0">
          {presets.map((preset) => {
            const active = selected.includes(preset.slug);
            return (
              <button
                key={preset.slug}
                type="button"
                disabled={disabled}
                onClick={() => togglePreset(preset.slug)}
                aria-pressed={active}
                className="group min-w-[78px] shrink-0 rounded-[12px] text-center outline-none disabled:cursor-not-allowed disabled:opacity-55"
              >
                <span
                  className={cn(
                    "relative mx-auto flex size-[76px] items-center justify-center rounded-full border-2 bg-brand-soft p-0.5 transition",
                    active
                      ? "border-brand-accent ring-4 ring-brand-accent/15"
                      : "border-brand-line group-hover:border-brand-accent group-focus-visible:border-brand-accent",
                  )}
                >
                  <img src={preset.thumbnailUrl} alt={preset.name} className="size-full rounded-full object-cover" />
                  {active ? (
                    <span className="absolute -right-1 -top-1 flex size-7 items-center justify-center rounded-full bg-brand-accent text-brand-accent-ink shadow-sm">
                      <Check className="size-4 stroke-[3]" />
                    </span>
                  ) : null}
                </span>
                <span className={cn("mt-3 block truncate text-sm font-black", active ? "text-brand-accent-hover" : "text-brand-ink")}>
                  {preset.name}
                </span>
              </button>
            );
          })}
        </div>

        {primary ? (
          <div className="mt-6 grid gap-5 rounded-[16px] border border-brand-line bg-brand-panel p-4 shadow-[0_12px_34px_var(--brand-elevation-shadow-soft)] sm:grid-cols-[190px_1fr] sm:p-6">
            <img
              src={primary.thumbnailUrl}
              alt=""
              className="mx-auto size-40 rounded-full object-cover sm:size-44"
            />
            <div className="min-w-0 self-center">
              <div className="flex flex-wrap items-center gap-3">
                <h4 className="text-2xl font-black tracking-[-0.012em] text-brand-ink">{selectedPresets.map((preset) => preset.name).join(" + ")}</h4>
                <span className="inline-flex rounded-full border border-brand-accent/25 bg-brand-accent-soft px-4 py-1.5 text-sm font-black text-brand-accent-hover">
                  {selectedPresets.length > 1 ? copy.selectedCastLibrary : copy.selectedPrimaryActor}
                </span>
              </div>
              <p className="mt-4 text-lg font-semibold leading-8 text-brand-muted">
                {characterPresetSelectionSummary(selectedPresets, {
                  primaryLabel: copy.primaryLabel,
                  roleLabel: copy.roleLabel,
                  descriptions,
                })}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
