import assert from "node:assert/strict";
import { buildAnalyticsConfig } from "../src/lib/analytics-config";

const fullConfig = buildAnalyticsConfig({
  google_analytics_id: " G-TEST123456 ",
  clarity_id: " clarity123 ",
  plausible_domain: " lyricvideomaker.app ",
  plausible_src: " https://plausible.example.com/js/script.js ",
});

assert.deepEqual(fullConfig, {
  googleAnalyticsId: "G-TEST123456",
  clarityId: "clarity123",
  plausible: {
    domain: "lyricvideomaker.app",
    src: "https://plausible.example.com/js/script.js",
  },
});

const partialConfig = buildAnalyticsConfig({
  google_analytics_id: "",
  clarity_id: "   ",
  plausible_domain: "lyricvideomaker.app",
  plausible_src: "ftp://example.com/script.js",
});

assert.deepEqual(partialConfig, {
  googleAnalyticsId: null,
  clarityId: null,
  plausible: null,
});

console.log("analytics config tests passed");
