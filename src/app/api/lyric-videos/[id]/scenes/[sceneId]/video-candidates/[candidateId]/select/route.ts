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
  _req: Request,
  { params }: { params: Promise<{ id: string; sceneId: string; candidateId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  const { id, sceneId, candidateId } = await params;
  try {
    const data = await service.selectSceneVideoCandidate({
      userId,
      projectId: id,
      sceneId,
      candidateId,
    });
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Select scene video candidate failed');
  }
}
