import { headers } from "next/headers";

import { getAuth } from "@/core/auth";
import { respData, respErr } from "@/lib/resp";
import { getAdminBugRadarData } from "@/modules/bug-radar/service";
import { hasPermission } from "@/modules/rbac/service";

export async function GET(request: Request) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return respErr("Unauthorized");

    const isAdmin = await hasPermission(session.user.id, "admin.*");
    if (!isAdmin) return respErr("Forbidden");

    const { searchParams } = new URL(request.url);
    const includeTestEvents = searchParams.get("includeTest") === "1";
    const hours = Number(searchParams.get("hours") || 24);
    const data = await getAdminBugRadarData({ includeTestEvents, hours });

    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || "Internal error");
  }
}
