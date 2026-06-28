import assert from "node:assert/strict";
import {
  CHARACTER_PRESETS,
  characterPresetDisplayDescription,
  characterPresetSelectionSummary,
} from "../src/lib/character-presets";

const vera = CHARACTER_PRESETS.find((preset) => preset.slug === "vera");
assert.ok(vera, "Vera preset should exist");

const zhDescriptions = {
  vera: "流行天后兼 dance-pop 歌手，金发发尾渐变为柔粉色。",
};

assert.equal(
  characterPresetDisplayDescription(vera, zhDescriptions),
  zhDescriptions.vera,
  "localized display description should override the English preset description",
);

assert.equal(
  characterPresetDisplayDescription(vera, {}),
  vera.description,
  "display description should fall back to the original preset description",
);

assert.equal(
  characterPresetSelectionSummary([vera], {
    primaryLabel: "主角",
    roleLabel: "角色 {number}",
    descriptions: zhDescriptions,
  }),
  `主角: ${zhDescriptions.vera}`,
  "single selected preset summary should use localized role label and description",
);

assert.equal(
  characterPresetSelectionSummary([vera, { ...vera, slug: "kai", description: "English Kai" }], {
    primaryLabel: "Primary",
    roleLabel: "Role {number}",
    descriptions: { vera: "Localized Vera", kai: "Localized Kai" },
  }),
  "Primary: Localized Vera Role 2: Localized Kai",
  "multi selected preset summary should localize every selected character",
);

assert.equal(
  vera.description,
  "Pop diva and dance-pop singer with blonde hair fading into soft pink ends, layered gold jewelry, plain black crop top, high-waisted black stage pants, retro microphone, and purple studio flash mood.",
  "display localization must not mutate generation-facing preset descriptions",
);
