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
    const body = await req.json().catch(() => ({}));
    const data = await service.generateStoryboard({
      userId,
      projectId: id,
      storyPrompt: body.storyPrompt,
    });
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Generate storyboard failed');
  }
}
