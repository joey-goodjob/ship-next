import fs from "node:fs";
import path from "node:path";

export type SeoPageLocale = "en" | "zh";

export type SeoPageContent = {
  slug: string;
  layout: {
    sections: SeoSectionType[];
  };
  seo: {
    title: string;
    description: string;
    keywords: string[];
  };
  hero?: {
    badge: string;
    h1: string;
    subhead: string;
    primaryCta: string;
    secondaryCta: string;
  };
  trust?: string[];
  howItWorks?: {
    title: string;
    steps: SeoStepItem[];
  };
  whyChoose?: {
    title: string;
    description: string;
    highlight: SeoTextItem;
    cards: SeoTextItem[];
  };
  toolkit?: {
    title: string;
    description: string;
  };
  useCases?: SeoTextItem[];
  faq?: {
    title: string;
    items: SeoFaqItem[];
  };
  bottomCta?: {
    title: string;
    description: string;
    button: string;
  };
};

export type SeoTextItem = {
  title: string;
  description: string;
};

export type SeoStepItem = SeoTextItem & {
  image?: string;
};

export type SeoFaqItem = {
  question: string;
  answer: string;
};

export const SEO_SECTION_TYPES = [
  "heroTool",
  "trust",
  "howItWorks",
  "whyChoose",
  "faq",
  "toolkit",
  "bottomCta",
] as const;

export type SeoSectionType = (typeof SEO_SECTION_TYPES)[number];

const SEO_PAGE_LOCALES = ["en", "zh"] as const;
const SEO_PAGE_ROOT = path.join(process.cwd(), "public", "seo-pages");
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set([
  "admin",
  "create",
  "creations",
  "dashboard",
  "free",
  "forgot-password",
  "lyric-videos",
  "pricing",
  "privacy-policy",
  "reset-password",
  "settings",
  "sign-in",
  "sign-up",
  "terms-of-service",
  "verify-email",
]);

export function isSeoPageLocale(locale: string): locale is SeoPageLocale {
  return (SEO_PAGE_LOCALES as readonly string[]).includes(locale);
}

export function getSeoPage(locale: string, slug: string): SeoPageContent | null {
  if (!isSeoPageLocale(locale) || !isValidSeoSlug(slug)) return null;

  const filePath = seoPagePath(locale, slug);
  if (!fs.existsSync(filePath)) return null;

  return readSeoPageFile(filePath, locale, slug);
}

export function getSeoPageSlugs(locale: SeoPageLocale): string[] {
  const dir = path.join(SEO_PAGE_ROOT, locale);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((filename) => filename.endsWith(".json"))
    .map((filename) => filename.replace(/\.json$/, ""))
    .sort();
}

export function getSeoPageStaticParams() {
  return SEO_PAGE_LOCALES.flatMap((locale) =>
    getSeoPageSlugs(locale).map((slug) => ({ locale, slug })),
  );
}

export function getAllSeoPages() {
  return SEO_PAGE_LOCALES.flatMap((locale) =>
    getSeoPageSlugs(locale).map((slug) => {
      const page = getSeoPage(locale, slug);
      if (!page) {
        throw new Error(`Unable to read SEO page: ${locale}/${slug}`);
      }
      return { locale, slug, page };
    }),
  );
}

export function assertSeoPagePairs() {
  const byLocale = Object.fromEntries(
    SEO_PAGE_LOCALES.map((locale) => [locale, getSeoPageSlugs(locale)]),
  ) as Record<SeoPageLocale, string[]>;

  for (const slug of byLocale.en) {
    if (!byLocale.zh.includes(slug)) {
      throw new Error(`Missing zh SEO page JSON for slug: ${slug}`);
    }
  }

  for (const slug of byLocale.zh) {
    if (!byLocale.en.includes(slug)) {
      throw new Error(`Missing en SEO page JSON for slug: ${slug}`);
    }
  }
}

function seoPagePath(locale: SeoPageLocale, slug: string) {
  return path.join(SEO_PAGE_ROOT, locale, `${slug}.json`);
}

