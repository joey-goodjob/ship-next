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
