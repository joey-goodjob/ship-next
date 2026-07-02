import {
  getCookieFromCtx,
  getHeaderValue,
  guessLocaleFromAcceptLanguage,
} from "@/lib/cookie";
import { deriveAcquisitionSourceLabel } from "@/lib/traffic";

type AttributionContext = {
  ctx?: any;
  appUrl?: string;
  fallbackLocale?: string;
};

export type UserAttribution = {
  utmSource: string;
  ip: string;
  locale: string;
};

function sanitizeToken(value: string, maxLength = 160) {
  return value
    .trim()
    .replace(/[^\w\-.:]/g, "")
    .slice(0, maxLength);
}

function decodeCookie(ctx: any, name: string) {
  const raw = getCookieFromCtx(ctx, name);
  if (!raw || typeof raw !== "string") return "";

  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

function externalReferrer(ctx: any, appUrl?: string) {
  const cookieReferrer = decodeCookie(ctx, "traffic_referrer").slice(0, 500);
  if (cookieReferrer) return cookieReferrer;

  const headerReferrer = getHeaderValue(ctx, "referer") || "";
  if (!headerReferrer) return "";

  try {
    const appHost = appUrl ? new URL(appUrl).hostname.replace(/^www\./, "") : "";
    const referrerHost = new URL(headerReferrer).hostname.replace(/^www\./, "");
    return referrerHost && referrerHost !== appHost ? headerReferrer : "";
  } catch {
    return "";
  }
}

function clientIpFromContext(ctx: any) {
  const forwardedFor = getHeaderValue(ctx, "x-forwarded-for");
  return (
    getHeaderValue(ctx, "cf-connecting-ip") ||
    getHeaderValue(ctx, "x-real-ip") ||
    forwardedFor?.split(",")[0]?.trim() ||
    ""
  ).slice(0, 100);
}

function localeFromContext(ctx: any, fallbackLocale?: string) {
  const locale =
    decodeCookie(ctx, "NEXT_LOCALE") ||
    guessLocaleFromAcceptLanguage(getHeaderValue(ctx, "accept-language")) ||
    fallbackLocale ||
    "";

  return sanitizeToken(locale, 20);
}

export function buildUserAttributionFromContext({
  ctx,
  appUrl,
  fallbackLocale,
}: AttributionContext): UserAttribution {
  const acquisitionSource = decodeCookie(ctx, "acquisition_source").slice(0, 100);
  const utmSource = sanitizeToken(decodeCookie(ctx, "utm_source"));
  const utmMedium = sanitizeToken(decodeCookie(ctx, "utm_medium"));
  const gclid = sanitizeToken(decodeCookie(ctx, "gclid"));
  const msclkid = sanitizeToken(decodeCookie(ctx, "msclkid"));
  const fbclid = sanitizeToken(decodeCookie(ctx, "fbclid"));
  const referrer = externalReferrer(ctx, appUrl);

  return {
    utmSource:
      acquisitionSource ||
      deriveAcquisitionSourceLabel({
        utmSource,
        utmMedium,
        referrer,
        gclid,
        msclkid,
        fbclid,
      }).slice(0, 100),
    ip: clientIpFromContext(ctx),
    locale: localeFromContext(ctx, fallbackLocale),
  };
}
