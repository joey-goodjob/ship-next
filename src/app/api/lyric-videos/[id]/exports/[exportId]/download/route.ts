import { headers } from 'next/headers';
import { getAuth } from '@/core/auth';
import { respErr } from '@/lib/resp';
import * as service from '@/modules/lyric-videos/service';

async function getUserId() {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; exportId: string }> },
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  try {
    const { id, exportId } = await params;
    const file = await service.getExportDownloadFile({ userId, projectId: id, exportId });

    return new Response(new Uint8Array(file.body), {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Content-Length': String(file.body.length),
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    });
  } catch (error: any) {
    return respErr(error?.message || 'Download export failed');
  }
}
