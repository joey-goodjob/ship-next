import { headers } from 'next/headers';
import { respData, respErr } from '@/lib/resp';
import { getAuth } from '@/core/auth';
import { hasPermission } from '@/modules/rbac/service';
import { db } from '@/core/db';
import { credit, role, user, userRole } from '@/config/db/schema';
import { desc, count, or, like, and, eq, gt, inArray, isNull, sum, type SQL } from 'drizzle-orm';

type UserCreditRow = {
  userId: string;
  total: string | number | null;
};

type UserRoleRow = {
  id: string;
  userId: string;
  roleId: string;
  expiresAt: Date | null;
  roleName: string;
  roleTitle: string;
};

async function getUserSourceStats() {
  const rows = await db()
    .select({ utmSource: user.utmSource, userCount: count() })
    .from(user)
    .groupBy(user.utmSource)
    .orderBy(desc(count()));

  return rows.map((row: { utmSource: string; userCount: number }) => ({
    utmSource: row.utmSource || '',
    userCount: Number(row.userCount) || 0,
  }));
}

export async function GET(req: Request) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return respErr('Unauthorized');

    const isAdmin = await hasPermission(session.user.id, 'admin.*');
    if (!isAdmin) return respErr('Forbidden');

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10')));
    const offset = (page - 1) * pageSize;
    const search = searchParams.get('search');
    const utmSource = searchParams.get('utmSource') || '';
    const sourceStatsOnly = searchParams.get('sourceStatsOnly') === '1';

    if (sourceStatsOnly) {
      return respData({
        items: [],
        total: 0,
        sourceStats: await getUserSourceStats(),
      });
    }

    const conditions: SQL[] = [];
    if (search) {
      conditions.push(
        or(
          like(user.email, `%${search}%`),
          like(user.name, `%${search}%`)
        )!
      );
    }
    if (utmSource) {
      conditions.push(
        utmSource === 'direct'
          ? or(eq(user.utmSource, ''), eq(user.utmSource, 'Direct'))!
          : like(user.utmSource, `%${utmSource}%`)
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db().select({ count: count() }).from(user).where(where);
    const total = Number(totalResult?.count || 0);

    const users = await db()
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        createdAt: user.createdAt,
        emailVerified: user.emailVerified,
        utmSource: user.utmSource,
        ip: user.ip,
        locale: user.locale,
      })
      .from(user)
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(pageSize)
      .offset(offset);

    type AdminUserRow = typeof users[number];

    const userIds = users.map((u: AdminUserRow) => u.id);
    const [creditRows, roleRows]: [UserCreditRow[], UserRoleRow[]] = userIds.length > 0
      ? await Promise.all([
          db()
            .select({
              userId: credit.userId,
              total: sum(credit.remainingCredits),
            })
            .from(credit)
            .where(
              and(
                inArray(credit.userId, userIds),
                eq(credit.transactionType, 'grant'),
                eq(credit.status, 'active'),
                gt(credit.remainingCredits, 0),
                or(isNull(credit.expiresAt), gt(credit.expiresAt, new Date()))
              )
            )
            .groupBy(credit.userId),
          db()
            .select({
              id: userRole.id,
              userId: userRole.userId,
              roleId: userRole.roleId,
              expiresAt: userRole.expiresAt,
              roleName: role.name,
              roleTitle: role.title,
            })
            .from(userRole)
            .innerJoin(role, eq(userRole.roleId, role.id))
            .where(inArray(userRole.userId, userIds)),
        ])
      : [[], []];

    const creditsByUserId = new Map(
      creditRows.map((row: UserCreditRow) => [row.userId, parseInt(String(row.total || '0'), 10) || 0])
    );
    const rolesByUserId = new Map<string, UserRoleRow[]>();
    for (const row of roleRows) {
      const rows = rolesByUserId.get(row.userId) || [];
      rows.push(row);
      rolesByUserId.set(row.userId, rows);
    }

    const withCredits = users.map((u: AdminUserRow) => ({
      ...u,
      credits: creditsByUserId.get(u.id) || 0,
      roles: rolesByUserId.get(u.id) || [],
    }));

    return respData({
      items: withCredits,
      total,
      sourceStats: [],
    });
  } catch (error: any) {
    return respErr(error.message || 'Internal error');
  }
}
