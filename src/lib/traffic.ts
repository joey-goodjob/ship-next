import { locales } from "@/config/locale";

export const TRAFFIC_EVENT_TYPES = {
  PAGEVIEW: "pageview",
  HEARTBEAT: "heartbeat",
} as const;

const SEARCH_ENGINES = new Set(["google", "baidu", "bing", "yahoo"]);
const AI_ASSISTANTS = new Set(["chatgpt", "claude", "gemini", "perplexity"]);
const SOCIAL_NETWORKS = new Set([
  "facebook",
  "instagram",
  "linkedin",
  "reddit",
  "tiktok",
  "wechat",
  "weibo",
  "x",
  "youtube",
]);
const PAID_MEDIUMS = new Set([
  "cpc",
  "ppc",
  "paid",
  "paidsearch",
  "paid-search",
  "sem",
  "ads",
  "ad",
  "display",
  "retargeting",
]);

const NON_TRACKABLE_PREFIXES = [
  "/admin",
  "/settings",
  "/dashboard",
  "/creations",
  "/sign-in",
  "/sign-up",
  "/sign-out",
  "/auth",
  "/api",
  "/_next",
  "/_vercel",
];

export function normalizeTrafficText(value: unknown, maxLength = 255) {
  if (typeof value !== "string") return "";

  return value
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizePathname(pathname: string) {
  const rawPath = pathname.split("?")[0]?.split("#")[0]?.trim() || "/";
  const withSlash = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const segments = withSlash.split("/").filter(Boolean);

  if (segments.length > 0 && locales.includes(segments[0] as any)) {
    segments.shift();
  }

  const normalized = `/${segments.join("/")}`.replace(/\/+/g, "/");
  if (!normalized) return "/";

  return normalized !== "/" && normalized.endsWith("/")
    ? normalized.slice(0, -1)
    : normalized;
}

export function isTrackablePath(pathname: string) {
  const normalized = normalizePathname(pathname);

  if (
    NON_TRACKABLE_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
    )
  ) {
    return false;
  }

  return !/\/[^/]+\.[a-z0-9]{1,8}$/i.test(normalized);
}

export function getHostFromUrl(value?: string | null) {
  if (!value) return "";

  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizeSourceToken(value: string) {
  return normalizeTrafficText(value, 120)
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^\w.-]+/g, "");
}

function mapKnownSource(value: string) {
  if (!value) return "";

  if (value.includes("google")) return "google";
  if (
    value.includes("chatgpt") ||
    value.includes("chat.openai") ||
    value === "openai" ||
    value.endsWith(".openai.com")
  ) {
    return "chatgpt";
  }
  if (value.includes("perplexity")) return "perplexity";
  if (value.includes("claude") || value.includes("anthropic")) return "claude";
  if (value.includes("gemini")) return "gemini";
  if (value.includes("baidu")) return "baidu";
  if (value.includes("bing")) return "bing";
  if (value.includes("yahoo")) return "yahoo";
  if (value.includes("facebook") || value === "fb") return "facebook";
  if (value.includes("instagram")) return "instagram";
  if (
    value.includes("twitter") ||
    value === "t.co" ||
    value === "x.com" ||
    value.endsWith(".x.com")
  ) {
    return "x";
  }
  if (value.includes("linkedin")) return "linkedin";
  if (value.includes("youtube") || value.includes("youtu.be")) return "youtube";
  if (value.includes("github")) return "github";
  if (value.includes("reddit")) return "reddit";
  if (value.includes("tiktok") || value.includes("douyin")) return "tiktok";
  if (value.includes("wechat") || value.includes("weixin")) return "wechat";
  if (value.includes("weibo")) return "weibo";
  if (
    value.includes("email") ||
    value.includes("newsletter") ||
    value.includes("mailchimp")
  ) {
    return "email";
  }

  return "";
}

function isPaidMedium(medium: string) {
  return !!medium && (PAID_MEDIUMS.has(medium) || medium.includes("paid"));
}

export function deriveTrafficSource({
  utmSource,
  utmMedium,
  referrer,
}: {
  utmSource?: string | null;
  utmMedium?: string | null;
  referrer?: string | null;
}) {
  const source = normalizeSourceToken(utmSource || "");
  const medium = normalizeSourceToken(utmMedium || "");
  const referrerHost = getHostFromUrl(referrer);

  if (source) {
    const channel = mapKnownSource(source) || source;
    const detail = medium ? `${source}/${medium}` : source;
    return { channel, detail };
  }

  if (medium === "email" || medium === "newsletter") {
    return { channel: "email", detail: medium };
  }

  if (referrerHost) {
    return {
      channel: mapKnownSource(referrerHost) || "referral",
      detail: referrerHost,
    };
  }

  return { channel: "direct", detail: "direct" };
}

