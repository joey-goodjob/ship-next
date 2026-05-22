import { headers } from 'next/headers';
import { getAuth } from '@/core/auth';
import { respData, respErr } from '@/lib/resp';
import * as service from '@/modules/lyric-videos/service';

async function getUserId() {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  const { id, runId } = await params;
  const data = await service.getGenerationRun({ userId, projectId: id, runId });
  if (!data) return respErr('Generation run not found');
  return respData(data);
}
