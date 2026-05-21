import { headers } from 'next/headers';
import { getAuth } from '@/core/auth';
import { respData, respErr } from '@/lib/resp';
import * as service from '@/modules/lyric-videos/service';

async function getUserId() {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; sceneId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  try {
    const { id, sceneId } = await params;
    const body = await req.json();
    const data = await service.updateScene({
      userId,
      projectId: id,
      sceneId,
      prompt: body.prompt,
      motionPrompt: body.motionPrompt,
    });
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Update scene failed');
  }
}
