"use client";

import { useEffect, useMemo, useRef, useState, type RefCallback, type UIEvent } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Coins, Expand, ImageIcon, Loader2, MoreVertical, RefreshCcw, Users, Wand2, X } from "lucide-react";
import { insertCastMention, parseCastMentionIds, parseCastMentionIdsFromPrompts, removeCastMention } from "@/lib/lyric-video-cast-mentions";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { PanelEmpty } from "./panel-empty";
import { usePlayback } from "./playback-context";
import {
  getSceneImageCandidateDisplayList,
  getSceneImageCandidateViewerIndex,
  getVisibleSceneImageCandidates,
  moveSceneImageCandidateViewerIndex,
  SCENE_IMAGE_CANDIDATE_WINDOW_SIZE,
  sortSceneImageCandidates,
} from "./scene-image-candidates";
import { formatDurationMs, formatMs, msToSeconds } from "./utils";
import type { LyricCastMember, LyricScene, LyricSceneImageCandidate } from "./types";

type PromptField = "image" | "video";

type SceneImageViewerState = {
  sceneLabel: string;
  candidates: LyricSceneImageCandidate[];
  index: number;
};

function sceneCastRoleRank(role?: string | null) {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "primary" || normalized === "main" || !normalized.trim()) return 0;
  if (["secondary", "duet_partner", "supporting"].includes(normalized)) return 1;
  if (["tertiary", "third"].includes(normalized)) return 2;
  if (["quaternary", "fourth"].includes(normalized)) return 3;
  return 4;
}

function sceneCastRoleLabel(member: LyricCastMember, index: number) {
  const rank = sceneCastRoleRank(member.role);
  if (rank === 0) return "Primary";
  if (rank === 1) return "Role 2";
  if (rank === 2) return "Role 3";
  if (rank === 3) return "Role 4";
  return `Role ${index + 1}`;
}

function activeSceneCast(cast: LyricCastMember[]) {
  return cast
    .filter((member) => member.status === "active" && sceneCastRoleRank(member.role) < 4)
    .sort((a, b) => sceneCastRoleRank(a.role) - sceneCastRoleRank(b.role) || (Number(a.sort) || 0) - (Number(b.sort) || 0))
    .slice(0, 4);
}

function castMentionBoundaryAllows(text: string, index: number) {
  if (index >= text.length) return true;
  return !/[\p{L}\p{N}_-]/u.test(text[index] || "");
}

function normalizedMentionName(name: unknown) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function splitPromptMentions(prompt: string, cast: LyricCastMember[]) {
  const text = String(prompt || "");
  const candidates = cast
    .map((member) => {
      const name = normalizedMentionName(member.name);
      return name ? { mention: `@${name}`, mentionLower: `@${name}`.toLowerCase() } : null;
    })
    .filter((candidate): candidate is { mention: string; mentionLower: string } => Boolean(candidate))
    .sort((a, b) => b.mention.length - a.mention.length);

  const parts: Array<{ mention: boolean; text: string }> = [];
  let cursor = 0;
  let index = 0;
  while (index < text.length) {
    if (text[index] !== "@") {
      index += 1;
      continue;
    }
    const rest = text.slice(index).toLowerCase();
    const match = candidates.find((candidate) => rest.startsWith(candidate.mentionLower) && castMentionBoundaryAllows(text, index + candidate.mention.length));
    if (!match) {
      index += 1;
      continue;
    }
    if (cursor < index) parts.push({ mention: false, text: text.slice(cursor, index) });
    parts.push({ mention: true, text: text.slice(index, index + match.mention.length) });
    index += match.mention.length;
    cursor = index;
  }
  if (cursor < text.length) parts.push({ mention: false, text: text.slice(cursor) });
  return parts;
}

