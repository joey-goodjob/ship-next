import { headers } from 'next/headers';
import { getAuth } from '@/core/auth';
import { respData, respErr, respOk } from '@/lib/resp';
import * as service from '@/modules/lyric-videos/service';

async function getUserId() {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; castId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  try {
    const { id, castId } = await params;
    const body = await req.json().catch(() => ({}));
    const data = await service.updateCastMember({
      userId,
      projectId: id,
      castId,
      name: body.name,
      role: body.role,
      description: body.description,
      promptFragment: body.promptFragment,
      referenceImageUrl: body.referenceImageUrl,
      status: body.status,
      selectAsMain: Boolean(body.selectAsMain),
    });
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Update character failed');
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; castId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  try {
    const { id, castId } = await params;
    await service.removeCastMember({ userId, projectId: id, castId });
    return respOk();
  } catch (error: any) {
    return respErr(error?.message || 'Delete character failed');
  }
}
