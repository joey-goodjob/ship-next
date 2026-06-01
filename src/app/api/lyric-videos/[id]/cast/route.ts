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
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  try {
    const { id } = await params;
    const data = await service.listCastMembers({ userId, projectId: id });
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Load cast failed');
  }
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
    const data = await service.createCastMember({
      userId,
      projectId: id,
      name: body.name,
      role: body.role,
      description: body.description,
      promptFragment: body.promptFragment,
      referenceImageUrl: body.referenceImageUrl,
      status: body.status,
    });
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Create character failed');
  }
}