export function ScenesPanel() {
  const { cast, generationLocked, generationLockReason, scenes, updateSceneCastIds } = useEditor();
  const { currentScene, setCurrentTime } = usePlayback();
  const [batchGenerationOpen, setBatchGenerationOpen] = useState(false);
  const promptReadyCount = scenes.filter((scene) => String(scene.prompt || "").trim()).length;
  const activeCast = activeSceneCast(cast);

  return (
    <div className="scenes-panel flex flex-col">
      <div className="mb-[16px] flex flex-col gap-[10px] border-b border-[var(--editor-line)] pb-[16px]">
        <div className="flex flex-wrap items-center justify-center gap-[8px]">
        <button
          type="button"
          onClick={() => setBatchGenerationOpen(true)}
          disabled={promptReadyCount === 0 || generationLocked}
          title={generationLocked ? generationLockReason : undefined}
          className="inline-flex h-[38px] items-center gap-[8px] rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[12px] text-[13px] font-[800] text-[var(--editor-text)] hover:bg-[var(--editor-bg)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Wand2 className="h-[15px] w-[15px]" />
          Batch Generation
        </button>
        </div>
      </div>

      {scenes.length === 0 ? (
        <PanelEmpty
          title="No scenes yet"
          description="Generate a storyboard to review scene timing, imagery, and prompts here."
        />
      ) : (
        <div className="flex flex-col">
          {scenes.map((scene, index) => {
            const active = currentScene?.id === scene.id;
            const durationMs = Math.max(0, (scene.endMs || scene.startMs) - scene.startMs);
            const title = scene.text?.trim() || "Instrumental";
            const sceneCastIds = scene.castIds || [];

            return (
              <div
                key={scene.id}
                role="button"
                tabIndex={0}
                onClick={() => setCurrentTime(msToSeconds(scene.startMs))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setCurrentTime(msToSeconds(scene.startMs));
                  }
                }}
                className={cn(
                  "group flex min-h-[82px] cursor-pointer items-center gap-[12px] border-b border-[var(--editor-line)] py-[10px] outline-none",
                  active ? "bg-[var(--editor-accent-soft)]" : "bg-[var(--editor-panel)] hover:bg-[var(--editor-bg)]",
                )}
              >
                <div className="h-[54px] w-[92px] shrink-0 overflow-hidden rounded-[4px] bg-[var(--editor-panel-strong)]">
                  {scene.imageUrl ? (
                    <img src={scene.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-[800] uppercase text-[var(--editor-subtle)]">
                      {sceneStatusLabel(scene)}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-[5px] flex min-w-0 flex-wrap items-center gap-x-[8px] gap-y-[2px] text-[11px] font-[800] text-[var(--editor-muted)]">
                    <span>Scene {index + 1}</span>
                    <span className="font-mono">
                      {formatMs(scene.startMs)} - {formatMs(scene.endMs)}
                    </span>
                    <span className="font-mono">{formatDurationMs(durationMs)}</span>
                  </div>
                  <p className="line-clamp-2 text-[15px] font-[700] leading-[20px] text-[var(--editor-text)]">{title}</p>
                  {scene.status === "failed" && !scene.imageUrl ? (
                    <p className="mt-[4px] line-clamp-1 text-[12px] font-[700] text-[var(--editor-danger)]">
                      {scene.error || "Image generation failed"}
                    </p>
                  ) : null}
                  {activeCast.length > 0 ? (
                    <div className="mt-[7px] flex flex-wrap items-center gap-[6px]" onClick={(event) => event.stopPropagation()}>
                      <Users className="h-[12px] w-[12px] text-[var(--editor-muted)]" />
                      <SceneCastButton label="None" active={sceneCastIds.length === 0} disabled={generationLocked} title={generationLocked ? generationLockReason : undefined} onClick={() => updateSceneCastIds(scene.id, [])} />
                      {activeCast.map((member, castIndex) => {
                        const selected = sceneCastIds.includes(member.id);
                        const nextCastIds = selected ? sceneCastIds.filter((id) => id !== member.id) : [...sceneCastIds, member.id];
                        return (
                          <SceneCastButton
                            key={member.id}
                            label={sceneCastRoleLabel(member, castIndex)}
                            active={selected}
                            disabled={generationLocked}
                            title={generationLocked ? generationLockReason : undefined}
                            onClick={() => updateSceneCastIds(scene.id, nextCastIds)}
                          />
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-[6px]">
                  <button
                    type="button"
                    onClick={(event) => event.stopPropagation()}
                    disabled={generationLocked}
                    title={generationLocked ? generationLockReason : undefined}
                    className="h-[36px] rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[11px] text-[13px] font-[800] text-[var(--editor-text)] hover:bg-[var(--editor-bg)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Scene ${index + 1} more options`}
                    disabled={generationLocked}
                    title={generationLocked ? generationLockReason : undefined}
                    className="flex h-[36px] w-[32px] items-center justify-center rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] text-[var(--editor-text)] hover:bg-[var(--editor-bg)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <MoreVertical className="h-[16px] w-[16px]" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <BatchGenerationDialog open={batchGenerationOpen} onClose={() => setBatchGenerationOpen(false)} />
    </div>
  );
}

function BatchGenerationDialog({ onClose, open }: { onClose: () => void; open: boolean }) {
  const { cast, generateSceneVideoPrompts, generationLocked, generationLockReason, project, queueSceneImages, retrySceneImage, scenes, selectSceneImageCandidate, updateScene } = useEditor();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [imagePromptDrafts, setImagePromptDrafts] = useState<Record<string, string>>({});
  const [videoPromptDrafts, setVideoPromptDrafts] = useState<Record<string, string>>({});
  const [sceneCastIdDrafts, setSceneCastIdDrafts] = useState<Record<string, string[]>>({});
  const [candidateOffsets, setCandidateOffsets] = useState<Record<string, number>>({});
  const [imageViewer, setImageViewer] = useState<SceneImageViewerState | null>(null);
  const [mentionMenu, setMentionMenu] = useState<{ sceneId: string; field: PromptField; query: string; cursor: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const activeCast = useMemo(() => activeSceneCast(cast), [cast]);

  useEffect(() => {
    if (!open) return;
    const imagePromptEntries = scenes.map((scene) => [scene.id, promptWithInitialCastMentions(scene.prompt || "", scene.castIds || [])] as const);
    setSelectedIds(new Set());
    setImagePromptDrafts(Object.fromEntries(imagePromptEntries));
    setVideoPromptDrafts(Object.fromEntries(scenes.map((scene) => [scene.id, scene.motionPrompt || ""])));
    setSceneCastIdDrafts(
      Object.fromEntries(
        imagePromptEntries.map(([sceneId, prompt]) => {
          const scene = scenes.find((item) => item.id === sceneId);
          return [sceneId, parseCastMentionIdsFromPrompts([prompt, scene?.motionPrompt || ""], activeCast)];
        }),
      ),
    );
    setMentionMenu(null);
    setCandidateOffsets({});
    setImageViewer(null);
    setSubmitting(false);
  }, [activeCast, open, scenes]);

  useEffect(() => {
    if (!imageViewer) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setImageViewer(null);
      } else if (event.key === "ArrowLeft") {
        setImageViewer((previous) =>
          previous
            ? {
                ...previous,
                index: moveSceneImageCandidateViewerIndex(previous.candidates, previous.index, -1),
              }
            : previous,
        );
      } else if (event.key === "ArrowRight") {
        setImageViewer((previous) =>
          previous
            ? {
                ...previous,
                index: moveSceneImageCandidateViewerIndex(previous.candidates, previous.index, 1),
              }
            : previous,
        );
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imageViewer]);

  if (!open) return null;

  const selectedCount = selectedIds.size;
  const creditCost = selectedCount * 5;
  const allSelected = scenes.length > 0 && selectedCount === scenes.length;
  const missingVideoPromptSceneIds = scenes
    .filter((scene) => !String(videoPromptDrafts[scene.id] ?? scene.motionPrompt ?? "").trim())
    .map((scene) => scene.id);
  const mentionOptions = mentionMenu
    ? activeCast.filter((member) => member.name.toLowerCase().startsWith(mentionMenu.query.toLowerCase()))
    : [];

  function promptWithInitialCastMentions(prompt: string, castIds?: string[]) {
    const parsedIds = parseCastMentionIds(prompt, activeCast);
    if (parsedIds.length > 0 || !castIds?.length) return prompt;
    return activeCast
      .filter((member) => castIds.includes(member.id))
      .reduce((text, member) => insertCastMention(`${text.trim()} `, text.trim().length + 1, member).text.trim(), prompt);
  }

  function toggleScene(sceneId: string, checked: boolean) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(sceneId);
      else next.delete(sceneId);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(scenes.map((scene) => scene.id)) : new Set());
  }

  function textareaRefKey(sceneId: string, field: PromptField) {
    return `${sceneId}:${field}`;
  }

  function combinedMentionIds(sceneId: string, nextImagePrompt?: string, nextVideoPrompt?: string) {
    const imagePrompt = nextImagePrompt ?? imagePromptDrafts[sceneId] ?? "";
    const videoPrompt = nextVideoPrompt ?? videoPromptDrafts[sceneId] ?? "";
    return parseCastMentionIdsFromPrompts([imagePrompt, videoPrompt], activeCast);
  }

  function updateMentionMenuFromCursor(sceneId: string, field: PromptField, prompt: string, cursor?: number) {
    const safeCursor = Math.max(0, Math.min(prompt.length, Math.floor(Number(cursor ?? prompt.length) || 0)));
    const beforeCursor = prompt.slice(0, safeCursor);
    const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
    if (!match || activeCast.length === 0 || generationLocked) {
      setMentionMenu((previous) => (previous?.sceneId === sceneId && previous.field === field ? null : previous));
      return;
    }
    setMentionMenu({ sceneId, field, query: match[1] || "", cursor: safeCursor });
  }

  function updateImagePrompt(sceneId: string, prompt: string, cursor?: number) {
    setImagePromptDrafts((previous) => ({ ...previous, [sceneId]: prompt }));
    setSceneCastIdDrafts((previous) => ({ ...previous, [sceneId]: combinedMentionIds(sceneId, prompt) }));
    updateMentionMenuFromCursor(sceneId, "image", prompt, cursor);
  }

  function updateVideoPrompt(sceneId: string, prompt: string, cursor?: number) {
    setVideoPromptDrafts((previous) => ({ ...previous, [sceneId]: prompt }));
    setSceneCastIdDrafts((previous) => ({ ...previous, [sceneId]: combinedMentionIds(sceneId, undefined, prompt) }));
    updateMentionMenuFromCursor(sceneId, "video", prompt, cursor);
  }

  async function submitBatchGeneration() {
    if (!project || submitting || selectedCount === 0) return;
    setSubmitting(true);
    try {
      const selectedSceneIds = scenes.filter((scene) => selectedIds.has(scene.id)).map((scene) => scene.id);
      for (const scene of scenes.filter((item) => selectedIds.has(item.id))) {
        const prompt = imagePromptDrafts[scene.id] ?? scene.prompt ?? "";
        const motionPrompt = videoPromptDrafts[scene.id] ?? scene.motionPrompt ?? "";
        const castIds = sceneCastIdDrafts[scene.id] || [];
        const promptChanged = prompt.trim() !== String(scene.prompt || "").trim();
        const motionChanged = motionPrompt.trim() !== String(scene.motionPrompt || "").trim();
        const castChanged = JSON.stringify(castIds) !== JSON.stringify(scene.castIds || []);
        if (!promptChanged && !motionChanged && !castChanged) continue;
        const saved = await updateScene(
          scene.id,
          {
            prompt,
            motionPrompt,
            castIds,
          },
          { successMessage: null, errorMessage: "Save scene prompt failed" },
        );
        if (!saved) return;
      }
      const queued = await queueSceneImages(selectedSceneIds);
      if (queued.length > 0) onClose();
    } finally {
      setSubmitting(false);
    }
  }

  async function submitMissingVideoPrompts() {
    if (!project || submitting || missingVideoPromptSceneIds.length === 0) return;
    setSubmitting(true);
    try {
      const updated = await generateSceneVideoPrompts(missingVideoPromptSceneIds);
      if (updated.length > 0) {
        setVideoPromptDrafts((previous) => ({
          ...previous,
          ...Object.fromEntries(updated.map((scene) => [scene.id, scene.motionPrompt || ""])),
        }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function selectMention(sceneId: string, field: PromptField, member: LyricCastMember) {
    const prompt = field === "video" ? videoPromptDrafts[sceneId] ?? "" : imagePromptDrafts[sceneId] ?? "";
    const refKey = textareaRefKey(sceneId, field);
    const cursor = mentionMenu?.sceneId === sceneId && mentionMenu.field === field ? mentionMenu.cursor : textareaRefs.current[refKey]?.selectionStart ?? prompt.length;
    const inserted = insertCastMention(prompt, cursor, member);
    if (field === "video") updateVideoPrompt(sceneId, inserted.text, inserted.cursor);
    else updateImagePrompt(sceneId, inserted.text, inserted.cursor);
    requestAnimationFrame(() => {
      const textarea = textareaRefs.current[refKey];
      textarea?.focus();
      textarea?.setSelectionRange(inserted.cursor, inserted.cursor);
    });
  }

  function toggleCastMention(sceneId: string, member: LyricCastMember) {
    const prompt = imagePromptDrafts[sceneId] ?? "";
    const videoPrompt = videoPromptDrafts[sceneId] ?? "";
    const currentIds = sceneCastIdDrafts[sceneId] || [];
    const nextImagePrompt = currentIds.includes(member.id)
      ? removeCastMention(prompt, member)
      : insertCastMention(`${prompt.trim()} `, prompt.trim().length + 1, member).text.trim();
    const nextVideoPrompt = currentIds.includes(member.id) ? removeCastMention(videoPrompt, member) : videoPrompt;
    setImagePromptDrafts((previous) => ({ ...previous, [sceneId]: nextImagePrompt }));
    setVideoPromptDrafts((previous) => ({ ...previous, [sceneId]: nextVideoPrompt }));
    setSceneCastIdDrafts((previous) => ({ ...previous, [sceneId]: parseCastMentionIdsFromPrompts([nextImagePrompt, nextVideoPrompt], activeCast) }));
    setMentionMenu(null);
  }

  function clearCastMentions(sceneId: string) {
    const prompt = imagePromptDrafts[sceneId] ?? "";
    const videoPrompt = videoPromptDrafts[sceneId] ?? "";
    const nextPrompt = activeCast.reduce((text, member) => removeCastMention(text, member), prompt);
    const nextVideoPrompt = activeCast.reduce((text, member) => removeCastMention(text, member), videoPrompt);
    setImagePromptDrafts((previous) => ({ ...previous, [sceneId]: nextPrompt }));
    setVideoPromptDrafts((previous) => ({ ...previous, [sceneId]: nextVideoPrompt }));
    setSceneCastIdDrafts((previous) => ({ ...previous, [sceneId]: [] }));
    setMentionMenu(null);
  }

  async function saveSceneDraftIfNeeded(scene: LyricScene) {
    const prompt = imagePromptDrafts[scene.id] ?? scene.prompt ?? "";
    const motionPrompt = videoPromptDrafts[scene.id] ?? scene.motionPrompt ?? "";
    const castIds = sceneCastIdDrafts[scene.id] || [];
    const promptChanged = prompt.trim() !== String(scene.prompt || "").trim();
    const motionChanged = motionPrompt.trim() !== String(scene.motionPrompt || "").trim();
    const castChanged = JSON.stringify(castIds) !== JSON.stringify(scene.castIds || []);
    if (!promptChanged && !motionChanged && !castChanged) return true;
    const saved = await updateScene(
      scene.id,
      {
        prompt,
        motionPrompt,
        castIds,
      },
      { successMessage: null, errorMessage: "Save scene prompt failed" },
    );
    return Boolean(saved);
  }

  async function retryImageCandidate(scene: LyricScene) {
    if (submitting || generationLocked) return;
    setSubmitting(true);
    try {
      const saved = await saveSceneDraftIfNeeded(scene);
      if (!saved) return;
      await retrySceneImage(scene.id);
      setCandidateOffsets((previous) => ({ ...previous, [scene.id]: 0 }));
    } finally {
      setSubmitting(false);
    }
  }

  function moveCandidateWindow(sceneId: string, candidates: LyricSceneImageCandidate[], direction: -1 | 1) {
    const maxOffset = Math.max(0, sortSceneImageCandidates(candidates).length - SCENE_IMAGE_CANDIDATE_WINDOW_SIZE);
    setCandidateOffsets((previous) => {
      const current = previous[sceneId] || 0;
      const next = Math.max(0, Math.min(maxOffset, current + direction));
      return { ...previous, [sceneId]: next };
    });
  }

  function openSceneImageViewer(sceneLabel: string, candidates: LyricSceneImageCandidate[], imageUrl?: string | null) {
    if (candidates.length === 0) return;
    setImageViewer({
      sceneLabel,
      candidates,
      index: getSceneImageCandidateViewerIndex(candidates, imageUrl),
    });
  }

  function moveImageViewer(direction: -1 | 1) {
    setImageViewer((previous) =>
      previous
        ? {
            ...previous,
            index: moveSceneImageCandidateViewerIndex(previous.candidates, previous.index, direction),
          }
        : previous,
    );
  }

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-[var(--editor-panel)] text-[var(--editor-text)]">
      <header className="flex h-[84px] shrink-0 items-start justify-between border-b border-[var(--editor-line)] px-[22px] py-[18px]">
        <div>
          <h2 className="text-[24px] font-[800] leading-[28px] text-[var(--editor-text)]">Batch Generation</h2>
          <p className="mt-[7px] text-[14px] font-[600] text-[var(--editor-muted)]">Video: {project?.title || "Lyric video"}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close batch generation"
          className="flex h-[36px] w-[36px] items-center justify-center rounded-[6px] text-[var(--editor-muted)] hover:bg-[var(--editor-bg)]"
        >
          <X className="h-[20px] w-[20px]" />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-[22px]">
        <div className="mx-auto w-full max-w-[1360px]">
          <label className="flex h-[56px] items-center gap-[12px]">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) => toggleAll(event.target.checked)}
              disabled={generationLocked}
              title={generationLocked ? generationLockReason : undefined}
              className="h-[20px] w-[20px] rounded-[4px] border-[var(--editor-line)] text-[var(--editor-accent)]"
              aria-label="Select all scenes"
            />
            <ChevronDown className="h-[16px] w-[16px] text-[var(--editor-muted)]" />
          </label>

          <div>
            {scenes.map((scene, index) => {
              const checked = selectedIds.has(scene.id);
              const durationMs = Math.max(0, (scene.endMs || scene.startMs) - scene.startMs);
              const title = scene.text?.trim() || "Instrumental";
              const imageCandidateDisplayList = getSceneImageCandidateDisplayList(scene);
              return (
                <section
                  key={scene.id}
                  data-batch-scene-row
                  className="border-b border-[var(--editor-line)] py-[18px]"
                >
                <div className="flex gap-[14px]">
                  <div className="shrink-0 pt-[2px]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => toggleScene(scene.id, event.target.checked)}
                      disabled={generationLocked}
                      title={generationLocked ? generationLockReason : undefined}
                      className="h-[20px] w-[20px] rounded-[4px] border-[var(--editor-line)] text-[var(--editor-accent)]"
                      aria-label={`Select scene ${index + 1}`}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-[12px] flex flex-wrap items-center gap-x-[10px] gap-y-[4px]">
                      <span className="text-[11px] font-[800] uppercase tracking-[0.04em] text-[var(--editor-muted)]">Scene {index + 1}</span>
                      <span className="font-mono text-[11px] font-[700] text-[var(--editor-muted)]">
                        {formatMs(scene.startMs)} - {formatMs(scene.endMs)}
                      </span>
                      <span className="font-mono text-[11px] font-[700] text-[var(--editor-subtle)]">{formatDurationMs(durationMs)}</span>
                      <span className="min-w-0 truncate text-[14px] font-[700] text-[var(--editor-text)]">{title}</span>
                      <span className="ml-auto inline-flex shrink-0 items-center gap-[4px] rounded-[5px] bg-[var(--editor-panel-strong)] px-[8px] py-[3px] text-[10px] font-[800] text-[var(--editor-text)]">
                        <Coins className="h-[11px] w-[11px]" />5 credits
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-[12px] lg:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] lg:items-stretch">
                      <div className="flex min-w-0 flex-col rounded-[8px] border border-[var(--editor-line)] bg-[var(--editor-panel-soft)] p-[12px] shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                        <div className="mb-[10px] flex items-center justify-between gap-[10px]">
                          <div className="inline-flex min-w-0 items-center gap-[7px] text-[13px] font-[800] text-[var(--editor-text)]">
                            <ImageIcon className="h-[15px] w-[15px] shrink-0" />
                            <span className="truncate">Create Still Image</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => retryImageCandidate(scene)}
                            disabled={submitting || generationLocked}
                            title={generationLocked ? generationLockReason : "Generate a new image candidate without replacing the selected image"}
                            className="inline-flex h-[28px] shrink-0 items-center gap-[6px] rounded-[5px] bg-[var(--editor-panel-strong)] px-[9px] text-[11px] font-[800] text-[var(--editor-muted)] hover:text-[var(--editor-text)] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <RefreshCcw className={cn("h-[12px] w-[12px]", submitting && "animate-spin")} />
                            <span>Retry Image</span>
                            <span className="inline-flex items-center gap-[3px]">
                              <Coins className="h-[11px] w-[11px]" />5
                            </span>
                          </button>
                        </div>
                        {activeCast.length > 0 ? (
                          <div className="mb-[10px] flex flex-wrap items-center gap-[6px]">
                            <Users className="h-[12px] w-[12px] text-[var(--editor-muted)]" />
                            <SceneCastButton label="None" active={(sceneCastIdDrafts[scene.id] || []).length === 0} disabled={generationLocked} title={generationLocked ? generationLockReason : undefined} onClick={() => clearCastMentions(scene.id)} />
                            {activeCast.map((member, castIndex) => (
                              <SceneCastButton
                                key={member.id}
                                label={sceneCastRoleLabel(member, castIndex)}
                                active={(sceneCastIdDrafts[scene.id] || []).includes(member.id)}
                                disabled={generationLocked}
                                title={generationLocked ? generationLockReason : undefined}
                                onClick={() => toggleCastMention(scene.id, member)}
                              />
                            ))}
                          </div>
                        ) : null}
                        <div className="grid flex-1 grid-cols-1 gap-[10px] sm:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] sm:items-stretch">
                          <div className="relative min-w-0">
                            <PromptMentionTextarea
                              textareaRef={(node) => {
                                textareaRefs.current[textareaRefKey(scene.id, "image")] = node;
                              }}
                              value={imagePromptDrafts[scene.id] ?? scene.prompt ?? ""}
                              cast={activeCast}
                              onChange={(prompt, cursor) => updateImagePrompt(scene.id, prompt, cursor)}
                              onCursorChange={(prompt, cursor) => updateMentionMenuFromCursor(scene.id, "image", prompt, cursor)}
                              onEscape={() => setMentionMenu(null)}
                              disabled={generationLocked}
                              title={generationLocked ? generationLockReason : undefined}
                              placeholder="Describe the still image for this scene…"
                              ariaLabel={`Scene ${index + 1} image prompt`}
                            />
                            {mentionMenu?.sceneId === scene.id && mentionMenu.field === "image" && mentionOptions.length > 0 ? (
                              <div className="absolute left-[8px] top-[36px] z-[3] w-[220px] overflow-hidden rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] shadow-[0_12px_30px_rgba(15,23,42,0.18)]">
                                {mentionOptions.map((member, optionIndex) => (
                                  <button
                                    key={member.id}
                                    type="button"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      selectMention(scene.id, "image", member);
                                    }}
                                    className="flex w-full items-center justify-between gap-[8px] px-[10px] py-[8px] text-left text-[12px] font-[800] text-[var(--editor-text)] hover:bg-[var(--editor-bg)]"
                                  >
                                    <span className="min-w-0 truncate">@{member.name}</span>
                                    <span className="shrink-0 text-[10px] font-[800] text-[var(--editor-muted)]">{sceneCastRoleLabel(member, optionIndex)}</span>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <div className="relative min-h-[174px] w-full overflow-hidden rounded-[6px] bg-[var(--editor-panel-strong)]">
                              {scene.imageUrl ? (
                                <>
                                  <img src={scene.imageUrl} alt="" className="h-full min-h-[174px] w-full object-cover" />
                                  <button
                                    type="button"
                                    onClick={() => openSceneImageViewer(`Scene ${index + 1}`, imageCandidateDisplayList, scene.imageUrl)}
                                    aria-label={`Open scene ${index + 1} image viewer`}
                                    title="Open image viewer"
                                    className="absolute bottom-[8px] right-[8px] flex h-[30px] w-[30px] items-center justify-center rounded-[999px] border border-white/10 bg-black/70 text-white shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition hover:bg-black/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--editor-accent)]"
                                  >
                                    <Expand className="h-[15px] w-[15px]" />
                                  </button>
                                </>
                              ) : (
                                <div className="flex min-h-[174px] w-full items-center justify-center text-[12px] font-[800] uppercase text-[var(--editor-subtle)]">
                                  {sceneStatusLabel(scene)}
                                </div>
                              )}
                            </div>
                            <SceneImageCandidateStrip
                              candidates={imageCandidateDisplayList}
                              offset={candidateOffsets[scene.id] || 0}
                              selectedImageUrl={scene.imageUrl}
                              disabled={generationLocked}
                              onMove={(direction) => moveCandidateWindow(scene.id, imageCandidateDisplayList, direction)}
                              onSelect={(candidate) => selectSceneImageCandidate(scene.id, candidate)}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="hidden items-center justify-center lg:flex">
                        <div className="flex h-[28px] w-[28px] items-center justify-center rounded-[999px] border border-[var(--editor-line)] bg-[var(--editor-panel)] text-[var(--editor-muted)]">
                          <ChevronRight className="h-[15px] w-[15px]" />
                        </div>
                      </div>

                      <div className="flex min-w-0 flex-col rounded-[8px] border border-[var(--editor-line)] bg-[var(--editor-panel-soft)] p-[12px] shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                        <div className="mb-[10px] flex items-center justify-between gap-[10px]">
                          <div className="inline-flex min-w-0 items-center gap-[7px] text-[13px] font-[800] text-[var(--editor-text)]">
                            <Clapperboard className="h-[15px] w-[15px] shrink-0" />
                            <span className="truncate">Animate the Image</span>
                          </div>
                          <button
                            type="button"
                            className="inline-flex h-[28px] w-[142px] shrink-0 items-center justify-between rounded-[5px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[9px] text-[11px] font-[800] text-[var(--editor-text)]"
                          >
                            Video Model
                            <ChevronDown className="h-[13px] w-[13px] text-[var(--editor-muted)]" />
                          </button>
                        </div>
                        <div className="relative min-w-0 flex-1">
                          <PromptMentionTextarea
                            textareaRef={(node) => {
                              textareaRefs.current[textareaRefKey(scene.id, "video")] = node;
                            }}
                            value={videoPromptDrafts[scene.id] ?? scene.motionPrompt ?? ""}
                            cast={activeCast}
                            onChange={(prompt, cursor) => updateVideoPrompt(scene.id, prompt, cursor)}
                            onCursorChange={(prompt, cursor) => updateMentionMenuFromCursor(scene.id, "video", prompt, cursor)}
                            onEscape={() => setMentionMenu(null)}
                            disabled={generationLocked}
                            title={generationLocked ? generationLockReason : undefined}
                            placeholder="Describe how this image should move - e.g. slow dolly forward as the breeze lifts the curtain…"
                            ariaLabel={`Scene ${index + 1} video prompt`}
                          />
                          {mentionMenu?.sceneId === scene.id && mentionMenu.field === "video" && mentionOptions.length > 0 ? (
                            <div className="absolute left-[8px] top-[36px] z-[3] w-[220px] overflow-hidden rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] shadow-[0_12px_30px_rgba(15,23,42,0.18)]">
                              {mentionOptions.map((member, optionIndex) => (
                                <button
                                  key={member.id}
                                  type="button"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    selectMention(scene.id, "video", member);
                                  }}
                                  className="flex w-full items-center justify-between gap-[8px] px-[10px] py-[8px] text-left text-[12px] font-[800] text-[var(--editor-text)] hover:bg-[var(--editor-bg)]"
                                >
                                  <span className="min-w-0 truncate">@{member.name}</span>
                                  <span className="shrink-0 text-[10px] font-[800] text-[var(--editor-muted)]">{sceneCastRoleLabel(member, optionIndex)}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
              );
            })}
          </div>
        </div>
      </main>

      {imageViewer ? (
        <SceneImageViewerOverlay
          viewer={imageViewer}
          onClose={() => setImageViewer(null)}
          onMove={moveImageViewer}
        />
      ) : null}

      <footer className="flex min-h-[92px] shrink-0 flex-col items-stretch justify-center gap-[10px] border-t border-[var(--editor-line)] bg-[var(--editor-panel)] px-[16px] py-[12px] sm:flex-row sm:items-center sm:justify-end sm:gap-[18px] sm:px-[22px]">
        <button type="button" onClick={onClose} className="h-[42px] px-[10px] text-[15px] font-[800] text-[var(--editor-muted)]">
          Cancel
        </button>
        <button
          type="button"
          onClick={submitMissingVideoPrompts}
          disabled={!project || missingVideoPromptSceneIds.length === 0 || submitting || generationLocked}
          title={generationLocked ? generationLockReason : undefined}
          className="inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel-soft)] px-[14px] text-[13px] font-[800] text-[var(--editor-text)] hover:bg-[var(--editor-panel-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <Wand2 className="h-[15px] w-[15px]" />}
          Generate Missing Video Prompts ({missingVideoPromptSceneIds.length})
        </button>
        <div className="flex flex-col items-stretch gap-[6px] sm:items-end">
          <button
            type="button"
            onClick={submitBatchGeneration}
            disabled={!project || selectedCount === 0 || submitting || generationLocked}
            title={generationLocked ? generationLockReason : undefined}
            className="inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[6px] bg-[var(--editor-accent)] px-[16px] text-[15px] font-[800] text-[var(--editor-accent-ink)] hover:bg-[var(--editor-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-[16px] w-[16px] animate-spin" /> : <ImageIcon className="h-[16px] w-[16px]" />}
            Generate {selectedCount} Scene Images ({creditCost} credits)
          </button>
          <span className="text-right text-[10px] font-[600] text-[var(--editor-muted)]">Estimated time to generate: ~20 minutes</span>
        </div>
      </footer>
    </div>
  );
}

function SceneImageViewerOverlay({
  onClose,
  onMove,
  viewer,
}: {
  onClose: () => void;
  onMove: (direction: -1 | 1) => void;
  viewer: SceneImageViewerState;
}) {
  const current = viewer.candidates[viewer.index] || viewer.candidates[0];
  if (!current) return null;
  const canMove = viewer.candidates.length > 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${viewer.sceneLabel} enlarged image`}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/82 px-[18px] py-[20px] backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div className="relative flex h-full max-h-[calc(100vh-40px)] w-full max-w-[1160px] items-center justify-center" onMouseDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close image viewer"
          title="Close"
          className="absolute right-0 top-0 z-[2] flex h-[36px] w-[36px] items-center justify-center rounded-[999px] border border-white/12 bg-black/70 text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)] transition hover:bg-black/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--editor-accent)]"
        >
          <X className="h-[17px] w-[17px]" />
        </button>

        {canMove ? (
          <button
            type="button"
            onClick={() => onMove(-1)}
            aria-label="Show previous image"
            title="Previous image"
            className="absolute left-0 top-1/2 z-[2] flex h-[42px] w-[42px] -translate-y-1/2 items-center justify-center rounded-[999px] border border-white/12 bg-black/65 text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)] transition hover:bg-black/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--editor-accent)]"
          >
            <ChevronLeft className="h-[22px] w-[22px]" />
          </button>
        ) : null}

        <div className="flex h-full w-full items-center justify-center px-[54px] py-[44px]">
          <img
            src={current.imageUrl}
            alt=""
            className="max-h-full max-w-full rounded-[8px] border border-white/10 object-contain shadow-[0_24px_70px_rgba(0,0,0,0.45)]"
          />
        </div>

        {canMove ? (
          <button
            type="button"
            onClick={() => onMove(1)}
            aria-label="Show next image"
            title="Next image"
            className="absolute right-0 top-1/2 z-[2] flex h-[42px] w-[42px] -translate-y-1/2 items-center justify-center rounded-[999px] border border-white/12 bg-black/65 text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)] transition hover:bg-black/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--editor-accent)]"
          >
            <ChevronRight className="h-[22px] w-[22px]" />
          </button>
        ) : null}

        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-[999px] border border-white/10 bg-black/65 px-[10px] py-[5px] text-[11px] font-[800] text-white/85">
          {viewer.index + 1} / {viewer.candidates.length}
        </div>
      </div>
    </div>
  );
}

function sceneStatusLabel(scene: { prompt?: string | null; status?: string | null }) {
  if (scene.status === "lyrics_draft" || !String(scene.prompt || "").trim()) return "Timing draft";
  return scene.status || "draft";
}

function SceneImageCandidateStrip({
  candidates,
  disabled,
  offset,
  onMove,
  onSelect,
  selectedImageUrl,
}: {
  candidates: LyricSceneImageCandidate[];
  disabled?: boolean;
  offset: number;
  onMove: (direction: -1 | 1) => void;
  onSelect: (candidate: LyricSceneImageCandidate) => void;
  selectedImageUrl?: string | null;
}) {
  const sorted = sortSceneImageCandidates(candidates);
  const visible = getVisibleSceneImageCandidates(sorted, offset);
  if (sorted.length === 0) return null;

  const canMoveNewer = offset > 0;
  const canMoveOlder = offset + SCENE_IMAGE_CANDIDATE_WINDOW_SIZE < sorted.length;

  return (
    <div className="mt-[8px] flex min-h-[42px] items-center gap-[6px]">
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={!canMoveNewer}
        aria-label="Show newer image candidates"
        className="flex h-[30px] w-[24px] shrink-0 items-center justify-center rounded-[5px] border border-[var(--editor-line)] bg-[var(--editor-panel)] text-[var(--editor-muted)] hover:text-[var(--editor-text)] disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ChevronLeft className="h-[13px] w-[13px]" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-[6px] overflow-hidden">
        {visible.map((candidate) => {
          const selected = Boolean(selectedImageUrl && candidate.imageUrl === selectedImageUrl);
          return (
            <button
              key={candidate.id}
              type="button"
              onClick={() => onSelect(candidate)}
              disabled={disabled || selected}
              title={selected ? "Selected image" : "Use this image for animation"}
              className={cn(
                "relative h-[38px] w-[54px] shrink-0 overflow-hidden rounded-[5px] border bg-[var(--editor-panel-strong)] transition",
                selected ? "border-[var(--editor-accent)] ring-1 ring-[var(--editor-accent)]" : "border-[var(--editor-line)] hover:border-[var(--editor-muted)]",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <img src={candidate.imageUrl} alt="" className="h-full w-full object-cover" />
              {selected ? (
                <span className="absolute bottom-[3px] right-[3px] flex h-[15px] w-[15px] items-center justify-center rounded-[999px] bg-[var(--editor-accent)] text-[var(--editor-accent-ink)]">
                  <Check className="h-[10px] w-[10px]" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={!canMoveOlder}
        aria-label="Show older image candidates"
        className="flex h-[30px] w-[24px] shrink-0 items-center justify-center rounded-[5px] border border-[var(--editor-line)] bg-[var(--editor-panel)] text-[var(--editor-muted)] hover:text-[var(--editor-text)] disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ChevronRight className="h-[13px] w-[13px]" />
      </button>
    </div>
  );
}

function PromptMentionTextarea({
  ariaLabel,
  cast,
  disabled,
  onChange,
  onCursorChange,
  onEscape,
  placeholder,
  textareaRef,
  title,
  value,
}: {
  ariaLabel: string;
  cast: LyricCastMember[];
  disabled?: boolean;
  onChange: (prompt: string, cursor?: number) => void;
  onCursorChange: (prompt: string, cursor?: number) => void;
  onEscape: () => void;
  placeholder: string;
  textareaRef: RefCallback<HTMLTextAreaElement>;
  title?: string;
  value: string;
}) {
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const mentionParts = useMemo(() => splitPromptMentions(value, cast), [cast, value]);

  function syncHighlightScroll(event: UIEvent<HTMLTextAreaElement>) {
    if (!highlightRef.current) return;
    highlightRef.current.scrollTop = event.currentTarget.scrollTop;
    highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
  }

  return (
    <div
      className={cn(
        "relative h-full min-h-[210px] w-full overflow-hidden rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] focus-within:border-[var(--editor-accent)]",
        disabled && "bg-[var(--editor-panel-strong)]",
      )}
    >
      <div
        ref={highlightRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-[10px] py-[9px] text-[13px] font-[600] leading-[20px] text-[var(--editor-text)]"
      >
        {mentionParts.map((part, index) => (
          <span key={`${index}-${part.text}`} className={part.mention ? "text-sky-300" : undefined}>
            {part.text}
          </span>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value, event.target.selectionStart)}
        onClick={(event) => onCursorChange(event.currentTarget.value, event.currentTarget.selectionStart)}
        onKeyUp={(event) => onCursorChange(event.currentTarget.value, event.currentTarget.selectionStart)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onEscape();
        }}
        onScroll={syncHighlightScroll}
        disabled={disabled}
        title={title}
        placeholder={placeholder}
        aria-label={ariaLabel}
        spellCheck={false}
        className="relative z-[1] h-full min-h-[210px] w-full resize-none rounded-[6px] border-0 bg-transparent px-[10px] py-[9px] text-[13px] font-[600] leading-[20px] text-transparent caret-[var(--editor-text)] outline-none placeholder:text-[var(--editor-subtle)] selection:bg-[var(--editor-accent-soft)] selection:text-[var(--editor-text)] disabled:cursor-not-allowed disabled:caret-[var(--editor-muted)]"
      />
    </div>
  );
}

function SceneCastButton({
  active,
  disabled,
  label,
  onClick,
  title,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "h-[24px] rounded-[999px] border px-[8px] text-[11px] font-[850] transition disabled:cursor-not-allowed disabled:opacity-60",
        active
          ? "border-[var(--editor-accent)] bg-[var(--editor-accent-soft)] text-[var(--editor-text)]"
          : "border-[var(--editor-line)] bg-[var(--editor-panel)] text-[var(--editor-muted)] hover:text-[var(--editor-text)]",
      )}
    >
      {label}
    </button>
  );
}
