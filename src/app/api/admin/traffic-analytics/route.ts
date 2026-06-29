import { headers } from "next/headers";

import { getAuth } from "@/core/auth";
import { respData, respErr } from "@/lib/resp";
import { hasPermission } from "@/modules/rbac/service";
import { getTrafficAnalyticsData } from "@/modules/traffic-analytics/service";

export async function GET(req: Request) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return respErr("Unauthorized");

    const isAdmin = await hasPermission(session.user.id, "admin.*");
    if (!isAdmin) return respErr("Forbidden");

    const { searchParams } = new URL(req.url);
    const data = await getTrafficAnalyticsData({
      rangePreset: searchParams.get("range"),
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
      timeZone: searchParams.get("timeZone") || "UTC",
    });

    return respData(data);
  } catch (error: any) {
    return respErr(error.message || "Internal error");
  }
}
