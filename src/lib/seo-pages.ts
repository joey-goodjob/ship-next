import fs from "node:fs";
import path from "node:path";

export type SeoPageLocale = "en" | "zh";

export type SeoManifestoRow = {
  myth: string;
  reality: string;
};

export type SeoStyleItem = {
  name: string;
  description: string;
  free: boolean;
};

export type SeoMethodItem = SeoTextItem & {
  meta: string;
  bestFor: string;
  steps: string[];
  cta?: string;
};

export type SeoComparisonRow = {
  label: string;
  values: string[];
};

export type SeoComparisonTable = {
  title: string;
  description?: string;
  columns: string[];
  rows: SeoComparisonRow[];
  note?: string;
  cta?: string;
};

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
  manifesto?: {
    title: string;
    rows: SeoManifestoRow[];
  };
  howItWorks?: {
    title: string;
    steps: SeoStepItem[];
  };
  styles?: {
    title: string;
    subtitle: string;
    items: SeoStyleItem[];
  };
  methodComparison?: {
    title: string;
    description: string;
    quickAnswer: SeoTextItem & {
      cta: string;
    };
    methods: SeoMethodItem[];
    comparison: {
      title: string;
      columns: string[];
      rows: SeoComparisonRow[];
      bottomLine: string;
      cta: string;
    };
    tips: {
      title: string;
      items: string[];
    };
  };
  comparisonTable?: SeoComparisonTable;
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
  relatedTools?: {
    title: string;
    items: SeoRelatedToolItem[];
  };
  contentSections?: SeoContentBlock[];
  faq?: {
    title: string;
    items: SeoFaqItem[];
  };
  bottomCta?: {
    title: string;
    description: string;
    button: string;
    upsell?: string;
  };
};

export type SeoTextItem = {
  title: string;
  description: string;
  image?: string;
};

export type SeoStepItem = SeoTextItem;

export type SeoFaqItem = {
  question: string;
  answer: string;
};

export type SeoRelatedToolItem = {
  slug: string;
  label: string;
  description: string;
};

export type SeoContentBlock = {
  heading: string;
  variant?: "callout" | "stats" | "cards" | "default";
  icon?: string;
  intro?: string;
  body?: string[];
  bullets?: string[];
  table?: {
    columns: string[];
    rows: string[][];
  };
};