function readSeoPageFile(filePath: string, locale: SeoPageLocale, expectedSlug: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid SEO page JSON at ${relativePath(filePath)}: ${(error as Error).message}`);
  }

  return validateSeoPage(parsed, locale, expectedSlug, filePath);
}

function validateSeoPage(value: unknown, locale: SeoPageLocale, expectedSlug: string, filePath: string): SeoPageContent {
  const where = `${locale}/${expectedSlug}`;
  assertRecord(value, where);

  const page = value as SeoPageContent;
  assertNonEmptyString(page.slug, `${where}.slug`);
  if (page.slug !== expectedSlug) {
    throw new Error(`${where}.slug must match filename "${expectedSlug}"`);
  }
  if (!isValidSeoSlug(page.slug)) {
    throw new Error(`${where}.slug must be lowercase kebab-case`);
  }
  if (RESERVED_SLUGS.has(page.slug)) {
    throw new Error(`${where}.slug conflicts with an existing route`);
  }

  assertRecord(page.layout, `${where}.layout`);
  assertSeoSectionTypes(page.layout.sections, `${where}.layout.sections`);

  assertRecord(page.seo, `${where}.seo`);
  assertNonEmptyString(page.seo.title, `${where}.seo.title`);
  assertNonEmptyString(page.seo.description, `${where}.seo.description`);
  assertStringArray(page.seo.keywords, `${where}.seo.keywords`);

  page.layout.sections.forEach((section) => validateSelectedSection(page, section, where));

  return page;
}

function validateSelectedSection(page: SeoPageContent, section: SeoSectionType, where: string) {
  switch (section) {
    case "heroTool":
      validateHeroSection(page, where);
      return;
    case "trust":
      assertStringArray(page.trust, `${where}.trust`);
      return;
    case "howItWorks":
      validateHowItWorksSection(page, where);
      return;
    case "whyChoose":
      validateWhyChooseSection(page, where);
      return;
    case "faq":
      validateFaqSection(page, where);
      return;
    case "toolkit":
      validateToolkitSection(page, where);
      return;
    case "bottomCta":
      validateBottomCtaSection(page, where);
      return;
  }
}

function validateHeroSection(page: SeoPageContent, where: string) {
  assertRecord(page.hero, `${where}.hero`);
  assertNonEmptyString(page.hero.badge, `${where}.hero.badge`);
  assertNonEmptyString(page.hero.h1, `${where}.hero.h1`);
  assertNonEmptyString(page.hero.subhead, `${where}.hero.subhead`);
  assertNonEmptyString(page.hero.primaryCta, `${where}.hero.primaryCta`);
  assertNonEmptyString(page.hero.secondaryCta, `${where}.hero.secondaryCta`);
}

function validateHowItWorksSection(page: SeoPageContent, where: string) {
  assertRecord(page.howItWorks, `${where}.howItWorks`);
  assertNonEmptyString(page.howItWorks.title, `${where}.howItWorks.title`);
  assertStepItems(page.howItWorks.steps, `${where}.howItWorks.steps`);
}

function validateWhyChooseSection(page: SeoPageContent, where: string) {
  assertRecord(page.whyChoose, `${where}.whyChoose`);
  assertNonEmptyString(page.whyChoose.title, `${where}.whyChoose.title`);
  assertNonEmptyString(page.whyChoose.description, `${where}.whyChoose.description`);
  assertRecord(page.whyChoose.highlight, `${where}.whyChoose.highlight`);
  assertNonEmptyString(page.whyChoose.highlight.title, `${where}.whyChoose.highlight.title`);
  assertNonEmptyString(page.whyChoose.highlight.description, `${where}.whyChoose.highlight.description`);
  assertTextItems(page.whyChoose.cards, `${where}.whyChoose.cards`);
  if (page.whyChoose.cards.length < 3) {
    throw new Error(`${where}.whyChoose.cards must include at least 3 items`);
  }
}

function validateToolkitSection(page: SeoPageContent, where: string) {
  assertRecord(page.toolkit, `${where}.toolkit`);
  assertNonEmptyString(page.toolkit.title, `${where}.toolkit.title`);
  assertNonEmptyString(page.toolkit.description, `${where}.toolkit.description`);

  assertTextItems(page.useCases, `${where}.useCases`);
}

function validateFaqSection(page: SeoPageContent, where: string) {
  assertRecord(page.faq, `${where}.faq`);
  assertNonEmptyString(page.faq.title, `${where}.faq.title`);
  assertFaqItems(page.faq.items, `${where}.faq.items`);
}

function validateBottomCtaSection(page: SeoPageContent, where: string) {
  assertRecord(page.bottomCta, `${where}.bottomCta`);
  assertNonEmptyString(page.bottomCta.title, `${where}.bottomCta.title`);
  assertNonEmptyString(page.bottomCta.description, `${where}.bottomCta.description`);
  assertNonEmptyString(page.bottomCta.button, `${where}.bottomCta.button`);
}

function assertTextItems(value: unknown, label: string) {
  assertArray(value, label);
  value.forEach((item, index) => {
    assertRecord(item, `${label}[${index}]`);
    assertNonEmptyString(item.title, `${label}[${index}].title`);
    assertNonEmptyString(item.description, `${label}[${index}].description`);
  });
}

function assertStepItems(value: unknown, label: string) {
  assertArray(value, label);
  value.forEach((item, index) => {
    assertRecord(item, `${label}[${index}]`);
    assertNonEmptyString(item.title, `${label}[${index}].title`);
    assertNonEmptyString(item.description, `${label}[${index}].description`);
    if ("image" in item && item.image !== undefined) {
      assertPublicImagePath(item.image, `${label}[${index}].image`);
    }
  });
}

function assertFaqItems(value: unknown, label: string) {
  assertArray(value, label);
  value.forEach((item, index) => {
    assertRecord(item, `${label}[${index}]`);
    assertNonEmptyString(item.question, `${label}[${index}].question`);
    assertNonEmptyString(item.answer, `${label}[${index}].answer`);
  });
}

function assertStringArray(value: unknown, label: string) {
  assertArray(value, label);
  value.forEach((item, index) => assertNonEmptyString(item, `${label}[${index}]`));
}

function assertSeoSectionTypes(value: unknown, label: string): asserts value is SeoSectionType[] {
  assertArray(value, label);

  const seen = new Set<string>();
  value.forEach((item, index) => {
    assertNonEmptyString(item, `${label}[${index}]`);
    if (!SEO_SECTION_TYPES.includes(item as SeoSectionType)) {
      throw new Error(`${label}[${index}] must be one of: ${SEO_SECTION_TYPES.join(", ")}`);
    }
    if (seen.has(item)) {
      throw new Error(`${label} must not include duplicate section "${item}"`);
    }
    seen.add(item);
  });
}

function assertArray(value: unknown, label: string): asserts value is any[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertPublicImagePath(value: unknown, label: string): asserts value is string {
  assertNonEmptyString(value, label);
  if (!value.startsWith("/") || value.includes("..") || value.includes("://")) {
    throw new Error(`${label} must be a public absolute image path`);
  }
}

function isValidSeoSlug(slug: string) {
  return SLUG_PATTERN.test(slug);
}

function relativePath(filePath: string) {
  return path.relative(process.cwd(), filePath);
}
