import { headers } from "next/headers";

import { getAuth } from "@/core/auth";
import { respData, respErr } from "@/lib/resp";
import {
  getClarityInsightsDashboard,
  syncClarityInsights,
} from "@/modules/clarity-analytics/service";
import { hasPermission } from "@/modules/rbac/service";

async function checkAdmin() {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");

  const isAdmin = await hasPermission(session.user.id, "admin.*");
  if (!isAdmin) throw new Error("Forbidden");
}

export async function GET() {
  try {
    await checkAdmin();
    return respData(await getClarityInsightsDashboard());
  } catch (error: any) {
    return respErr(error.message || "Internal error");
  }
}

export async function POST(req: Request) {
  try {
    await checkAdmin();
    const body = await req.json().catch(() => ({}));
    return respData(await syncClarityInsights({ days: body.days }));
  } catch (error: any) {
    return respErr(error.message || "Internal error");
  }
}
