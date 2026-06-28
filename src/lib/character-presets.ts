import characterPresetManifest from "../../data/character-presets.openart-seed.v1.json";

export type CharacterPreset = {
  slug: string;
  name: string;
  role: string;
  description: string;
  promptFragment: string;
  referenceImageUrl: string;
  referenceImageUrls?: string[];
  thumbnailUrl: string;
};

export type CharacterPresetDescriptions = Record<string, string>;

type CharacterPresetManifest = {
  characters: CharacterPreset[];
};

function normalizeReferenceUrls(preset: CharacterPreset) {
  const urls = Array.isArray(preset.referenceImageUrls)
    ? preset.referenceImageUrls.filter(Boolean)
    : [];
  return urls.length > 0 ? urls : [preset.referenceImageUrl].filter(Boolean);
}

export const CHARACTER_PRESETS: CharacterPreset[] = (
  characterPresetManifest as CharacterPresetManifest
).characters.map((preset) => ({
  ...preset,
  referenceImageUrls: normalizeReferenceUrls(preset),
}));

export const DEFAULT_CHARACTER_PRESET_SLUG = "vera";

export function getCharacterPreset(slug?: string | null) {
  if (!slug) return null;
  return CHARACTER_PRESETS.find((preset) => preset.slug === slug) || null;
}

export function characterPresetDisplayDescription(
  preset: Pick<CharacterPreset, "slug" | "description">,
  descriptions?: CharacterPresetDescriptions,
) {
  const localized = descriptions?.[preset.slug]?.trim();
  return localized || preset.description;
}

export function characterPresetSelectionSummary(
  presets: Array<Pick<CharacterPreset, "slug" | "description">>,
  options: {
    primaryLabel: string;
    roleLabel: string;
    descriptions?: CharacterPresetDescriptions;
  },
) {
  return presets
    .map((preset, index) => {
      const label = index === 0
        ? options.primaryLabel
        : options.roleLabel.replace("{number}", String(index + 1));
      return `${label}: ${characterPresetDisplayDescription(preset, options.descriptions)}`;
    })
    .join(" ");
}
