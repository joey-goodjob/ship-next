import { respData, respErr } from '@/lib/resp';
import * as service from '@/modules/lyric-videos/service';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return respErr('Debug API is disabled in production');
  }

  try {
    const body = await req.json();
    const data = await service.generateStoryboardScenesWithKieForDebug({
      songAnalysis: body?.songAnalysis || body?.prompt1_output,
      preprocess: body?.preprocess,
      model: body?.model,
    });
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Debug storyboard scenes failed');
  }
}
