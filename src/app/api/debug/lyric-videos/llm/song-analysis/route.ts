import { respData, respErr } from '@/lib/resp';
import * as service from '@/modules/lyric-videos/service';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return respErr('Debug API is disabled in production');
  }

  try {
    const body = await req.json();
    const preprocess = body?.preprocess || body;
    const data = await service.analyzeSongWithKieForDebug({
      preprocess,
      provider: body?.provider,
      model: body?.model,
    });
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Debug song analysis failed');
  }
}
