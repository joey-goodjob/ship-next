import { and, desc, eq, isNull, ne, or } from 'drizzle-orm';
import { AIMediaType, AITaskStatus as ProviderTaskStatus } from '@/core/ai';
import { db } from '@/core/db';
import { lyricVideoCastMember, lyricVideoScene, type NewLyricVideoCastMember } from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { logLyricStageError } from '@/lib/lyric-video-log';
import { createTask, updateTask, AITaskStatus } from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { createKieProvider } from './llm';
import { parseJsonField, safeJson } from './json';
import { ACTIVE_CAST_ROLES, castRoleForStorage, ensureUniqueActiveCastName, removeCastIdFromSceneCastIds } from './cast-library';
import { getProjectDetails } from './project';

/**
 * 角色模块：管理歌词视频里的主角/候选角色。
 *
 * 角色不是生成主链路的必需条件，但如果项目有 active main cast，
 * `media-generation.ts` 会读取 `lyric_video_cast_member.referenceImageUrl`
 * 和 `promptFragment`，把它们拼进 scene prompt，让不同分镜里的主角更一致。
 */

const DEFAULT_CHARACTER_IMAGE_MODEL = 'nano-banana-2';
const CHARACTER_IMAGE_COST_CREDITS = 5;

function sameCastRoleCondition(role: string) {
  if (role === 'primary') return or(eq(lyricVideoCastMember.role, 'primary'), eq(lyricVideoCastMember.role, 'main'));
  if (role === 'secondary') {
    return or(
      eq(lyricVideoCastMember.role, 'secondary'),
      eq(lyricVideoCastMember.role, 'duet_partner'),
      eq(lyricVideoCastMember.role, 'supporting')
    );
  }
  return eq(lyricVideoCastMember.role, role);
}

function activeCastCount(cast: Array<{ role?: string | null; status?: string | null; deletedAt?: unknown }>) {
  return cast.filter((member) => !member.deletedAt && String(member.status || 'active') === 'active' && castRoleForStorage(member.role) !== 'inactive').length;
}

function nextCastAfterRoleExclusivity<T extends { id: string; role?: string | null; status?: string | null }>(cast: T[], activeRole?: string | null, activeCastId?: string) {
  const role = castRoleForStorage(activeRole);
  if (!ACTIVE_CAST_ROLES.includes(role)) return cast;
  return cast.map((member) => {
    if (activeCastId && member.id === activeCastId) return member;
    if (castRoleForStorage(member.role) !== role) return member;
    return { ...member, role: 'inactive', status: 'inactive' };
  });
}

function assertUniqueActiveCastNames(cast: Array<{ id: string; name?: string | null; role?: string | null; status?: string | null; deletedAt?: unknown; sort?: number | null }>) {
  if (!ensureUniqueActiveCastName(cast)) {
    throw new Error('Active character names must be unique. Rename one character before saving.');
  }
}

function resolveCharacterImageModel(configs: Record<string, string>, model?: string) {
  return model || configs.kie_character_image_model || DEFAULT_CHARACTER_IMAGE_MODEL;
}

function cleanText(value: unknown, fallback = '') {
  return String(value || fallback).trim();
}

function buildCharacterPrompt(params: {
  project: any;
  name: string;
  description: string;
}) {
  const styleParts = [
    params.project.artStyle,
    params.project.palette ? `${params.project.palette} color palette` : '',
    'three-view full body character reference sheet in a single image',
    'same character shown as front view, side view, and back view',
    'consistent face, hairstyle, body proportions, outfit, accessories, and shoes across all three views',
    'plain white background',
    'clear face, hairstyle, outfit, accessories, shoes',
    'cinematic lyric video production design',
    'no text, no typography, no watermark, no logo',
  ].filter(Boolean);

  return [
    `Character name: ${params.name}.`,
    `Character description: ${params.description}.`,
    `Visual requirements: ${styleParts.join(', ')}.`,
    'The image must be useful as a stable reference image for future scene generation.',
  ].join('\n');
}

export async function listCastMembers(params: { userId: string; projectId: string }) {
  return db()
    .select()
    .from(lyricVideoCastMember)
    .where(
      and(
        eq(lyricVideoCastMember.projectId, params.projectId),
        eq(lyricVideoCastMember.userId, params.userId),
        isNull(lyricVideoCastMember.deletedAt)
      )
    )
    .orderBy(lyricVideoCastMember.sort);
}

