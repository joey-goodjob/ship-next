"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { EditorContext } from "./editor-context";
import { PlaybackProvider } from "./playback-context";
import type {
  EditorContextValue,
  GenerationRun,
  GenerationRunResponse,
  GenerationStep,
  LyricCastMember,
  LyricExport,
  LyricLine,
  LyricScene,
  LyricVideoProject,
  LyricWord,
  PanelTab,
  ProjectDetails,
  RetryFailedBatchesResponse,
  RuntimeState,
  SaveStatus,
  StoryChangeSource,
  StoryReviewStatus,
  StoryGenerationResponse,
  UploadAudioResponse,
  VisualGenerationResponse,
} from "./types";
import {
  clamp,
  createWordsFromLines,
  deriveLinesFromWords,
  GENERATION_LOCK_REASON,
  isGenerationLocked,
  normalizePreviewConfig,
  normalizeWordsForSave,
  projectIsProcessing,
  requestJson,
  sceneImageIsPending,
  secondsToMs,
  sortWords,
  wordsFromDetails,
} from "./utils";

const IMAGE_SYNC_SCENE_FIELDS = [
  "imageUrl",
  "imageTaskId",
  "providerTaskId",
  "generationParams",
  "status",
  "error",
  "failureCode",
  "completedAt",
  "updatedAt",
];

export function mergeProjectWithLocalPatch({
  inFlightPatch,
  pendingPatch,
  serverProject,
}: {
  inFlightPatch: Partial<LyricVideoProject>;
  pendingPatch: Partial<LyricVideoProject>;
  serverProject: LyricVideoProject;
}) {
  return {
    ...serverProject,
    ...inFlightPatch,
    ...pendingPatch,
  };
}

function mergeImageSyncedScenes(current: LyricScene[], updates: LyricScene[]) {
  if (!updates.length) return current;

  const updatesById = new Map(updates.map((scene) => [scene.id, scene]));
  const seenIds = new Set<string>();
  const merged = current.map((scene) => {
    const update = updatesById.get(scene.id) as (LyricScene & Record<string, unknown>) | undefined;
    if (!update) return scene;

    seenIds.add(scene.id);
    const next: Record<string, unknown> = { ...scene };
    for (const field of IMAGE_SYNC_SCENE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(update, field)) {
        next[field] = update[field];
      }
    }
    return next as LyricScene;
  });

  const appended = updates.filter((scene) => !seenIds.has(scene.id));
  if (appended.length === 0) return merged;
  return [...merged, ...appended].sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
}

