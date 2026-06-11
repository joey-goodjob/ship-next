"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Clapperboard, Coins, ImageIcon, Loader2, MoreVertical, Play, RefreshCcw, Users, Wand2, X } from "lucide-react";
import { insertCastMention, parseCastMentionIds, parseCastMentionIdsFromPrompts, removeCastMention } from "@/lib/lyric-video-cast-mentions";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { PanelEmpty } from "./panel-empty";
import { usePlayback } from "./playback-context";
import { deriveGenerationProgress, formatDurationMs, formatMs, msToSeconds } from "./utils";
import type { LyricCastMember } from "./types";

type PromptField = "image" | "video";

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

export function ScenesPanel() {
  const { cast, generationLocked, generationLockReason, generationRun, generationSteps, project, retryFailedImageBatches, runtimeState, scenes, updateSceneCastIds } = useEditor();
  const { currentScene, setCurrentTime } = usePlayback();
  const [batchGenerationOpen, setBatchGenerationOpen] = useState(false);
  const progress = deriveGenerationProgress({ project, generationRun, generationSteps, runtimeState, scenes });
  const promptReadyCount = scenes.filter((scene) => String(scene.prompt || "").trim()).length;
  const activeCast = activeSceneCast(cast);

  return (
    <div className="scenes-panel flex flex-col">
      <div className="mb-[16px] flex flex-col gap-[10px] border-b border-[var(--editor-line)] pb-[16px]">
        <div className="rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel-soft)] px-[12px] py-[10px]">
          <div className="flex flex-wrap items-center justify-between gap-[8px]">
            <div className="min-w-0">
              <p className="text-[13px] font-[900] text-[var(--editor-text)]">{progress.primary}</p>
              <p className="mt-[3px] text-[12px] font-[650] text-[var(--editor-muted)]">
                Prompt1 {progress.songAnalysisStatus} · Prompt2 {progress.promptStatus} · {progress.imageText}
              </p>
            </div>
            {progress.retryable ? (
              <button
                type="button"
                onClick={retryFailedImageBatches}
                disabled={generationLocked}
                title={generationLocked ? generationLockReason : undefined}
                className="inline-flex h-[32px] shrink-0 items-center gap-[7px] rounded-[6px] bg-[var(--editor-accent)] px-[10px] text-[12px] font-[900] text-[var(--editor-accent-ink)] hover:bg-[var(--editor-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCcw className="h-[13px] w-[13px]" />
                Retry {progress.failedBatches} failed batch{progress.failedBatches === 1 ? "" : "es"}
              </button>
            ) : null}
          </div>
          {progress.error ? <p className="mt-[7px] line-clamp-2 text-[12px] font-[700] text-[var(--editor-danger)]">{progress.error}</p> : null}
        </div>
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
  const { cast, generationLocked, generationLockReason, project, queueSceneImages, scenes, updateScene } = useEditor();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [imagePromptDrafts, setImagePromptDrafts] = useState<Record<string, string>>({});
  const [videoPromptDrafts, setVideoPromptDrafts] = useState<Record<string, string>>({});
  const [sceneCastIdDrafts, setSceneCastIdDrafts] = useState<Record<string, string[]>>({});
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
    setSubmitting(false);
  }, [activeCast, open, scenes]);

  if (!open) return null;

  const selectedCount = selectedIds.size;
  const creditCost = selectedCount * 5;
  const allSelected = scenes.length > 0 && selectedCount === scenes.length;
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
              return (
	                <section
	                  key={scene.id}
	                  data-batch-scene-row
	                  className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-[14px] gap-y-[12px] border-b border-[var(--editor-line)] py-[16px] md:grid-cols-[32px_minmax(140px,180px)_minmax(0,1fr)_minmax(0,1fr)] md:gap-[16px] xl:grid-cols-[44px_220px_minmax(390px,1fr)_minmax(390px,1fr)]"
	                >
	                  <div className="pt-[2px] md:pt-[92px]">
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

	                  <div className="min-w-0 pt-0 md:pt-[74px]">
                    <div className="mb-[8px] flex flex-wrap items-center gap-x-[8px] gap-y-[2px] text-[11px] font-[800] text-[var(--editor-muted)]">
                      <span>Scene {index + 1}</span>
                      <span className="font-mono">
                        {formatMs(scene.startMs)} - {formatMs(scene.endMs)}
                      </span>
                      <span className="font-mono">{formatDurationMs(durationMs)}</span>
                    </div>
	                    <p className="max-w-[230px] text-[16px] font-[700] leading-[24px] text-[var(--editor-text)]">{title}</p>
	                    <span className="mt-[14px] inline-flex rounded-[5px] bg-[var(--editor-panel-strong)] px-[6px] py-[3px] text-[10px] font-[800] text-[var(--editor-text)]">
	                      5 credits
	                    </span>
	                  </div>

		                  <div className="col-start-2 min-w-0 rounded-[7px] border border-[var(--editor-line)] bg-[var(--editor-panel-soft)] p-[10px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:col-start-3 md:row-start-1">
		                    <div className="mb-[8px] flex items-center justify-between gap-[10px]">
	                      <div className="inline-flex min-w-0 items-center gap-[7px] text-[13px] font-[800] text-[var(--editor-text)]">
	                        <ImageIcon className="h-[15px] w-[15px] shrink-0" />
	                        <span className="truncate xl:hidden">Still Image</span>
	                        <span className="hidden truncate xl:inline">Create Still Image</span>
	                      </div>
	                      <button
	                        type="button"
	                        disabled
	                        className="inline-flex h-[28px] shrink-0 items-center gap-[6px] rounded-[5px] bg-[var(--editor-panel-strong)] px-[9px] text-[11px] font-[800] text-[var(--editor-muted)] disabled:cursor-not-allowed"
	                      >
	                        <RefreshCcw className="h-[12px] w-[12px]" />
	                        <span className="xl:hidden">Retry</span>
	                        <span className="hidden xl:inline">Retry Image</span>
	                        <span className="inline-flex items-center gap-[3px]">
	                          <Coins className="h-[11px] w-[11px]" />5
	                        </span>
		                      </button>
		                    </div>
		                    {activeCast.length > 0 ? (
		                      <div className="mb-[8px] flex flex-wrap items-center gap-[6px]">
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
		                    <div className="grid gap-[10px] 2xl:grid-cols-[minmax(0,1fr)_minmax(170px,0.86fr)]">
		                      <div className="relative min-w-0">
		                        <textarea
		                          ref={(node) => {
		                            textareaRefs.current[textareaRefKey(scene.id, "image")] = node;
		                          }}
		                          value={imagePromptDrafts[scene.id] ?? scene.prompt ?? ""}
		                          onChange={(event) => updateImagePrompt(scene.id, event.target.value, event.target.selectionStart)}
		                          onClick={(event) => updateMentionMenuFromCursor(scene.id, "image", event.currentTarget.value, event.currentTarget.selectionStart)}
		                          onKeyUp={(event) => updateMentionMenuFromCursor(scene.id, "image", event.currentTarget.value, event.currentTarget.selectionStart)}
		                          onKeyDown={(event) => {
		                            if (event.key === "Escape") setMentionMenu(null);
		                          }}
		                          disabled={generationLocked}
		                          title={generationLocked ? generationLockReason : undefined}
		                          aria-label={`Scene ${index + 1} image prompt`}
		                          className="min-h-[162px] w-full resize-y rounded-[5px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[10px] py-[9px] text-[13px] font-[600] leading-[20px] text-[var(--editor-text)] outline-none focus:border-[var(--editor-accent)] disabled:cursor-not-allowed disabled:bg-[var(--editor-panel-strong)] disabled:text-[var(--editor-muted)]"
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
		                      <div className="aspect-video w-full overflow-hidden rounded-[5px] bg-[var(--editor-panel-strong)]">
	                        {scene.imageUrl ? (
	                          <img src={scene.imageUrl} alt="" className="h-full w-full object-cover" />
	                        ) : (
	                          <div className="flex h-full w-full items-center justify-center text-[12px] font-[800] uppercase text-[var(--editor-subtle)]">
	                            {sceneStatusLabel(scene)}
	                          </div>
	                        )}
	                      </div>
	                    </div>
	                  </div>

	                  <div className="col-start-2 min-w-0 rounded-[7px] border border-[var(--editor-line)] bg-[var(--editor-panel-soft)] p-[10px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:col-start-4 md:row-start-1">
	                    <div className="mb-[8px] flex items-center justify-between gap-[10px]">
	                      <div className="inline-flex min-w-0 items-center gap-[7px] text-[13px] font-[800] text-[var(--editor-text)]">
	                        <Clapperboard className="h-[15px] w-[15px] shrink-0" />
	                        <span className="truncate xl:hidden">Animate</span>
	                        <span className="hidden truncate xl:inline">Animate the Image</span>
	                      </div>
	                      <button
	                        type="button"
	                        className="inline-flex h-[28px] w-[142px] shrink-0 items-center justify-between rounded-[5px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[9px] text-[11px] font-[800] text-[var(--editor-text)]"
	                      >
	                        Video Model
	                        <ChevronDown className="h-[13px] w-[13px] text-[var(--editor-muted)]" />
	                      </button>
	                    </div>
		                    <div className="relative min-w-0">
		                      <textarea
		                        ref={(node) => {
		                          textareaRefs.current[textareaRefKey(scene.id, "video")] = node;
		                        }}
		                        value={videoPromptDrafts[scene.id] ?? scene.motionPrompt ?? ""}
		                        onChange={(event) => updateVideoPrompt(scene.id, event.target.value, event.target.selectionStart)}
		                        onClick={(event) => updateMentionMenuFromCursor(scene.id, "video", event.currentTarget.value, event.currentTarget.selectionStart)}
		                        onKeyUp={(event) => updateMentionMenuFromCursor(scene.id, "video", event.currentTarget.value, event.currentTarget.selectionStart)}
		                        onKeyDown={(event) => {
		                          if (event.key === "Escape") setMentionMenu(null);
		                        }}
		                        disabled={generationLocked}
		                        title={generationLocked ? generationLockReason : undefined}
		                        aria-label={`Scene ${index + 1} video prompt`}
		                        className="min-h-[210px] w-full resize-y rounded-[5px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[10px] py-[9px] text-[13px] font-[600] leading-[20px] text-[var(--editor-text)] outline-none focus:border-[var(--editor-accent)] disabled:cursor-not-allowed disabled:bg-[var(--editor-panel-strong)] disabled:text-[var(--editor-muted)]"
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
	                    <div className="mt-[8px] flex items-center justify-between rounded-[5px] border border-dashed border-[var(--editor-line)] bg-[var(--editor-panel)] px-[10px] py-[7px] text-[11px] font-[800] text-[var(--editor-muted)]">
	                      <span className="inline-flex items-center gap-[6px]">
	                        <Play className="h-[12px] w-[12px]" />
	                        Video preview placeholder
	                      </span>
	                      <span className="inline-flex items-center gap-[3px]">
	                        <Coins className="h-[11px] w-[11px]" />5
	                      </span>
	                    </div>
	                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </main>

      <footer className="flex min-h-[92px] shrink-0 flex-col items-stretch justify-center gap-[10px] border-t border-[var(--editor-line)] bg-[var(--editor-panel)] px-[16px] py-[12px] sm:flex-row sm:items-center sm:justify-end sm:gap-[18px] sm:px-[22px]">
        <button type="button" onClick={onClose} className="h-[42px] px-[10px] text-[15px] font-[800] text-[var(--editor-muted)]">
          Cancel
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

function sceneStatusLabel(scene: { prompt?: string | null; status?: string | null }) {
  if (scene.status === "lyrics_draft" || !String(scene.prompt || "").trim()) return "Timing draft";
  return scene.status || "draft";
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
