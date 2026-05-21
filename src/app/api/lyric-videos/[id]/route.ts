import { headers } from 'next/headers';
import { getAuth } from '@/core/auth';
import { respData, respErr, respOk } from '@/lib/resp';
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

  const { id } = await params;
  const data = await service.getProjectDetails({ userId, id });
  if (!data) return respErr('Project not found');
  return respData(data);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  try {
    const { id } = await params;
    const body = await req.json();
    const data = await service.updateProject({ userId, id, data: body });
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Update project failed');
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  const { id } = await params;
  await service.removeProject({ userId, id });
  return respOk();
}
