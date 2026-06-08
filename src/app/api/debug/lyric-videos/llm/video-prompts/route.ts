import { respData, respErr } from '@/lib/resp';
import * as service from '@/modules/lyric-videos/service';
import { debugFixtureName, readDebugFixture, withDebugFixture } from '../../_lib/fixtures';

export const runtime = 'nodejs';

function sceneToPersistedShape(scene: any, index: number) {
  const startMs = Number.isFinite(Number(scene?.startMs))
    ? Math.round(Number(scene.startMs))
    : Math.round(Number(scene?.start_s || 0) * 1000);
  const endMs = Number.isFinite(Number(scene?.endMs))
    ? Math.round(Number(scene.endMs))
    : Math.round(Number(scene?.end_s || 0) * 1000);

  return {
    ...scene,
    id: String(scene?.id || scene?.scene_id || index + 1),
    startMs,
    endMs,
    text: String(scene?.text || scene?.lyrics_summary || '').trim(),
    prompt: String(scene?.prompt || scene?.image_prompt || '').trim(),
    timelineConfig: scene?.timelineConfig || scene?.timeline_config || {},
    linkedLineIds: scene?.linkedLineIds || scene?.linked_line_ids || [],
  };
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return respErr('Debug API is disabled in production');
  }

  try {
    const body = await req.json();
    const model = body?.model || 'gpt-5-5';
    const prompt2Fixture = Array.isArray(body?.scenes)
      ? null
      : await readDebugFixture<any>(body?.fixtureKey, debugFixtureName('prompt2', ['kie_codex', model]));
    const scenes = (Array.isArray(body?.scenes) ? body.scenes : prompt2Fixture?.scenes || [])
      .map(sceneToPersistedShape)
      .filter((scene: any) => scene.prompt);
    if (scenes.length === 0) {
      return respErr('scenes with image_prompt are required for debug video prompt generation');
    }

    const data = await withDebugFixture({
      fixtureKey: body?.fixtureKey,
      cache: body?.cache,
      refreshCache: body?.refreshCache,
      stage: 'video-prompts',
      filename: debugFixtureName('video-prompts', ['kie_codex', model]),
    }, async () => service.generateVideoPromptsForScenes({
      scenes,
      project: body?.project || {},
      model,
    }));
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Debug video prompt generation failed');
  }
}
