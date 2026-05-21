import { headers } from 'next/headers';
import { getAuth } from '@/core/auth';
import { respData, respErr } from '@/lib/resp';
import * as service from '@/modules/lyric-videos/service';

async function getUserId() {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  try {
    const { id } = await params;
    const body = await req.json();
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const data = await service.replaceLyrics({ userId, projectId: id, lines });
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Save lyrics failed');
  }
}
