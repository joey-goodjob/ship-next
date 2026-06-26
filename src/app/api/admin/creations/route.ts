import { headers } from 'next/headers';
import { getAuth } from '@/core/auth';
import { respData, respErr } from '@/lib/resp';
import { getAdminCreations } from '@/modules/lyric-videos/admin';
import { hasPermission } from '@/modules/rbac/service';

export async function GET(req: Request) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return respErr('Unauthorized');

    const isAdmin = await hasPermission(session.user.id, 'admin.*');
    if (!isAdmin) return respErr('Forbidden');

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize') || 12)));
    const search = searchParams.get('search');
    const view = searchParams.get('view');

    const data = await getAdminCreations({ page, pageSize, search, view });
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Internal error');
  }
}