export async function createCastMember(params: {
  userId: string;
  projectId: string;
  name: string;
  role?: string;
  description: string;
  promptFragment?: string;
  referenceImageUrl?: string;
  generationParams?: unknown;
  status?: string;
  sort?: number;
}) {
  // 创建或保存用户选中的角色预设，写入 `lyric_video_cast_member`。
  // 后续 scene 图片生成会按 scene.castIds 或 active main cast 读取它。
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');

  const name = cleanText(params.name);
  const description = cleanText(params.description);
  if (!name) throw new Error('Character name is required');
  if (!description) throw new Error('Character description is required');

  const existing = await listCastMembers({ userId: params.userId, projectId: params.projectId });
  const role = castRoleForStorage(params.role || 'primary');
  const data: NewLyricVideoCastMember = {
    id: getUuid(),
    projectId: params.projectId,
    userId: params.userId,
    name,
    role,
    description,
    promptFragment: cleanText(params.promptFragment, description),
    referenceImageUrl: cleanText(params.referenceImageUrl) || null,
    generationParams: params.generationParams ? safeJson(params.generationParams) : null,
    status: role === 'inactive' ? 'inactive' : params.status || 'active',
    sort: params.sort ?? existing.length,
  };
  assertUniqueActiveCastNames([...nextCastAfterRoleExclusivity(existing, data.status === 'active' ? role : 'inactive'), data]);

  return db().transaction(async (tx: any) => {
    const [created] = await tx.insert(lyricVideoCastMember).values(data).returning();
    if (created && created.status === 'active' && ACTIVE_CAST_ROLES.includes(role)) {
      await tx
        .update(lyricVideoCastMember)
        .set({ status: 'inactive', role: 'inactive' })
        .where(
          and(
            eq(lyricVideoCastMember.projectId, params.projectId),
            eq(lyricVideoCastMember.userId, params.userId),
            sameCastRoleCondition(role),
            ne(lyricVideoCastMember.id, created.id),
            isNull(lyricVideoCastMember.deletedAt)
          )
        );
    }
    return created;
  });
}

export async function updateCastMember(params: {
  userId: string;
  projectId: string;
  castId: string;
  name?: string;
  role?: string;
  description?: string;
  promptFragment?: string;
  referenceImageUrl?: string | null;
  status?: string;
  selectAsMain?: boolean;
}) {
  const updateData: any = {};
  if (typeof params.name === 'string') updateData.name = params.name.trim();
  if (typeof params.role === 'string') {
    const role = castRoleForStorage(params.role);
    updateData.role = role;
    updateData.status = role === 'inactive' ? 'inactive' : 'active';
  }
  if (typeof params.description === 'string') updateData.description = params.description.trim();
  if (typeof params.promptFragment === 'string') updateData.promptFragment = params.promptFragment.trim();
  if (params.referenceImageUrl !== undefined) updateData.referenceImageUrl = params.referenceImageUrl || null;
  if (typeof params.status === 'string') updateData.status = params.status;
  updateData.error = null;

  return db().transaction(async (tx: any) => {
    const projectCast = await tx
      .select()
      .from(lyricVideoCastMember)
      .where(
        and(
          eq(lyricVideoCastMember.projectId, params.projectId),
          eq(lyricVideoCastMember.userId, params.userId),
          isNull(lyricVideoCastMember.deletedAt)
        )
      );
    const current = projectCast.find((member: any) => member.id === params.castId);
    if (!current) throw new Error('Character not found');

    if (params.selectAsMain) {
      updateData.role = 'primary';
      updateData.status = 'active';
    }

    const nextCurrent = { ...current, ...updateData };
    const nextProjectCast = nextCastAfterRoleExclusivity(
      projectCast.map((member: any) => (member.id === params.castId ? nextCurrent : member)),
      nextCurrent.status === 'active' ? nextCurrent.role : 'inactive',
      params.castId
    );
    assertUniqueActiveCastNames(nextProjectCast as any);

    if (updateData.role === 'inactive' || updateData.status === 'inactive') {
      if (current && String(current.status || 'active') === 'active' && castRoleForStorage(current.role) !== 'inactive' && activeCastCount(projectCast) <= 1) {
        throw new Error('Each project needs at least one active character');
      }
    }

    if (ACTIVE_CAST_ROLES.includes(updateData.role)) {
      await tx
        .update(lyricVideoCastMember)
        .set({ status: 'inactive', role: 'inactive' })
        .where(
          and(
            eq(lyricVideoCastMember.projectId, params.projectId),
            eq(lyricVideoCastMember.userId, params.userId),
            sameCastRoleCondition(updateData.role),
            ne(lyricVideoCastMember.id, params.castId),
            isNull(lyricVideoCastMember.deletedAt)
          )
        );
    }

    const [updated] = await tx
      .update(lyricVideoCastMember)
      .set(updateData)
      .where(
        and(
          eq(lyricVideoCastMember.id, params.castId),
          eq(lyricVideoCastMember.projectId, params.projectId),
          eq(lyricVideoCastMember.userId, params.userId),
          isNull(lyricVideoCastMember.deletedAt)
        )
      )
      .returning();
    if (!updated) throw new Error('Character not found');
    return updated;
  });
}