export function getTrafficSourceLabel(channel: string) {
  return (
    {
      direct: "Direct",
      referral: "Referral",
      chatgpt: "ChatGPT",
      perplexity: "Perplexity",
      claude: "Claude",
      gemini: "Gemini",
      google: "Google",
      baidu: "Baidu",
      bing: "Bing",
      yahoo: "Yahoo",
      facebook: "Facebook",
      instagram: "Instagram",
      x: "X",
      linkedin: "LinkedIn",
      youtube: "YouTube",
      github: "GitHub",
      reddit: "Reddit",
      tiktok: "TikTok",
      wechat: "WeChat",
      weibo: "Weibo",
      email: "Email",
    }[channel] ||
    channel ||
    "Unknown"
  );
}

const CANONICAL_CHANNEL_DETAIL: Record<string, string> = {
  google: "google.com",
  bing: "bing.com",
  yahoo: "yahoo.com",
  baidu: "baidu.com",
  chatgpt: "chatgpt.com",
  claude: "claude.ai",
  gemini: "gemini.google.com",
  perplexity: "perplexity.ai",
  facebook: "facebook.com",
  instagram: "instagram.com",
  x: "x.com",
  linkedin: "linkedin.com",
  youtube: "youtube.com",
  github: "github.com",
  reddit: "reddit.com",
  tiktok: "tiktok.com",
  wechat: "wechat.com",
  weibo: "weibo.com",
  email: "email",
  direct: "direct",
};

export function getCanonicalChannelDetail(channel: string) {
  return CANONICAL_CHANNEL_DETAIL[channel] || "";
}

export function normalizeStoredChannel(channel: string) {
  if (!channel) return "direct";
  return mapKnownSource(channel) || channel;
}

export function deriveAcquisitionSourceLabel({
  utmSource,
  utmMedium,
  referrer,
  gclid,
  msclkid,
  fbclid,
}: {
  utmSource?: string | null;
  utmMedium?: string | null;
  referrer?: string | null;
  gclid?: string | null;
  msclkid?: string | null;
  fbclid?: string | null;
}) {
  const source = normalizeSourceToken(utmSource || "");
  const medium = normalizeSourceToken(utmMedium || "");
  const referrerHost = getHostFromUrl(referrer);
  const referrerSource = normalizeSourceToken(referrerHost);
  const channel =
    mapKnownSource(source) || mapKnownSource(referrerSource) || source || "";

  if (
    (channel === "google" ||
      source === "googleads" ||
      source === "adwords" ||
      source === "google-ads") &&
    (!!gclid || isPaidMedium(medium))
  ) {
    return "Google Ads Search";
  }

  if (
    (channel === "bing" || source === "bingads" || source === "microsoftads") &&
    (!!msclkid || isPaidMedium(medium))
  ) {
    return "Bing Ads Search";
  }

  if (channel === "facebook" && (!!fbclid || isPaidMedium(medium))) {
    return "Facebook Ads";
  }

  if (
    SEARCH_ENGINES.has(channel) &&
    (medium === "organic" ||
      (!source && !!referrerHost && !gclid && !msclkid && !isPaidMedium(medium)))
  ) {
    return `${getTrafficSourceLabel(channel)} Organic Search`;
  }

  if (AI_ASSISTANTS.has(channel)) return getTrafficSourceLabel(channel);
  if (SOCIAL_NETWORKS.has(channel)) return getTrafficSourceLabel(channel);
  if (channel === "email" || medium === "email" || medium === "newsletter") {
    return "Email";
  }
  if (channel === "github") return "GitHub";

  if (channel) {
    const label = getTrafficSourceLabel(channel);
    return medium ? `${label} (${medium})` : label;
  }

  if (referrerHost) return `Referral (${referrerHost})`;

  return "Direct";
}

export function formatStoredAcquisitionSource(value?: string | null) {
  const normalized = normalizeTrafficText(value || "", 160);
  if (!normalized) return "Direct";

  if (/[A-Z]/.test(normalized) || normalized.includes(" ")) {
    return normalized;
  }

  const maybeUrl =
    normalized.includes("://") || !normalized.includes(".")
      ? normalized
      : `https://${normalized}`;

  return deriveAcquisitionSourceLabel({
    utmSource: normalized,
    referrer: maybeUrl,
  });
}

export function isMissingTrafficTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");

  return (
    message.includes("traffic_event") &&
    (message.includes("does not exist") ||
      message.includes("relation") ||
      message.includes("no such table") ||
      message.includes("doesn't exist"))
  );
}
