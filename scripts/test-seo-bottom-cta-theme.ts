import fs from "node:fs";

const componentPath = "src/components/seo-sections/bottom-cta-section.tsx";
const source = fs.readFileSync(componentPath, "utf8");

if (source.includes("bg-brand-ink") || source.includes("text-brand-panel")) {
  throw new Error(
    "SEO bottom CTA must not use bg-brand-ink/text-brand-panel because those tokens invert in dark mode.",
  );
}

if (!source.includes("bg-[#151519]") || !source.includes("text-white")) {
  throw new Error("SEO bottom CTA must keep a stable dark background with white text.");
}

console.log("SEO bottom CTA theme guard passed");
