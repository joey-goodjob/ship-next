import { db } from "@/core/db";
import { trafficEvent } from "@/config/db/schema";
import { getUuid, md5 } from "@/lib/hash";
import { enforceMinIntervalRateLimit } from "@/lib/rate-limit";
import { respData } from "@/lib/resp";
import {
  deriveTrafficSource,
  getHostFromUrl,
  isMissingTrafficTableError,
  isTrackablePath,
  normalizePathname,
  normalizeTrafficText,
  TRAFFIC_EVENT_TYPES,
} from "@/lib/traffic";
import { hasTrafficEventTable } from "@/modules/traffic-analytics/service";

const BOT_UA_PATTERN =
  /bot|spider|crawler|crawling|facebookexternalhit|slurp|headless|preview/i;

function getClientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""
  );
}

function getCountry(request: Request) {
  return normalizeTrafficText(
    (
      request.headers.get("cf-ipcountry") ||
      request.headers.get("x-vercel-ip-country") ||
      ""
    ).toUpperCase(),
    8
  );
}

function getRegion(request: Request) {
  return normalizeTrafficText(
    request.headers.get("cf-region") ||
      request.headers.get("x-vercel-ip-country-region") ||
      request.headers.get("x-vercel-region") ||
      "",
    120
  );
}

function getCity(request: Request) {
  return normalizeTrafficText(
    request.headers.get("cf-ipcity") ||
      request.headers.get("x-vercel-ip-city") ||
      "",
    120
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const pathname = normalizeTrafficText(body?.pathname, 500);
    const normalizedPath = normalizePathname(pathname);
    const visitorId = normalizeTrafficText(body?.visitorId, 120);
    const sessionId = normalizeTrafficText(body?.sessionId, 120);
    const locale = normalizeTrafficText(body?.locale, 24);
    const pageTitle = normalizeTrafficText(body?.pageTitle, 200);
    const referrer = normalizeTrafficText(body?.referrer, 500);
    const utmSource = normalizeTrafficText(body?.utmSource, 120);
    const utmMedium = normalizeTrafficText(body?.utmMedium, 120);
    const utmCampaign = normalizeTrafficText(body?.utmCampaign, 160);
    const userAgent = normalizeTrafficText(
      request.headers.get("user-agent") || "",
      400
    );
    const eventType =
      body?.eventType === TRAFFIC_EVENT_TYPES.HEARTBEAT
        ? TRAFFIC_EVENT_TYPES.HEARTBEAT
        : TRAFFIC_EVENT_TYPES.PAGEVIEW;

    if (
      !pathname ||
      !visitorId ||
      !sessionId ||
      !isTrackablePath(pathname) ||
      BOT_UA_PATTERN.test(userAgent)
    ) {
      return respData({ ok: true, skipped: true });
    }

    const limited = enforceMinIntervalRateLimit(request, {
      intervalMs: 2000,
      keyPrefix: "analytics-traffic",
      extraKey: `${visitorId}|${eventType}|${normalizedPath}`,
    });
    if (limited) {
      return respData({ ok: true, skipped: true, reason: "rate_limited" });
    }

    if (!(await hasTrafficEventTable())) {
      return respData({ ok: true, skipped: true, reason: "missing_table" });
    }

    const { channel, detail } = deriveTrafficSource({
      utmSource,
      utmMedium,
      referrer,
    });
    const ip = getClientIp(request);

    await db()
      .insert(trafficEvent)
      .values({
        id: getUuid(),
        eventType,
        visitorId,
        sessionId,
        pathname,
        normalizedPath,
        pageTitle,
        referrer,
        referrerHost: getHostFromUrl(referrer),
        sourceChannel: channel,
        sourceDetail: detail,
        country: getCountry(request),
        region: getRegion(request),
        city: getCity(request),
        ipHash: ip ? md5(ip).slice(0, 24) : "",
        userAgent,
        locale,
        utmSource,
        utmMedium,
        utmCampaign,
      });

    return respData({ ok: true });
  } catch (error) {
    if (isMissingTrafficTableError(error)) {
      return respData({ ok: true, skipped: true, reason: "missing_table" });
    }

    return respData({ ok: true, skipped: true, reason: "internal_error" });
  }
}
