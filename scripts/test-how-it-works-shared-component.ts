import fs from "node:fs";

const sharedPath = "src/components/how-it-works-section.tsx";
const homePath = "src/blocks/how-it-works.tsx";
const seoPath = "src/components/seo-sections/how-to-section.tsx";

if (!fs.existsSync(sharedPath)) {
  throw new Error("How it works sections must share src/components/how-it-works-section.tsx");
}

const homeSource = fs.readFileSync(homePath, "utf8");
const seoSource = fs.readFileSync(seoPath, "utf8");
const sharedSource = fs.readFileSync(sharedPath, "utf8");

for (const [label, source] of [
  [homePath, homeSource],
  [seoPath, seoSource],
] as const) {
  if (!source.includes("HowItWorksSection")) {
    throw new Error(`${label} must render the shared HowItWorksSection component`);
  }
}

for (const requiredClass of [
  "max-w-[1340px]",
  "gap-6",
  "rounded-lg",
  "p-5",
  "aspect-[16/7]",
  "mb-6",
]) {
  if (!sharedSource.includes(requiredClass)) {
    throw new Error(`Shared HowItWorksSection must include homepage class: ${requiredClass}`);
  }
}

for (const oldSeoClass of ["max-w-[1060px]", "gap-5", "aspect-[16/9]"]) {
  if (seoSource.includes(oldSeoClass)) {
    throw new Error(`SEO HowToSection must not keep old divergent class: ${oldSeoClass}`);
  }
}

console.log("How it works shared component guard passed");
