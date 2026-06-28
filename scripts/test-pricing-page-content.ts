import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function readJson(relativePath: string) {
  return JSON.parse(
    fs.readFileSync(path.join(root, relativePath), "utf8")
  ) as Record<string, any>;
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const locales = ["en", "zh"] as const;

for (const locale of locales) {
  const landing = readJson(`src/config/locale/messages/${locale}/landing.json`);

  assert(Array.isArray(landing.pricing_features), `${locale}: pricing_features must be an array.`);
  assert(landing.pricing_features.length >= 14, `${locale}: pricing_features must cover the plan comparison.`);

  assert(Array.isArray(landing.pricing_credit_packs), `${locale}: pricing_credit_packs must be an array.`);
  assert(landing.pricing_credit_packs.length === 7, `${locale}: pricing_credit_packs must include all seven packs.`);

  assert(Array.isArray(landing.pricing_credit_info), `${locale}: pricing_credit_info must be an array.`);
  assert(landing.pricing_credit_info.length === 4, `${locale}: pricing_credit_info must include four credit info groups.`);

  assert(Array.isArray(landing.pricing_faq.items), `${locale}: pricing_faq.items must be an array.`);
  assert(landing.pricing_faq.items.length >= 8, `${locale}: pricing_faq.items must include the full pricing FAQ.`);

  assert(landing.pricing_studio?.title, `${locale}: pricing_studio.title is required.`);
  assert(landing.pricing_calculator?.estimate_label, `${locale}: pricing_calculator.estimate_label is required.`);
}

const pricingBlock = fs.readFileSync(path.join(root, "src/blocks/pricing.tsx"), "utf8");
const enLandingText = fs.readFileSync(
  path.join(root, "src/config/locale/messages/en/landing.json"),
  "utf8"
);
const zhLandingText = fs.readFileSync(
  path.join(root, "src/config/locale/messages/zh/landing.json"),
  "utf8"
);

assert(pricingBlock.includes("pricing_studio"), "pricing.tsx must render the Studio service block.");
assert(pricingBlock.includes("pricing_credit_info"), "pricing.tsx must render localized credit info groups.");
assert(pricingBlock.includes('href="/create"'), "free and credit-pack CTAs must still point to /create.");
assert(pricingBlock.includes('"/api/payment/checkout"'), "paid pricing CTAs must create a checkout session.");
assert(pricingBlock.includes("buildPricingCheckoutPayload"), "paid pricing CTAs must use the shared checkout payload helper.");
assert(pricingBlock.includes('annualMonthlyPrice: "32.5"'), "Creator annual monthly price must match the reference.");
assert(pricingBlock.includes("annualBilledPrice: 990"), "Pro annual billed price must match the reference.");
assert(pricingBlock.includes("formatDollarAmount"), "Annual billed amounts must be formatted with thousands separators.");
assert(pricingBlock.includes("annualSavings: 300"), "Ultra annual savings must match the reference.");
assert(enLandingText.includes("Billed {amount} annually"), "English annual billing label is required.");
assert(zhLandingText.includes("每年收取 {amount}"), "Chinese annual billing label is required.");
assert(!pricingBlock.includes("coming_soon"), "pricing.tsx must not show coming soon feature states.");
assert(!enLandingText.includes("Coming soon"), "English pricing copy must not include Coming soon labels.");
assert(!zhLandingText.includes("即将支持"), "Chinese pricing copy must not include 即将支持 labels.");
assert(!enLandingText.includes("checkout are ready"), "English credit-pack copy must not describe checkout as pending.");
assert(!zhLandingText.includes("结账流程开启后"), "Chinese credit-pack copy must not describe checkout as pending.");

console.log("pricing page content checks passed");