export async function removeCastMember(params: { userId: string; projectId: string; castId: string }) {
  await db().transaction(async (tx: any) => {
    const projectCast = await tx
      .select()
      .from(lyricVideoCastMember)
      .where(
        and(
          eq(lyricVideoCastMember.projectId, params.projectId),
          eq(lyricVideoCastMember.userId, params.userId),
          isNull(lyricVideoCastMember.deletedAt)
        )
      );
    const current = projectCast.find((member: any) => member.id === params.castId);
    if (current && String(current.status || 'active') === 'active' && castRoleForStorage(current.role) !== 'inactive' && activeCastCount(projectCast) <= 1) {
      throw new Error('Each project needs at least one active character');
    }

    await tx
      .update(lyricVideoCastMember)
      .set({ status: 'deleted', role: 'inactive', deletedAt: new Date() })
      .where(
        and(
          eq(lyricVideoCastMember.id, params.castId),
          eq(lyricVideoCastMember.projectId, params.projectId),
          eq(lyricVideoCastMember.userId, params.userId)
        )
      );

    const scenes = await tx
      .select()
      .from(lyricVideoScene)
      .where(and(eq(lyricVideoScene.projectId, params.projectId), eq(lyricVideoScene.userId, params.userId)));
    for (const scene of scenes) {
      const castIds = parseJsonField<string[]>(scene.castIds, []);
      if (!castIds.includes(params.castId)) continue;
      await tx
        .update(lyricVideoScene)
        .set({ castIds: safeJson(removeCastIdFromSceneCastIds(castIds, params.castId)) })
        .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)));
    }
  });
}

export async function queueCastImage(params: {
  userId: string;
  projectId: string;
  castId: string;
  model?: string;
}) {
  // 为角色生成参考图。这里创建 `ai_task`，并把 imageTaskId/providerTaskId
  // 写回 `lyric_video_cast_member`，等待 syncCastImages 轮询结果。
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');
  const castMember = details.cast.find((item: any) => item.id === params.castId);
  if (!castMember) throw new Error('Character not found');

  const configs = await getAllConfigs();
  const model = resolveCharacterImageModel(configs, params.model);
  const provider = await createKieProvider();
  const prompt = buildCharacterPrompt({
    project: details.project,
    name: castMember.name,
    description: castMember.promptFragment || castMember.description,
  });
  const options = {
    projectId: params.projectId,
    castId: params.castId,
    aspect_ratio: '1:1',
    resolution: '2K',
    output_format: 'jpg',
  };

  const task = await createTask({
    userId: params.userId,
    mediaType: 'image',
    provider: 'kie',
    model,
    prompt,
    costCredits: CHARACTER_IMAGE_COST_CREDITS,
    options,
  });

  try {
    const result = await provider.generate({
      params: {
        mediaType: AIMediaType.IMAGE,
        model,
        prompt,
        options,
      },
    });
    await updateTask({
      taskId: task.id,
      status: AITaskStatus.PROCESSING,
      providerTaskId: result.taskId,
      taskResult: result.taskResult,
    });

    const [updated] = await db()
      .update(lyricVideoCastMember)
      .set({
        referenceImageUrl: null,
        imageTaskId: task.id,
        providerTaskId: result.taskId,
        imageModel: model,
        imagePromptSnapshot: prompt,
        generationParams: safeJson({ model, ...options }),
        completedAt: null,
        failureCode: null,
        error: null,
        status: castMember.status === 'candidate' ? 'candidate' : 'processing',
      })
      .where(and(eq(lyricVideoCastMember.id, params.castId), eq(lyricVideoCastMember.userId, params.userId)))
      .returning();

    return updated;
  } catch (error: any) {
    await updateTask({ taskId: task.id, status: AITaskStatus.FAILED, taskResult: { error: error?.message } });
    const [updated] = await db()
      .update(lyricVideoCastMember)
      .set({
        imageTaskId: task.id,
        imageModel: model,
        imagePromptSnapshot: prompt,
        generationParams: safeJson({ model, ...options }),
        failureCode: 'queue_failed',
        error: error?.message || 'Character image generation failed',
        status: 'failed',
      })
      .where(and(eq(lyricVideoCastMember.id, params.castId), eq(lyricVideoCastMember.userId, params.userId)))
      .returning();
    return updated;
  }
}

