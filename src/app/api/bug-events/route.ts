import { headers } from "next/headers";

import { getAuth } from "@/core/auth";
import { enforceMinIntervalRateLimit } from "@/lib/rate-limit";
import { respData } from "@/lib/resp";
import { recordBugProblemEvent } from "@/modules/bug-radar/service";

const BOT_UA_PATTERN = /bot|spider|crawler|crawling|facebookexternalhit|slurp|preview/i;

function getClientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userAgent = request.headers.get("user-agent") || "";
    if (BOT_UA_PATTERN.test(userAgent)) {
      return respData({ ok: true, skipped: true, reason: "bot" });
    }

    const limited = enforceMinIntervalRateLimit(request, {
      intervalMs: 1000,
      keyPrefix: "bug-events",
      extraKey: `${body?.visitorId || ""}|${body?.eventType || ""}|${body?.pathname || ""}`,
    });
    if (limited) {
      return respData({ ok: true, skipped: true, reason: "rate_limited" });
    }

    const auth = getAuth();
    const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
    const result = await recordBugProblemEvent({
      ...body,
      userId: session?.user?.id,
      userAgent,
      ip: getClientIp(request),
    });

    return respData(result);
  } catch {
    return respData({ ok: true, skipped: true, reason: "internal_error" });
  }
}
