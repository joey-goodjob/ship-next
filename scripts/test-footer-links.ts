import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const footerSource = readFileSync("src/blocks/footer.tsx", "utf8");

const expectedColumns = [
  "products",
  "tools",
  "resources",
  "alternatives",
  "legal",
] as const;

const expectedLinks = [
  "/lyric-video-generator",
  "/free-lyric-video-maker",
  "/audio-to-lyric-video",
  "/song-to-lyric-video",
  "/tiktok-lyric-video-generator",
  "/ai-music-video-generator",
  "/add-lyrics-to-video",
  "/karaoke-video-maker",
  "/auto-lyrics-transcription",
  "/lyric-video-templates",
  "/how-to-make-a-lyric-video",
  "/#create",
  "/pricing",
  "/kapwing-alternative",
  "/veed-alternative",
  "/capify-alternative",
  "/neural-frames-alternative",
  "/privacy-policy",
  "/terms-of-service",
] as const;

const expectedFooterKeys = [
  ...expectedColumns,
  "lyric_video_generator",
  "free_lyric_video_maker",
  "audio_to_lyric_video",
  "song_to_lyric_video",
  "tiktok_lyric_video_generator",
  "ai_music_video_generator",
  "add_lyrics_to_video",
  "karaoke_video_maker",
  "auto_lyrics_transcription",
  "lyric_video_templates",
  "how_to_make_a_lyric_video",
  "ai_lyric_video_maker",
  "pricing",
  "kapwing_alternative",
  "veed_alternative",
  "capify_alternative",
  "neural_frames_alternative",
  "privacy",
  "terms",
] as const;

for (const column of expectedColumns) {
  assert.match(
    footerSource,
    new RegExp(`title: t\\("footer\\.${column}"\\)`),
    `Footer should include ${column} column`,
  );
}

for (const href of expectedLinks) {
  assert.ok(
    footerSource.includes(`href: "${href}"`),
    `Footer should link to ${href}`,
  );
}

for (const locale of ["en", "zh"]) {
  const landingMessages = JSON.parse(
    readFileSync(`src/config/locale/messages/${locale}/landing.json`, "utf8"),
  );

  for (const key of expectedFooterKeys) {
    assert.equal(
      typeof landingMessages.footer[key],
      "string",
      `${locale} footer.${key} should exist`,
    );
  }

  for (const href of expectedLinks) {
    if (!href.startsWith("/") || href.startsWith("/#")) continue;
    if (href === "/pricing") continue;
    if (href === "/privacy-policy" || href === "/terms-of-service") continue;

    const slug = href.slice(1);
    assert.ok(
      existsSync(`public/seo-pages/${locale}/${slug}.json`),
      `${locale} SEO page should exist for footer link ${href}`,
    );
  }
}

console.log("Footer link columns, labels, and SEO page targets are valid.");
