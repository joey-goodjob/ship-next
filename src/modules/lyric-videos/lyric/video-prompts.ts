import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/core/db';
import { lyricVideoProject, lyricVideoScene } from '@/config/db/schema';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { generateVideoPromptsForScenes } from './llm';

type SceneWithMotionPrompt = {
  id?: string | null;
  motionPrompt?: string | null;
};

export function selectScenesMissingMotionPrompts<T extends SceneWithMotionPrompt>(
  scenes: T[],
  sceneIds?: string[]
) {
  const requestedIds = new Set((sceneIds || []).filter(Boolean));
  return scenes.filter((scene) => {
    if (!scene.id) return false;
    if (requestedIds.size > 0 && !requestedIds.has(scene.id)) return false;
    return !String(scene.motionPrompt || '').trim();
  });
}

export async function getProjectScenesByIds(params: {
  userId: string;
  projectId: string;
  sceneIds: string[];
}) {
  const sceneIds = Array.from(new Set(params.sceneIds.filter(Boolean)));
  if (sceneIds.length === 0) return [];

  const rows = await db()
    .select()
    .from(lyricVideoScene)
    .where(
      and(
        eq(lyricVideoScene.projectId, params.projectId),
        eq(lyricVideoScene.userId, params.userId),
        inArray(lyricVideoScene.id, sceneIds)
      )
    )
    .orderBy(lyricVideoScene.sort);

  const order = new Map(sceneIds.map((id, index) => [id, index]));
  return rows.sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function generateMissingSceneVideoPrompts(params: {
  userId: string;
  projectId: string;
  sceneIds?: string[];
  model?: string;
}) {
  const [project] = await db()
    .select()
    .from(lyricVideoProject)
    .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)))
    .limit(1);
  if (!project) throw new Error('Project not found');

  const sceneWhere = params.sceneIds?.length
    ? and(
        eq(lyricVideoScene.projectId, params.projectId),
        eq(lyricVideoScene.userId, params.userId),
        inArray(lyricVideoScene.id, params.sceneIds)
      )
    : and(eq(lyricVideoScene.projectId, params.projectId), eq(lyricVideoScene.userId, params.userId));

  const scenes = await db()
    .select()
    .from(lyricVideoScene)
    .where(sceneWhere)
    .orderBy(lyricVideoScene.sort);
  const targetScenes = selectScenesMissingMotionPrompts(scenes, params.sceneIds);

  if (targetScenes.length === 0) {
    logLyricStage('kie-video-prompts', 'missing-skip', {
      projectId: params.projectId,
      userId: params.userId,
      requestedSceneCount: params.sceneIds?.length || scenes.length,
    });
    return {
      status: 'skipped',
      sceneCount: 0,
      persistedSceneCount: 0,
      fallbackSceneIds: [],
      warnings: [],
      scenes: [],
    };
  }

  try {
    const result = await generateVideoPromptsForScenes({
      scenes: targetScenes,
      project,
      model: params.model,
    });
    const promptRows = (result.scenes || []).filter((scene: any) => scene.sceneId && scene.videoPrompt);

    await Promise.all(
      promptRows.map((scene: any) =>
        db()
          .update(lyricVideoScene)
          .set({ motionPrompt: scene.videoPrompt })
          .where(
            and(
              eq(lyricVideoScene.id, scene.sceneId),
              eq(lyricVideoScene.projectId, params.projectId),
              eq(lyricVideoScene.userId, params.userId),
              sql`trim(${lyricVideoScene.motionPrompt}) = ''`
            )
          )
      )
    );

    const updatedScenes = await getProjectScenesByIds({
      userId: params.userId,
      projectId: params.projectId,
      sceneIds: targetScenes.map((scene: any) => scene.id).filter(Boolean),
    });

    logLyricStage('kie-video-prompts', 'missing-written', {
      projectId: params.projectId,
      userId: params.userId,
      status: result.status,
      sceneCount: result.sceneCount,
      persistedSceneCount: promptRows.length,
      fallbackSceneIds: result.fallbackSceneIds,
    });

    return {
      ...result,
      persistedSceneCount: promptRows.length,
      scenes: updatedScenes,
    };
  } catch (error: any) {
    logLyricStageError('kie-video-prompts', 'missing-fail', error, {
      projectId: params.projectId,
      userId: params.userId,
      sceneCount: targetScenes.length,
    });
    throw error;
  }
}