export const SEO_SECTION_TYPES = [
  "heroTool",
  "trust",
  "manifesto",
  "howItWorks",
  "styles",
  "methodComparison",
  "comparisonTable",
  "whyChoose",
  "faq",
  "toolkit",
  "relatedTools",
  "contentSections",
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
    case "manifesto":
      validateManifestoSection(page, where);
      return;
    case "howItWorks":
      validateHowItWorksSection(page, where);
      return;
    case "styles":
      validateStylesSection(page, where);
      return;
    case "methodComparison":
      validateMethodComparisonSection(page, where);
      return;
    case "comparisonTable":
      validateComparisonTableSection(page, where);
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
    case "relatedTools":
      validateRelatedToolsSection(page, where);
      return;
    case "contentSections":
      validateContentSections(page, where);
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

function validateManifestoSection(page: SeoPageContent, where: string) {
  assertRecord(page.manifesto, `${where}.manifesto`);
  assertNonEmptyString(page.manifesto.title, `${where}.manifesto.title`);
  assertArray(page.manifesto.rows, `${where}.manifesto.rows`);
  page.manifesto.rows.forEach((row, index) => {
    assertRecord(row, `${where}.manifesto.rows[${index}]`);
    assertNonEmptyString(row.myth, `${where}.manifesto.rows[${index}].myth`);
    assertNonEmptyString(row.reality, `${where}.manifesto.rows[${index}].reality`);
  });
}

function validateStylesSection(page: SeoPageContent, where: string) {
  assertRecord(page.styles, `${where}.styles`);
  assertNonEmptyString(page.styles.title, `${where}.styles.title`);
  assertNonEmptyString(page.styles.subtitle, `${where}.styles.subtitle`);
  assertArray(page.styles.items, `${where}.styles.items`);
  page.styles.items.forEach((item, index) => {
    assertRecord(item, `${where}.styles.items[${index}]`);
    assertNonEmptyString(item.name, `${where}.styles.items[${index}].name`);
    assertNonEmptyString(item.description, `${where}.styles.items[${index}].description`);
    if (typeof item.free !== "boolean") {
      throw new Error(`${where}.styles.items[${index}].free must be a boolean`);
    }
  });
}

function validateMethodComparisonSection(page: SeoPageContent, where: string) {
  assertRecord(page.methodComparison, `${where}.methodComparison`);
  assertNonEmptyString(page.methodComparison.title, `${where}.methodComparison.title`);
  assertNonEmptyString(page.methodComparison.description, `${where}.methodComparison.description`);

  assertRecord(page.methodComparison.quickAnswer, `${where}.methodComparison.quickAnswer`);
  assertNonEmptyString(page.methodComparison.quickAnswer.title, `${where}.methodComparison.quickAnswer.title`);
  assertNonEmptyString(page.methodComparison.quickAnswer.description, `${where}.methodComparison.quickAnswer.description`);
  assertNonEmptyString(page.methodComparison.quickAnswer.cta, `${where}.methodComparison.quickAnswer.cta`);

  assertArray(page.methodComparison.methods, `${where}.methodComparison.methods`);
  if (page.methodComparison.methods.length !== 4) {
    throw new Error(`${where}.methodComparison.methods must include exactly 4 items`);
  }
  page.methodComparison.methods.forEach((method, index) => {
    assertRecord(method, `${where}.methodComparison.methods[${index}]`);
    assertNonEmptyString(method.title, `${where}.methodComparison.methods[${index}].title`);
    assertNonEmptyString(method.description, `${where}.methodComparison.methods[${index}].description`);
    assertNonEmptyString(method.meta, `${where}.methodComparison.methods[${index}].meta`);
    assertNonEmptyString(method.bestFor, `${where}.methodComparison.methods[${index}].bestFor`);
    assertStringArray(method.steps, `${where}.methodComparison.methods[${index}].steps`);
    if (method.cta !== undefined) {
      assertNonEmptyString(method.cta, `${where}.methodComparison.methods[${index}].cta`);
    }
  });

  assertRecord(page.methodComparison.comparison, `${where}.methodComparison.comparison`);
  assertNonEmptyString(page.methodComparison.comparison.title, `${where}.methodComparison.comparison.title`);
  assertStringArray(page.methodComparison.comparison.columns, `${where}.methodComparison.comparison.columns`);
  if (page.methodComparison.comparison.columns.length !== page.methodComparison.methods.length) {
    throw new Error(`${where}.methodComparison.comparison.columns must match method count`);
  }
  assertArray(page.methodComparison.comparison.rows, `${where}.methodComparison.comparison.rows`);
  page.methodComparison.comparison.rows.forEach((row, index) => {
    assertRecord(row, `${where}.methodComparison.comparison.rows[${index}]`);
    assertNonEmptyString(row.label, `${where}.methodComparison.comparison.rows[${index}].label`);
    assertStringArray(row.values, `${where}.methodComparison.comparison.rows[${index}].values`);
    if (row.values.length !== page.methodComparison!.comparison.columns.length) {
      throw new Error(`${where}.methodComparison.comparison.rows[${index}].values must match column count`);
    }
  });
  assertNonEmptyString(page.methodComparison.comparison.bottomLine, `${where}.methodComparison.comparison.bottomLine`);
  assertNonEmptyString(page.methodComparison.comparison.cta, `${where}.methodComparison.comparison.cta`);

  assertRecord(page.methodComparison.tips, `${where}.methodComparison.tips`);
  assertNonEmptyString(page.methodComparison.tips.title, `${where}.methodComparison.tips.title`);
  assertStringArray(page.methodComparison.tips.items, `${where}.methodComparison.tips.items`);
  if (page.methodComparison.tips.items.length !== 7) {
    throw new Error(`${where}.methodComparison.tips.items must include exactly 7 items`);
  }
}

function validateComparisonTableSection(page: SeoPageContent, where: string) {
  assertRecord(page.comparisonTable, `${where}.comparisonTable`);
  assertNonEmptyString(page.comparisonTable.title, `${where}.comparisonTable.title`);
  if (page.comparisonTable.description !== undefined) {
    assertNonEmptyString(page.comparisonTable.description, `${where}.comparisonTable.description`);
  }
  assertStringArray(page.comparisonTable.columns, `${where}.comparisonTable.columns`);
  assertArray(page.comparisonTable.rows, `${where}.comparisonTable.rows`);
  page.comparisonTable.rows.forEach((row, index) => {
    assertRecord(row, `${where}.comparisonTable.rows[${index}]`);
    assertNonEmptyString(row.label, `${where}.comparisonTable.rows[${index}].label`);
    assertStringArray(row.values, `${where}.comparisonTable.rows[${index}].values`);
    if (row.values.length !== page.comparisonTable!.columns.length) {
      throw new Error(`${where}.comparisonTable.rows[${index}].values must match column count`);
    }
  });
  if (page.comparisonTable.note !== undefined) {
    assertNonEmptyString(page.comparisonTable.note, `${where}.comparisonTable.note`);
  }
  if (page.comparisonTable.cta !== undefined) {
    assertNonEmptyString(page.comparisonTable.cta, `${where}.comparisonTable.cta`);
  }
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

function validateRelatedToolsSection(page: SeoPageContent, where: string) {
  assertRecord(page.relatedTools, `${where}.relatedTools`);
  assertNonEmptyString(page.relatedTools.title, `${where}.relatedTools.title`);
  assertArray(page.relatedTools.items, `${where}.relatedTools.items`);
  page.relatedTools.items.forEach((item, index) => {
    assertRecord(item, `${where}.relatedTools.items[${index}]`);
    assertNonEmptyString(item.slug, `${where}.relatedTools.items[${index}].slug`);
    assertNonEmptyString(item.label, `${where}.relatedTools.items[${index}].label`);
    assertNonEmptyString(item.description, `${where}.relatedTools.items[${index}].description`);
  });
}

function validateContentSections(page: SeoPageContent, where: string) {
  assertArray(page.contentSections, `${where}.contentSections`);
  page.contentSections.forEach((block, index) => {
    const at = `${where}.contentSections[${index}]`;
    assertRecord(block, at);
    assertNonEmptyString(block.heading, `${at}.heading`);
    if (block.variant !== undefined) assertNonEmptyString(block.variant, `${at}.variant`);
    if (block.icon !== undefined) assertNonEmptyString(block.icon, `${at}.icon`);
    if (block.intro !== undefined) assertNonEmptyString(block.intro, `${at}.intro`);
    if (block.body !== undefined) assertStringArray(block.body, `${at}.body`);
    if (block.bullets !== undefined) assertStringArray(block.bullets, `${at}.bullets`);
    if (block.table !== undefined) {
      assertRecord(block.table, `${at}.table`);
      assertStringArray(block.table.columns, `${at}.table.columns`);
      assertArray(block.table.rows, `${at}.table.rows`);
      block.table.rows.forEach((row, rowIndex) => assertStringArray(row, `${at}.table.rows[${rowIndex}]`));
    }
    if (!block.body && !block.bullets && !block.table) {
      throw new Error(`${at} must include body, bullets, or a table`);
    }
  });
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
    if ("image" in item && item.image !== undefined) {
      assertPublicImagePath(item.image, `${label}[${index}].image`);
    }
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
  if (value.startsWith("/") && !value.includes("..") && !value.includes("://")) {
    return;
  }

  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return;
  } catch {
    // Fall through to the shared validation error.
  }

  throw new Error(`${label} must be a public image path or an http(s) image URL`);
}

function isValidSeoSlug(slug: string) {
  return SLUG_PATTERN.test(slug);
}

function relativePath(filePath: string) {
  return path.relative(process.cwd(), filePath);
}
