import { headers } from "next/headers";

import { getAuth } from "@/core/auth";
import { respData, respErr } from "@/lib/resp";
import { recordBugProblemEvent } from "@/modules/bug-radar/service";
import { hasPermission } from "@/modules/rbac/service";

const TEST_EVENTS: Record<string, { eventType: string; severity: string; flow: string; action: string; message: string; apiPath?: string; statusCode?: number }> = {
  frontend_error: {
    eventType: "frontend_error",
    severity: "error",
    flow: "frontend_runtime",
    action: "window_error",
    message: "Admin test frontend TypeError",
  },
  upload_failed: {
    eventType: "upload_failed",
    severity: "error",
    flow: "mp3_upload",
    action: "upload_failed",
    message: "Admin test upload failed",
    apiPath: "/api/storage/upload-audio",
    statusCode: 500,
  },
  audio_duration_failed: {
    eventType: "audio_duration_failed",
    severity: "error",
    flow: "mp3_upload",
    action: "decode_audio",
    message: "Admin test unable to decode audio waveform",
  },
  generation_failed: {
    eventType: "generation_failed",
    severity: "error",
    flow: "lyric_video_generation",
    action: "generation_failed",
    message: "Admin test Prompt1 story direction is not ready yet",
    apiPath: "/api/lyric-videos/test/generate",
    statusCode: 500,
  },
  api_error: {
    eventType: "api_error",
    severity: "error",
    flow: "api",
    action: "route_failed",
    message: "Admin test API returned an internal error",
    apiPath: "/api/test",
    statusCode: 500,
  },
  provider_error: {
    eventType: "provider_error",
    severity: "error",
    flow: "lyric_video_generation",
    action: "provider_error",
    message: "Admin test provider returned an error",
    statusCode: 502,
  },
};

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
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return respErr("Unauthorized");

    const isAdmin = await hasPermission(session.user.id, "admin.*");
    if (!isAdmin) return respErr("Forbidden");

    const body = await request.json().catch(() => ({}));
    const type = String(body?.type || "upload_failed");
    const event = TEST_EVENTS[type] || TEST_EVENTS.upload_failed;

    const result = await recordBugProblemEvent({
      ...event,
      source: "admin_test",
      pathname: body?.pathname || "/create",
      visitorId: `admin-test-${session.user.id}`,
      sessionId: "admin-test",
      userId: session.user.id,
      userAgent: request.headers.get("user-agent") || "",
      locale: body?.locale || "",
      metadata: { testType: type },
      isTest: true,
      ip: getClientIp(request),
    });

    return respData(result);
  } catch (error: any) {
    return respErr(error?.message || "Internal error");
  }
}