export async function syncCastImages(params: { userId: string; projectId: string }) {
  // 轮询角色参考图。成功后写 `referenceImageUrl`，后续 scene 图片生成会用它保持角色一致。
  const cast = await listCastMembers({ userId: params.userId, projectId: params.projectId });
  const processing = cast.filter((member: any) => member.providerTaskId && !member.referenceImageUrl && member.status !== 'failed');
  if (processing.length === 0) return cast;

  const provider = await createKieProvider();
  for (const member of processing) {
    try {
      const result = await provider.query({ taskId: member.providerTaskId, mediaType: AIMediaType.IMAGE });
      if (result.taskStatus === ProviderTaskStatus.SUCCESS) {
        const imageUrl = result.taskInfo?.images?.[0]?.imageUrl;
        await db()
          .update(lyricVideoCastMember)
          .set({
            referenceImageUrl: imageUrl || null,
            status: imageUrl ? member.status === 'candidate' ? 'candidate' : 'active' : 'failed',
            completedAt: imageUrl ? new Date() : null,
            failureCode: imageUrl ? null : 'missing_image_url',
            error: imageUrl ? null : 'No image URL returned',
          })
          .where(and(eq(lyricVideoCastMember.id, member.id), eq(lyricVideoCastMember.userId, params.userId)));
        if (member.imageTaskId) {
          await updateTask({
            taskId: member.imageTaskId,
            status: imageUrl ? AITaskStatus.SUCCESS : AITaskStatus.FAILED,
            taskInfo: result.taskInfo,
            taskResult: result.taskResult,
          });
        }
      } else if (result.taskStatus === ProviderTaskStatus.FAILED) {
        const message = result.taskInfo?.errorMessage || 'Character image generation failed';
        await db()
          .update(lyricVideoCastMember)
          .set({ status: 'failed', failureCode: 'provider_failed', error: message })
          .where(and(eq(lyricVideoCastMember.id, member.id), eq(lyricVideoCastMember.userId, params.userId)));
        if (member.imageTaskId) {
          await updateTask({ taskId: member.imageTaskId, status: AITaskStatus.FAILED, taskResult: result.taskResult });
        }
      }
    } catch (error: any) {
      logLyricStageError('cast-images', 'sync-fail', error, {
        projectId: params.projectId,
        userId: params.userId,
        castId: member.id,
        providerTaskId: member.providerTaskId,
      });
    }
  }

  return listCastMembers({ userId: params.userId, projectId: params.projectId });
}

export async function getLatestMainCast(params: { userId: string; projectId: string }) {
  const [active] = await db()
    .select()
    .from(lyricVideoCastMember)
    .where(
      and(
        eq(lyricVideoCastMember.projectId, params.projectId),
        eq(lyricVideoCastMember.userId, params.userId),
        eq(lyricVideoCastMember.status, 'active'),
        isNull(lyricVideoCastMember.deletedAt)
      )
    )
    .orderBy(desc(lyricVideoCastMember.updatedAt))
    .limit(1);
  return active || null;
}