export function EditorProvider({
  appName,
  children,
  debugGenerationLocked,
  projectId,
}: {
  appName: string;
  children: ReactNode;
  debugGenerationLocked?: boolean;
  projectId: string;
}) {
  const [project, setProject] = useState<LyricVideoProject | null>(null);
  const [runtimeState, setRuntimeState] = useState<RuntimeState | null>(null);
  const [generationRun, setGenerationRun] = useState<GenerationRun | null>(null);
  const [generationSteps, setGenerationSteps] = useState<GenerationStep[]>([]);
  const [lines, setLinesState] = useState<LyricLine[]>([]);
  const [words, setWordsState] = useState<LyricWord[]>([]);
  const [scenes, setScenes] = useState<LyricScene[]>([]);
  const [cast, setCast] = useState<LyricCastMember[]>([]);
  const [exports, setExports] = useState<LyricExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [activeTab, setActiveTab] = useState<PanelTab>("customize");
  const [zoom, setZoomState] = useState(1);
  const [lyricsDirty, setLyricsDirty] = useState(false);
  const [wordsDirty, setWordsDirty] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preparingAudio, setPreparingAudio] = useState(false);
  const [creatingStory, setCreatingStory] = useState(false);
  const [castBusy, setCastBusy] = useState(false);
  const [confirmedStoryPrompt, setConfirmedStoryPrompt] = useState<string | null>(null);
  const [storyChangeSource, setStoryChangeSource] = useState<StoryChangeSource>(null);
  const [storyReviewBaseline, setStoryReviewBaseline] = useState("");
  const saveTimerRef = useRef<number | null>(null);
  const imageSyncInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const autoTranscribeProjectRef = useRef<string | null>(null);
  const autoStoryProjectRef = useRef<string | null>(null);
  const autoDirectionDetailProjectRef = useRef<string | null>(null);
  const pendingProjectPatchRef = useRef<Partial<LyricVideoProject>>({});
  const projectPatchInFlightRef = useRef<Partial<LyricVideoProject>>({});
  const storyReviewProjectRef = useRef<string | null>(null);

  const totalDuration = useMemo(() => {
    const candidates = [
      project?.audioDurationMs || 0,
      ...lines.map((line) => line.endMs || 0),
      ...words.map((word) => word.endMs || 0),
      ...scenes.map((scene) => scene.endMs || 0),
      20110,
    ];
    return Math.max(...candidates) / 1000;
  }, [lines, project?.audioDurationMs, scenes, words]);

  const latestExport = exports[0];
  const generationLocked = useMemo(
    () => Boolean(debugGenerationLocked) || isGenerationLocked(project, generationRun, runtimeState),
    [debugGenerationLocked, generationRun, project, runtimeState],
  );
  const generationLockReason = GENERATION_LOCK_REASON;
  const storyReviewStatus = useMemo<StoryReviewStatus>(() => {
    const storyPrompt = project?.storyPrompt || "";
    if (!storyPrompt.trim()) return "idle";
    if (confirmedStoryPrompt !== null) {
      return storyPrompt === confirmedStoryPrompt ? "confirmed" : "dirty";
    }
    if (storyReviewBaseline && storyPrompt !== storyReviewBaseline) return "dirty";
    return "unconfirmed";
  }, [confirmedStoryPrompt, project?.storyPrompt, storyReviewBaseline]);

  function showGenerationLockedToast() {
    toast.info(generationLockReason);
  }

  function mergeIncomingProject(serverProject: LyricVideoProject) {
    return mergeProjectWithLocalPatch({
      serverProject,
      inFlightPatch: projectPatchInFlightRef.current,
      pendingPatch: pendingProjectPatchRef.current,
    });
  }

  function clearInFlightProjectPatch(patch: Partial<LyricVideoProject>) {
    const nextPatch = { ...projectPatchInFlightRef.current };
    for (const key of Object.keys(patch) as Array<keyof LyricVideoProject>) {
      if (Object.is(nextPatch[key], patch[key])) {
        delete nextPatch[key];
      }
    }
    projectPatchInFlightRef.current = nextPatch;
  }

  function hasLocalProjectPatch() {
    return Object.keys(pendingProjectPatchRef.current).length > 0 || Object.keys(projectPatchInFlightRef.current).length > 0;
  }

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setLoadError("");
    try {
      const details = await requestJson<ProjectDetails>(`/api/lyric-videos/${projectId}`);
      if (!details?.project) throw new Error("Project not found");
      setProject(mergeIncomingProject(details.project));
      setRuntimeState(details.runtimeState || null);
      setGenerationRun(details.generationRun || null);
      setGenerationSteps(details.generationSteps || []);
      setLinesState(details.lines || []);
      setWordsState(wordsFromDetails(details));
      setScenes(details.scenes || []);
      setCast(details.cast || []);
      setExports(details.exports || []);
      setLyricsDirty(false);
      setWordsDirty(false);
      setSaveStatus(hasLocalProjectPatch() ? "saving" : "saved");
    } catch (err: any) {
      setLoadError(err?.message || "Project not found");
    } finally {
      setLoading(false);
      refreshInFlightRef.current = false;
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!project) {
      storyReviewProjectRef.current = null;
      setConfirmedStoryPrompt(null);
      setStoryChangeSource(null);
      setStoryReviewBaseline("");
      return;
    }

    if (storyReviewProjectRef.current !== project.id) {
      storyReviewProjectRef.current = project.id;
      setConfirmedStoryPrompt(null);
      setStoryChangeSource(null);
      setStoryReviewBaseline(project.storyPrompt || "");
      return;
    }

    if (!storyReviewBaseline && confirmedStoryPrompt === null && project.storyPrompt?.trim()) {
      setStoryReviewBaseline(project.storyPrompt);
    }
  }, [confirmedStoryPrompt, project, storyReviewBaseline]);

  useEffect(() => {
    const hasPendingSceneImages = scenes.some(sceneImageIsPending);
    if (!projectIsProcessing(project, runtimeState) && !hasPendingSceneImages) return;
    const timer = window.setInterval(() => {
      refresh();
    }, hasPendingSceneImages ? 20000 : 4000);
    return () => window.clearInterval(timer);
  }, [project, refresh, runtimeState, scenes]);

  useEffect(() => {
    const hasProcessingCast = cast.some((member) => member.providerTaskId && !member.referenceImageUrl && member.status !== "failed");
    if (!hasProcessingCast) return;
    const timer = window.setInterval(() => {
      syncCastImages();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [cast]);

  useEffect(() => {
    const hasProcessingScenes = scenes.some((scene) => scene.providerTaskId && !scene.imageUrl && scene.status === "processing");
    if (!hasProcessingScenes || !project) return;
    const timer = window.setInterval(() => {
      syncSceneImages();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [project, scenes]);

  useEffect(() => {
    const hasAudio = Boolean(project?.originalAudioUrl || project?.audioUrl || project?.processedAudioUrl);
    const shouldAutoTranscribe =
      project &&
      hasAudio &&
      lines.length === 0 &&
      !preparingAudio &&
      !generationLocked &&
      !["processing", "asr_processing", "normalizing", "ready", "failed"].includes(project.lyricsStatus || "") &&
      autoTranscribeProjectRef.current !== project.id;
    if (!shouldAutoTranscribe) return;

    autoTranscribeProjectRef.current = project.id;
    setPreparingAudio(true);
    setSaveStatus("saving");
    setActiveTab("lyrics");
    setProject((previous) =>
      previous
        ? {
            ...previous,
            generationStatus: "running",
            generationProgress: 5,
            pipelineStage: "generation_queued",
            pipelineError: null,
          }
        : previous,
    );
    console.info("[lyric-video] guided generation started from preview", {
      projectId: project.id,
      audioUrl: project.audioUrl,
      originalAudioUrl: project.originalAudioUrl,
      processedAudioUrl: project.processedAudioUrl,
      trimStartMs: project.trimStartMs,
      trimEndMs: project.trimEndMs,
    });

    requestJson<GenerationRunResponse>(`/api/lyric-videos/${project.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "guided" }),
    })
      .then(async (generated) => {
        console.info("[lyric-video] guided generation queued from preview", {
          projectId: project.id,
          lineCount: generated.lines?.length || 0,
          sceneCount: generated.scenes?.length || 0,
          firstScene: generated.scenes?.[0],
        });
        setProject((previous) => (generated.project ? mergeIncomingProject(generated.project) : previous));
        if (generated.run) setGenerationRun(generated.run);
        if (generated.steps) setGenerationSteps(generated.steps);
        if (generated.lines?.length) setLinesState(generated.lines);
        if (generated.words?.length || generated.lines?.length) {
          setWordsState(generated.words?.length ? sortWords(generated.words) : createWordsFromLines(generated.lines || []));
        }
        if (generated.scenes?.length) setScenes(generated.scenes);
        setLyricsDirty(false);
        setWordsDirty(false);
        setActiveTab("customize");
        await refresh();
        setSaveStatus("saved");
        toast.success("Direction generation started. Review it when the editor unlocks.");
      })
      .catch(async (err: any) => {
        console.error("[lyric-video] guided generation flow failed from preview", err);
        setSaveStatus("failed");
        await refresh();
        toast.error(err?.message || "Generate direction failed");
      })
      .finally(() => {
        setPreparingAudio(false);
      });
  }, [generationLocked, lines.length, preparingAudio, project, refresh]);

  useEffect(() => {
    const shouldCreateStory =
      project &&
      lines.length > 0 &&
      scenes.length === 0 &&
      !creatingStory &&
      !generationLocked &&
      !(project.storyPrompt || "").trim() &&
      autoStoryProjectRef.current !== project.id;
    if (!shouldCreateStory) return;

    autoStoryProjectRef.current = project.id;
    setCreatingStory(true);
    requestJson<StoryGenerationResponse>(`/api/lyric-videos/${project.id}/story`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((data) => {
        setProject((previous) => {
          const incomingProject = data.project || (previous ? { ...previous, storyPrompt: data.storyPrompt } : null);
          return incomingProject ? mergeIncomingProject(incomingProject) : previous;
        });
        setSaveStatus("saved");
        toast.success("Story created");
      })
      .catch((err: any) => {
        toast.error(err?.message || "Generate story failed");
      })
      .finally(() => {
        setCreatingStory(false);
      });
  }, [creatingStory, generationLocked, lines.length, project, scenes.length]);

  useEffect(() => {
    const storyPrompt = (project?.storyPrompt || "").trim();
    const shouldPrewarmDirectionDetail =
      project &&
      storyPrompt &&
      lines.length > 0 &&
      scenes.length === 0 &&
      !generationLocked &&
      autoDirectionDetailProjectRef.current !== project.id;
    if (!shouldPrewarmDirectionDetail) return;

    autoDirectionDetailProjectRef.current = project.id;
    requestJson(`/api/lyric-videos/${project.id}/direction-detail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyPrompt }),
    })
      .then((data: any) => {
        console.info("[lyric-video] direction detail prewarmed", {
          projectId: project.id,
          reused: data?.reused,
          status: data?.status,
          storyPromptHash: data?.storyPromptHash,
        });
      })
      .catch((err: any) => {
        console.warn("[lyric-video] direction detail prewarm failed; visuals will retry", {
          projectId: project.id,
          error: err?.message || String(err || "unknown"),
        });
      });
  }, [generationLocked, lines.length, project, scenes.length]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  function setZoom(zoomValue: number) {
    setZoomState(Number(clamp(zoomValue, 1, 3).toFixed(2)));
  }

  async function flushProjectPatch() {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const patch = pendingProjectPatchRef.current;
    if (Object.keys(patch).length === 0) return null;

    pendingProjectPatchRef.current = {};
    projectPatchInFlightRef.current = { ...projectPatchInFlightRef.current, ...patch };
    try {
      const saved = await requestJson<LyricVideoProject>(`/api/lyric-videos/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      clearInFlightProjectPatch(patch);
      const mergedProject = saved ? mergeIncomingProject(saved) : null;
      if (mergedProject) setProject(mergedProject);
      setSaveStatus(hasLocalProjectPatch() ? "saving" : "saved");
      return mergedProject || saved;
    } catch (error) {
      clearInFlightProjectPatch(patch);
      pendingProjectPatchRef.current = { ...patch, ...pendingProjectPatchRef.current };
      setProject((previous) => (previous ? mergeIncomingProject(previous) : previous));
      throw error;
    }
  }

  function updateProjectField<K extends keyof LyricVideoProject>(key: K, value: LyricVideoProject[K]) {
    if (generationLocked) {
      showGenerationLockedToast();
      return;
    }
    if (key === "storyPrompt") {
      setStoryChangeSource("manual_edit");
    }
    setProject((previous) => (previous ? { ...previous, [key]: value } : previous));
    pendingProjectPatchRef.current = { ...pendingProjectPatchRef.current, [key]: value };
    setSaveStatus("saving");

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await flushProjectPatch();
      } catch (err: any) {
        setSaveStatus("failed");
        toast.error(err?.message || "Save failed");
      }
    }, 600);
  }

  function confirmStoryPrompt() {
    const storyPrompt = project?.storyPrompt || "";
    if (!storyPrompt.trim()) {
      toast.info("Add a story before confirming.");
      return;
    }
    setConfirmedStoryPrompt(storyPrompt);
    setStoryChangeSource(null);
    setStoryReviewBaseline(storyPrompt);
  }

  function applyStoryPromptChanges() {
    confirmStoryPrompt();
  }

  function editStoryPrompt() {
    const storyPrompt = project?.storyPrompt || "";
    if (!storyPrompt.trim()) return;
    setConfirmedStoryPrompt(null);
    setStoryChangeSource(null);
    setStoryReviewBaseline(storyPrompt);
  }

  function cancelStoryPromptChanges() {
    const fallbackStoryPrompt = confirmedStoryPrompt ?? storyReviewBaseline;
    if (!fallbackStoryPrompt.trim()) return;
    updateProjectField("storyPrompt", fallbackStoryPrompt);
    setStoryChangeSource(null);
  }

  function setLines(nextLines: LyricLine[]) {
    if (generationLocked) {
      showGenerationLockedToast();
      return;
    }
    setLinesState(nextLines);
    setLyricsDirty(true);
  }

  function setWords(nextWords: LyricWord[]) {
    if (generationLocked) {
      showGenerationLockedToast();
      return;
    }
    const sortedWords = sortWords(nextWords);
    setWordsState(sortedWords);
    setLinesState((previous) => deriveLinesFromWords(previous, sortedWords));
    setWordsDirty(true);
    setLyricsDirty(true);
  }

  async function uploadAndTranscribe(
    file: File,
    startTime: number,
    endTime: number,
    options: { useEntireAudio: boolean; durationSeconds: number },
  ) {
    if (generationLocked) {
      showGenerationLockedToast();
      return;
    }
    if (preparingAudio) return;
    console.info("[lyric-video] upload flow started", {
      projectId,
      filename: file.name,
      fileType: file.type,
      fileSize: file.size,
      startTime,
      endTime,
      options,
    });
    setPreparingAudio(true);
    setSaveStatus("saving");
    setLoadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploaded = await requestJson<UploadAudioResponse>("/api/storage/upload-audio", {
        method: "POST",
        body: formData,
      });
      console.info("[lyric-video] original audio uploaded", uploaded);

      const originalDurationMs = secondsToMs(options.durationSeconds);
      const trimStartMs = options.useEntireAudio ? 0 : secondsToMs(startTime);
      const trimEndMs = options.useEntireAudio ? originalDurationMs : secondsToMs(endTime);
      console.info("[lyric-video] saving audio trim metadata", {
        projectId,
        originalDurationMs,
        trimStartMs,
        trimEndMs,
      });

      await requestJson<LyricVideoProject>(`/api/lyric-videos/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioUrl: uploaded.url,
          audioStorageKey: uploaded.key,
          originalAudioUrl: uploaded.url,
          originalAudioStorageKey: uploaded.key,
          audioFilename: uploaded.filename || file.name,
          audioDurationMs: originalDurationMs,
          audioMimeType: file.type || "audio/mpeg",
          audioSizeBytes: uploaded.size || file.size,
          trimStartMs,
          trimEndMs,
        }),
      });

      console.info("[lyric-video] requesting guided lyric video direction generation", { projectId });
      const generated = await requestJson<GenerationRunResponse>(`/api/lyric-videos/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "guided" }),
      });
      console.info("[lyric-video] guided lyric video direction generation queued", {
        projectId,
        lineCount: generated.lines?.length || 0,
        sceneCount: generated.scenes?.length || 0,
        firstScene: generated.scenes?.[0],
      });

      setProject((previous) => (generated.project ? mergeIncomingProject(generated.project) : previous));
      if (generated.run) setGenerationRun(generated.run);
      if (generated.steps) setGenerationSteps(generated.steps);
      if (generated.lines?.length) setLinesState(generated.lines);
      if (generated.words?.length || generated.lines?.length) {
        setWordsState(generated.words?.length ? sortWords(generated.words) : createWordsFromLines(generated.lines || []));
      }
      if (generated.scenes?.length) setScenes(generated.scenes);
      setLyricsDirty(false);
      setWordsDirty(false);
      setActiveTab("customize");
      await refresh();
      setSaveStatus("saved");
      toast.success("Direction generation started. Review it when the editor unlocks.");
    } catch (err: any) {
      console.error("[lyric-video] upload/transcribe flow failed", err);
      setSaveStatus("failed");
      await refresh();
      throw err;
    } finally {
      setPreparingAudio(false);
    }
  }

  async function createStory(feedback?: string) {
    if (generationLocked) {
      showGenerationLockedToast();
      return;
    }
    if (creatingStory) return;
    if (!project) {
      toast.error("Project unavailable");
      return;
    }
    if (lines.length === 0) {
      toast.error("Generate lyrics before creating a story");
      return;
    }
    const scenesCreated =
      !["empty", "lyrics_draft"].includes(project.scenesStatus || "empty") ||
      scenes.some((scene) => scene.status !== "lyrics_draft" && String(scene.prompt || "").trim());
    if (scenesCreated) {
      toast.info("Language and Story are locked after scenes have been created.");
      return;
    }

    setCreatingStory(true);
    setSaveStatus("saving");
    try {
      await flushProjectPatch();
      const data = await requestJson<StoryGenerationResponse>(`/api/lyric-videos/${project.id}/story`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedback || undefined }),
      });
      const nextStoryPrompt = data.project?.storyPrompt || data.storyPrompt || "";
      const hadPriorStory = Boolean(project.storyPrompt?.trim());
      setProject(mergeIncomingProject(data.project || { ...project, storyPrompt: data.storyPrompt }));
      if (hadPriorStory) {
        setStoryChangeSource(feedback?.trim() ? "ai_rewrite" : "ai_new_story");
        // Previously had a story → mark new story as "dirty" so user must
        // re-confirm before generating scenes. Keep the old baseline/confirmed
        // value so new story ≠ baseline → dirty.
        if (confirmedStoryPrompt === null) {
          // No prior confirm — keep storyReviewBaseline as-is (old story text).
          // new story ≠ old baseline → dirty.
        }
        // If confirmedStoryPrompt !== null, new story ≠ confirmedStoryPrompt → dirty.
      } else {
        // First-time generation — set baseline to new story → "unconfirmed"
        setConfirmedStoryPrompt(null);
        setStoryChangeSource(null);
        setStoryReviewBaseline(nextStoryPrompt);
      }
      setSaveStatus("saved");
      toast.success("Story created");
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Generate story failed");
    } finally {
      setCreatingStory(false);
    }
  }

  async function generateStoryboardPrompts() {
    if (generationLocked) {
      showGenerationLockedToast();
      return;
    }
    if (!project) {
      toast.error("Project unavailable");
      return;
    }
    if (lines.length === 0) {
      toast.error("Generate lyrics before creating scenes");
      return;
    }

    setSaveStatus("saving");
    try {
      if (lyricsDirty || wordsDirty) {
        const saved = await saveLyrics();
        if (!saved) return;
      }
      const savedProject = await flushProjectPatch();

      let storyPrompt = (savedProject?.storyPrompt || project.storyPrompt || "").trim();
      if (!storyPrompt) {
        console.info("[lyric-video] generate-all-scenes needs story prompt; requesting story", {
          projectId: project.id,
        });
        const story = await requestJson<StoryGenerationResponse>(`/api/lyric-videos/${project.id}/story`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        storyPrompt = story.storyPrompt;
        setProject((previous) => {
          const incomingProject = story.project || (previous ? { ...previous, storyPrompt } : null);
          return incomingProject ? mergeIncomingProject(incomingProject) : previous;
        });
      }

      console.info("[lyric-video] generate-all-scenes requesting visuals", {
        projectId: project.id,
        currentStage: runtimeState?.currentStage || generationRun?.currentStage || project.pipelineStage,
        storyPromptLength: storyPrompt.length,
        lineCount: lines.length,
        sceneCount: scenes.length,
        regenerateStoryboard: true,
      });
      const generated = await requestJson<VisualGenerationResponse>(`/api/lyric-videos/${project.id}/visuals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyPrompt,
          regenerateStoryboard: true,
        }),
      });
      console.info("[lyric-video] generate-all-scenes visuals response", {
        projectId: project.id,
        generatedStoryboard: generated.generatedStoryboard,
        sceneCount: generated.scenes?.length || 0,
        queuedImagesCount: generated.queuedImages?.length || 0,
        pipelineStage: generated.project?.pipelineStage,
        scenesStatus: generated.project?.scenesStatus,
      });
      setScenes(generated.scenes || []);
      setProject((previous) => {
        const incomingProject =
          generated.project ||
          (previous
            ? {
                ...previous,
                storyPrompt: generated.storyPrompt || storyPrompt,
                scenesStatus: (generated.queuedImages?.length || 0) > 0 ? "processing" : "ready",
                pipelineStage: (generated.queuedImages?.length || 0) > 0 ? "images_processing" : "storyboard_ready",
                pipelineError: null,
              }
            : null);
        return incomingProject ? mergeIncomingProject(incomingProject) : previous;
      });
      setActiveTab("scenes");
      setSaveStatus("saved");
      await refresh();
      toast.success("Scene generation started");
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Generate scenes failed");
    }
  }

  async function generateCastCandidates() {
    if (generationLocked) {
      showGenerationLockedToast();
      return;
    }
    if (!project || castBusy) return;
    setCastBusy(true);
    setSaveStatus("saving");
    try {
      const generated = await requestJson<LyricCastMember[]>(`/api/lyric-videos/${project.id}/cast/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setCast(generated || []);
      setActiveTab("cast");
      setSaveStatus("saved");
      toast.success("Character candidates queued");
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Generate characters failed");
    } finally {
      setCastBusy(false);
    }
  }

  async function createCastMember(params: { name: string; description: string; promptFragment?: string }) {
    if (generationLocked) {
      showGenerationLockedToast();
      return null;
    }
    if (!project || castBusy) return null;
    setCastBusy(true);
    setSaveStatus("saving");
    try {
      const created = await requestJson<LyricCastMember>(`/api/lyric-videos/${project.id}/cast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      setCast((previous) => [...previous.filter((item) => item.id !== created.id), created]);
      setSaveStatus("saved");
      toast.success("Character created");
      return created;
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Create character failed");
      return null;
    } finally {
      setCastBusy(false);
    }
  }

  async function updateCastMember(castId: string, data: Partial<LyricCastMember> & { selectAsMain?: boolean }) {
    if (generationLocked) {
      showGenerationLockedToast();
      return null;
    }
    if (!project) return null;
    setSaveStatus("saving");
    try {
      const updated = await requestJson<LyricCastMember>(`/api/lyric-videos/${project.id}/cast/${castId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setCast((previous) =>
        data.selectAsMain
          ? previous.map((item) => (item.id === updated.id ? updated : { ...item, status: item.status === "deleted" ? item.status : "inactive" }))
          : previous.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSaveStatus("saved");
      toast.success(data.selectAsMain ? "Main character selected" : "Character saved");
      return updated;
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Save character failed");
      return null;
    }
  }

  async function deleteCastMember(castId: string) {
    if (generationLocked) {
      showGenerationLockedToast();
      return;
    }
    if (!project) return;
    setSaveStatus("saving");
    try {
      await requestJson<void>(`/api/lyric-videos/${project.id}/cast/${castId}`, { method: "DELETE" });
      setCast((previous) => previous.filter((item) => item.id !== castId));
      setSaveStatus("saved");
      toast.success("Character deleted");
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Delete character failed");
    }
  }

  async function regenerateCastImage(castId: string) {
    if (generationLocked) {
      showGenerationLockedToast();
      return null;
    }
    if (!project || castBusy) return null;
    setCastBusy(true);
    setSaveStatus("saving");
    try {
      const updated = await requestJson<LyricCastMember>(`/api/lyric-videos/${project.id}/cast/${castId}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setCast((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
      setSaveStatus("saved");
      toast.success("Character image queued");
      return updated;
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Generate character image failed");
      return null;
    } finally {
      setCastBusy(false);
    }
  }

  async function syncCastImages() {
    if (!project) return;
    try {
      const synced = await requestJson<LyricCastMember[]>(`/api/lyric-videos/${project.id}/cast/images`);
      setCast(synced || []);
    } catch (err: any) {
      toast.error(err?.message || "Sync character images failed");
    }
  }

  async function queueSceneImages(sceneIds: string[]) {
    if (generationLocked) {
      showGenerationLockedToast();
      return [];
    }
    if (!project) return [];
    const selectedSceneIds = sceneIds.filter(Boolean);
    if (selectedSceneIds.length === 0) return [];
    setSaveStatus("saving");
    try {
      const queued = await requestJson<LyricScene[]>(`/api/lyric-videos/${project.id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneIds: selectedSceneIds,
          clearExistingImages: true,
        }),
      });
      const queuedById = new Map((queued || []).map((scene) => [scene.id, scene]));
      setScenes((previous) => previous.map((scene) => queuedById.get(scene.id) || scene));
      setProject((previous) =>
        previous
          ? {
              ...previous,
              scenesStatus: "processing",
              generationStatus: "waiting_provider",
              generationProgress: Math.max(previous.generationProgress || 0, 80),
              pipelineStage: "images_processing",
              pipelineError: null,
            }
          : previous,
      );
      setSaveStatus("saved");
      await refresh();
      toast.success(`Queued ${selectedSceneIds.length} scene images`);
      return queued || [];
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Queue scene images failed");
      return [];
    }
  }

  async function syncSceneImages() {
    if (!project) return;
    if (imageSyncInFlightRef.current) return;
    imageSyncInFlightRef.current = true;
    try {
      const synced = await requestJson<LyricScene[]>(`/api/lyric-videos/${project.id}/images`);
      if (synced?.length) {
        setScenes((previous) => mergeImageSyncedScenes(previous, synced));
      }
      void refresh();
    } catch (err: any) {
      toast.error(err?.message || "Sync scene images failed");
    } finally {
      imageSyncInFlightRef.current = false;
    }
  }

  async function retryFailedImageBatches() {
    if (generationLocked) {
      showGenerationLockedToast();
      return;
    }
    if (!project) return;
    setSaveStatus("saving");
    try {
      const data = await requestJson<RetryFailedBatchesResponse>(`/api/lyric-videos/${project.id}/images/retry-failed-batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const queuedById = new Map((data.queuedScenes || []).map((scene) => [scene.id, scene]));
      setScenes((previous) => previous.map((scene) => queuedById.get(scene.id) || scene));
      setProject((previous) =>
        previous
          ? {
              ...previous,
              scenesStatus: data.queuedScenes.length > 0 ? "processing" : previous.scenesStatus,
              generationStatus: data.queuedScenes.length > 0 ? "waiting_provider" : previous.generationStatus,
              generationProgress: data.queuedScenes.length > 0 ? Math.max(previous.generationProgress || 0, 95) : previous.generationProgress,
              pipelineStage: data.queuedScenes.length > 0 ? "images_processing" : previous.pipelineStage,
              pipelineError: data.queuedScenes.length > 0 ? null : previous.pipelineError,
            }
          : previous,
      );
      setSaveStatus("saved");
      await refresh();
      toast.success(data.queuedScenes.length > 0 ? `Retrying ${data.queuedScenes.length} failed scene images` : "No failed image batches to retry");
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Retry failed image batches failed");
    }
  }

  async function saveLyrics() {
    if (generationLocked) {
      showGenerationLockedToast();
      return false;
    }
    try {
      setSaveStatus("saving");
      const cleanWords = normalizeWordsForSave(words, totalDuration);
      const derivedLines = deriveLinesFromWords(lines, cleanWords);
      const saved = await requestJson<LyricLine[]>(`/api/lyric-videos/${projectId}/lyrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: derivedLines, words: cleanWords }),
      });
      setLinesState(saved || []);
      setWordsState(cleanWords);
      setLyricsDirty(false);
      setWordsDirty(false);
      setSaveStatus("saved");
      await refresh();
      toast.success("Lyrics saved");
      return true;
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Save lyrics failed");
      return false;
    }
  }

  async function queueExport() {
    if (generationLocked) {
      showGenerationLockedToast();
      return;
    }
    if (exporting) return;
    setExporting(true);
    try {
      const previewConfig = normalizePreviewConfig(project?.previewConfig);
      const exportJob = await requestJson<LyricExport>(`/api/lyric-videos/${projectId}/exports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            ...previewConfig,
            aspectRatio: project?.aspectRatio,
            resolution: project?.resolution,
          },
        }),
      });
      setExports((previous) => [exportJob, ...previous.filter((item) => item.id !== exportJob.id)]);
      await refresh();
      toast.success(exportJob.videoUrl ? "Export ready" : "Export queued");
    } catch (err: any) {
      toast.error(err?.message || "Queue export failed");
    } finally {
      setExporting(false);
    }
  }

  const value = useMemo<EditorContextValue>(
    () => ({
      projectId,
      appName,
      project,
      runtimeState,
      generationRun,
      generationSteps,
      lines,
      words,
      scenes,
      cast,
      exports,
      latestExport,
      loading,
      loadError,
      saveStatus,
      activeTab,
      zoom,
      lyricsDirty,
      wordsDirty,
      exporting,
      preparingAudio,
      creatingStory,
      castBusy,
      generationLocked,
      generationLockReason,
      storyChangeSource,
      storyReviewStatus,
      setActiveTab,
      setZoom,
      confirmStoryPrompt,
      applyStoryPromptChanges,
      cancelStoryPromptChanges,
      editStoryPrompt,
      updateProjectField,
      setLines,
      setWords,
      uploadAndTranscribe,
      createStory,
      generateStoryboardPrompts,
      generateCastCandidates,
      createCastMember,
      updateCastMember,
      deleteCastMember,
      regenerateCastImage,
      syncCastImages,
      queueSceneImages,
      syncSceneImages,
      retryFailedImageBatches,
      saveLyrics,
      queueExport,
      refresh,
    }),
    [
      activeTab,
      appName,
      cast,
      castBusy,
      creatingStory,
      exporting,
      exports,
      generationRun,
      generationSteps,
      generationLocked,
      latestExport,
      lines,
      loadError,
      loading,
      lyricsDirty,
      preparingAudio,
      project,
      runtimeState,
      projectId,
      saveStatus,
      scenes,
      storyChangeSource,
      words,
      wordsDirty,
      zoom,
      storyReviewStatus,
      refresh,
      retryFailedImageBatches,
    ],
  );

  return (
    <EditorContext.Provider value={value}>
      <PlaybackProvider project={project} scenes={scenes} lines={lines} words={words} totalDuration={totalDuration}>
        {children}
      </PlaybackProvider>
    </EditorContext.Provider>
  );
}
