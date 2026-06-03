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

const SHOWCASE_BASE = "/character-library/openart-seed";
const AI_REFERENCE_BASE = "/debug/lyric-videos/character-library/openart-seed";

function showcasePath(slug: string) {
  return `${SHOWCASE_BASE}/${slug}-showcase.png`;
}

function aiReferencePath(slug: string) {
  return `${AI_REFERENCE_BASE}/${slug}-turnaround.png`;
}

function makePreset(
  params: Omit<
    CharacterPreset,
    "referenceImageUrl" | "referenceImageUrls" | "thumbnailUrl"
  >,
): CharacterPreset {
  const thumbnailUrl = showcasePath(params.slug);
  const referenceImageUrl = aiReferencePath(params.slug);

  return {
    ...params,
    thumbnailUrl,
    referenceImageUrl,
    referenceImageUrls: [referenceImageUrl],
  };
}

export const CHARACTER_PRESETS: CharacterPreset[] = [
  makePreset({
    slug: "vera",
    name: "Vera",
    role: "main",
    description:
      "Pop diva and dance-pop singer with blonde hair fading into soft pink ends, layered gold jewelry, black stage outfit, retro microphone, and purple studio flash mood.",
    promptFragment:
      "fictional pop diva and dance-pop singer, long blonde hair fading into soft pink ends, glossy stage makeup, layered gold jewelry, black crop top, high-waisted black stage pants, retro silver microphone, confident performance pose",
  }),
  makePreset({
    slug: "kai",
    name: "Kai",
    role: "main",
    description:
      "R&B and alt-rap performer with shoulder-length dark locs, navy athletic sweatshirt, clean white trousers, pendant necklace, and soft pink studio mood.",
    promptFragment:
      "fictional male R&B and alt-rap performer, shoulder-length dark locs, navy athletic sweatshirt with bright blue sleeve stripes, clean white trousers, plain black belt, simple pendant necklace, calm introspective pose",
  }),
  makePreset({
    slug: "luna",
    name: "Luna",
    role: "main",
    description:
      "Hyperpop and K-pop inspired performer with vivid aqua-blue hair, pastel checkerboard styling, butterfly clips, and teal studio flash mood.",
    promptFragment:
      "fictional hyperpop and K-pop inspired female performer, long vivid aqua-blue hair, translucent pink butterfly hair clips, pastel checkerboard crop top, pastel pink pants, dreamy playful expression",
  }),
  makePreset({
    slug: "rosa",
    name: "Rosa",
    role: "main",
    description:
      "Cyberpop performer with vivid orange wavy hair, metallic silver crop top, futuristic cargo pants, chunky boots, wrist tech cuffs, and cyan coral lights.",
    promptFragment:
      "fictional cyberpop female performer, vivid orange wavy hair, metallic silver crop top, loose futuristic cargo pants, chunky pale combat boots, wrist tech cuffs, bold confident stance, neon cyan and coral music-video lighting",
  }),
  makePreset({
    slug: "ace",
    name: "Ace",
    role: "main",
    description:
      "Dance-pop DJ performer with platinum blond hair, white oval sunglasses, black headphones, white tank top, denim jeans, and cool blue studio flash mood.",
    promptFragment:
      "fictional dance-pop DJ performer, platinum blond short hair, white oval sunglasses, black headphones around the neck, fitted white ribbed tank top, light denim jeans, athletic build, calm confident pose",
  }),
  makePreset({
    slug: "tex",
    name: "Tex",
    role: "main",
    description:
      "Country-pop performer with cream western suit, vest, cowboy hat, subtle patterned shirt, and warm retro studio lighting.",
    promptFragment:
      "fictional mature country-pop performer, warm confident smile, cream western suit with vest, cream cowboy hat, subtle patterned shirt, relaxed charismatic stage presence, polished retro studio lighting",
  }),
  makePreset({
    slug: "ty",
    name: "Ty",
    role: "main",
    description:
      "Young hip-hop performer with textured curls, blank green cap, plain black t-shirt, silver chain, tattooed forearms, and warm orange flash mood.",
    promptFragment:
      "fictional young male hip-hop performer, short textured curls, blank green baseball cap, plain black t-shirt, silver chain, abstract tattooed forearms, confident playful performance energy, warm orange studio lighting",
  }),
  makePreset({
    slug: "jayden",
    name: "Jayden",
    role: "main",
    description:
      "Street DJ and pop-rap performer with short textured dark hair, trimmed beard, sunglasses, black studded leather jacket, pink tee, and magenta rim light.",
    promptFragment:
      "fictional male street DJ and pop-rap performer, short textured dark hair, trimmed beard, oversized dark sunglasses, black studded leather jacket, soft pink tee, loose dark trousers, slim chains, confident casual pose",
  }),
  makePreset({
    slug: "jay",
    name: "Jay",
    role: "main",
    description:
      "Indie R&B vocalist with short textured hair, neat beard, sky-blue hoodie, calm vulnerable expression, and warm film-grain studio mood.",
    promptFragment:
      "fictional indie R&B male vocalist, short textured dark hair, neat beard, soft sky-blue hoodie with no writing, black drawstrings, calm vulnerable expression, warm film grain studio mood",
  }),
];

export const DEFAULT_CHARACTER_PRESET_SLUG = "vera";

export function getCharacterPreset(slug?: string | null) {
  if (!slug) return null;
  return CHARACTER_PRESETS.find((preset) => preset.slug === slug) || null;
}
