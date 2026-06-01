import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { AIMediaType, AITaskStatus as ProviderTaskStatus } from '@/core/ai';
import { db } from '@/core/db';
import { lyricVideoCastMember, type NewLyricVideoCastMember } from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { createTask, updateTask, AITaskStatus } from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { callKieClaudeMessages, createKieProvider } from './llm';
import { parseJsonLoose, safeJson } from './json';
import { getProjectDetails } from './project';

const DEFAULT_CHARACTER_IMAGE_MODEL = 'nano-banana-2';
const CHARACTER_IMAGE_COST_CREDITS = 5;

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
    'full body character reference sheet',
    'single main character',
    'plain light background',
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

function buildCandidatePrompt(details: Awaited<ReturnType<typeof getProjectDetails>>) {
  const project = details?.project;
  const lyricSample = (details?.lines || [])
    .slice(0, 16)
    .map((line: any) => line.text)
    .filter(Boolean)
    .join('\n');
  const sceneSample = (details?.scenes || [])
    .slice(0, 8)
    .map((scene: any) => scene.prompt || scene.text)
    .filter(Boolean)
    .join('\n');

  return `You are a music video casting director. Create 3 distinct main-character candidates for a lyric video.

Project:
${JSON.stringify({
  title: project?.title,
  storyPrompt: project?.storyPrompt,
  artStyle: project?.artStyle,
  palette: project?.palette,
  aspectRatio: project?.aspectRatio,
  resolution: project?.resolution,
})}

Lyrics sample:
${lyricSample || 'No lyrics yet.'}

Scene prompt sample:
${sceneSample || 'No scene prompts yet.'}

Return only JSON:
{
  "characters": [
    {
      "name": "short memorable name",
      "role": "main",
      "description": "specific physical appearance, face, hair, skin tone, body type, wardrobe, accessories, and vibe",
      "promptFragment": "concise English prompt fragment for keeping this character consistent in generated images"
    }
  ]
}

Rules:
- Create exactly 3 candidates.
- Each description must be safe, concrete, and visually distinct.
- Do not mention real people, celebrities, brands, copyrighted characters, text, logos, or typography.`;
}

function normalizeCandidates(value: unknown) {
  const parsed = parseJsonLoose<any>(value, {});
  const rawCharacters = Array.isArray(parsed?.characters) ? parsed.characters : Array.isArray(parsed) ? parsed : [];
  return rawCharacters
    .map((item: any, index: number) => {
      const description = cleanText(item?.description || item?.promptFragment);
      return {
        name: cleanText(item?.name, `Character ${index + 1}`),
        role: cleanText(item?.role, 'main') || 'main',
        description,
        promptFragment: cleanText(item?.promptFragment, description),
      };
    })
    .filter((item: any) => item.description)
    .slice(0, 3);
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
  status?: string;
  sort?: number;
}) {
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');

  const name = cleanText(params.name);
  const description = cleanText(params.description);
  if (!name) throw new Error('Character name is required');
  if (!description) throw new Error('Character description is required');

  const existing = await listCastMembers({ userId: params.userId, projectId: params.projectId });
  const data: NewLyricVideoCastMember = {
    id: getUuid(),
    projectId: params.projectId,
    userId: params.userId,
    name,
    role: cleanText(params.role, 'main') || 'main',
    description,
    promptFragment: cleanText(params.promptFragment, description),
    referenceImageUrl: cleanText(params.referenceImageUrl) || null,
    status: params.status || 'active',
    sort: params.sort ?? existing.length,
  };

  const [created] = await db().insert(lyricVideoCastMember).values(data).returning();
  return created;
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
  if (typeof params.role === 'string') updateData.role = params.role.trim();
  if (typeof params.description === 'string') updateData.description = params.description.trim();
  if (typeof params.promptFragment === 'string') updateData.promptFragment = params.promptFragment.trim();
  if (params.referenceImageUrl !== undefined) updateData.referenceImageUrl = params.referenceImageUrl || null;
  if (typeof params.status === 'string') updateData.status = params.status;
  updateData.error = null;

  return db().transaction(async (tx: any) => {
    if (params.selectAsMain) {
      await tx
        .update(lyricVideoCastMember)
        .set({ status: 'inactive' })
        .where(
          and(
            eq(lyricVideoCastMember.projectId, params.projectId),
            eq(lyricVideoCastMember.userId, params.userId),
            ne(lyricVideoCastMember.id, params.castId),
            isNull(lyricVideoCastMember.deletedAt)
          )
        );
      updateData.role = 'main';
      updateData.status = 'active';
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
  await db()
    .update(lyricVideoCastMember)
    .set({ status: 'deleted', deletedAt: new Date() })
    .where(
      and(
        eq(lyricVideoCastMember.id, params.castId),
        eq(lyricVideoCastMember.projectId, params.projectId),
        eq(lyricVideoCastMember.userId, params.userId)
      )
    );
}

export async function queueCastImage(params: {
  userId: string;
  projectId: string;
  castId: string;
  model?: string;
}) {
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

export async function generateCastCandidates(params: {
  userId: string;
  projectId: string;
  model?: string;
}) {
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');

  const result = await callKieClaudeMessages({
    text: buildCandidatePrompt(details),
    maxTokens: 1800,
    thinkingFlag: false,
  });
  const candidates = normalizeCandidates(result.content);
  if (candidates.length === 0) throw new Error('No character candidates generated');

  logLyricStage('cast-candidates', 'generated', {
    projectId: params.projectId,
    userId: params.userId,
    count: candidates.length,
    model: result.model,
  });

  const existing = await listCastMembers({ userId: params.userId, projectId: params.projectId });
  const created = [];
  for (const [index, candidate] of candidates.entries()) {
    const [member] = await db()
      .insert(lyricVideoCastMember)
      .values({
        id: getUuid(),
        projectId: params.projectId,
        userId: params.userId,
        name: candidate.name,
        role: candidate.role,
        description: candidate.description,
        promptFragment: candidate.promptFragment,
        status: 'candidate',
        sort: existing.length + index,
      })
      .returning();
    created.push(await queueCastImage({ userId: params.userId, projectId: params.projectId, castId: member.id, model: params.model }));
  }

  return created;
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
