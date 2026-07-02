import { headers } from "next/headers";
import { count, eq } from "drizzle-orm";
import { getAuth } from "@/core/auth";
import { db } from "@/core/db";
import { role, user } from "@/config/db/schema";
import { respData, respErr } from "@/lib/resp";
import { hasPermission } from "@/modules/rbac/service";

export async function GET() {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return respErr("Unauthorized");

    const isAdmin = await hasPermission(session.user.id, "admin.*");
    if (!isAdmin) return respErr("Forbidden");

    const [[userCount], [roleCount]] = await Promise.all([
      db().select({ total: count() }).from(user),
      db().select({ total: count() }).from(role).where(eq(role.status, "active")),
    ]);

    return respData({
      users: Number(userCount?.total || 0),
      roles: Number(roleCount?.total || 0),
    });
  } catch (error: any) {
    return respErr(error.message || "Internal error");
  }
}
