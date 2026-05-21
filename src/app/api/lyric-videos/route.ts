import { headers } from 'next/headers';
import { getAuth } from '@/core/auth';
import { respData, respErr } from '@/lib/resp';
import * as service from '@/modules/lyric-videos/service';

async function getUserId() {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  const data = await service.listProjects(userId);
  return respData(data);
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  try {
    const body = await req.json();
    const project = await service.createProject({ userId, ...body });
    return respData(project);
  } catch (error: any) {
    return respErr(error?.message || 'Create lyric video failed');
  }
}
