"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { EditorContext } from "./editor-context";
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
  SaveStatus,
  StoryGenerationResponse,
  UploadAudioResponse,
} from "./types";
import {
  clamp,
  createWordsFromLines,
  deriveLinesFromWords,
  msToSeconds,
  normalizePreviewConfig,
  normalizeWordsForSave,
  projectIsProcessing,
  requestJson,
  secondsToMs,
  sortWords,
  wordsFromDetails,
} from "./utils";

export function EditorProvider({
  appName,
  children,
  projectId,
}: {
  appName: string;
  children: ReactNode;
  projectId: string;
}) {
  const [project, setProject] = useState<LyricVideoProject | null>(null);
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
  const [currentTime, setCurrentTimeState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>("customize");
  const [zoom, setZoomState] = useState(1);
  const [lyricsDirty, setLyricsDirty] = useState(false);
  const [wordsDirty, setWordsDirty] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preparingAudio, setPreparingAudio] = useState(false);
  const [creatingStory, setCreatingStory] = useState(false);
  const [castBusy, setCastBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scenePreviewEndRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const autoTranscribeProjectRef = useRef<string | null>(null);
  const autoStoryProjectRef = useRef<string | null>(null);
  const pendingProjectPatchRef = useRef<Partial<LyricVideoProject>>({});

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

  const currentScene = useMemo(() => {
    const currentMs = secondsToMs(currentTime);
    const activeScene = scenes.find((scene) => currentMs >= scene.startMs && currentMs < scene.endMs);
    if (activeScene) return activeScene;
    return [...scenes].reverse().find((scene) => currentMs >= scene.startMs) || scenes[0];
  }, [currentTime, scenes]);

  const currentLine = useMemo(() => {
    return (
      lines.find((line) => currentTime >= msToSeconds(line.startMs) && currentTime < msToSeconds(line.endMs)) ||
      lines[0]
    );
  }, [currentTime, lines]);

  const currentWord = useMemo(() => {
    return (
      words.find((word) => currentTime >= msToSeconds(word.startMs) && currentTime < msToSeconds(word.endMs)) ||
      undefined
    );
  }, [currentTime, words]);

  const latestExport = exports[0];
  const audioSrc = project?.processedAudioUrl || project?.audioUrl || project?.originalAudioUrl || "";
  const audioAvailable = Boolean(audioSrc);

  const refresh = useCallback(async () => {
    setLoadError("");
    try {
      const details = await requestJson<ProjectDetails>(`/api/lyric-videos/${projectId}`);
      if (!details?.project) throw new Error("Project not found");
      setProject(details.project);
      setGenerationRun(details.generationRun || null);
      setGenerationSteps(details.generationSteps || []);
      setLinesState(details.lines || []);
      setWordsState(wordsFromDetails(details));
      setScenes(details.scenes || []);
      setCast(details.cast || []);
      setExports(details.exports || []);
      setLyricsDirty(false);
      setWordsDirty(false);
      setSaveStatus("saved");
    } catch (err: any) {
      setLoadError(err?.message || "Project not found");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!projectIsProcessing(project)) return;
    const timer = window.setInterval(() => {
      refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [project, refresh]);

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
    console.info("[lyric-video] auto generation started from preview", {
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
      body: JSON.stringify({}),
    })
      .then(async (generated) => {
        console.info("[lyric-video] auto generation completed from preview", {
          projectId: project.id,
          lineCount: generated.lines?.length || 0,
          sceneCount: generated.scenes?.length || 0,
          firstScene: generated.scenes?.[0],
        });
        setProject((previous) => generated.project || previous);
        if (generated.run) setGenerationRun(generated.run);
        if (generated.steps) setGenerationSteps(generated.steps);
        if (generated.lines?.length) setLinesState(generated.lines);
        if (generated.words?.length || generated.lines?.length) {
          setWordsState(generated.words?.length ? sortWords(generated.words) : createWordsFromLines(generated.lines || []));
        }
        if (generated.scenes?.length) setScenes(generated.scenes);
        setLyricsDirty(false);
        setWordsDirty(false);
        setCurrentTimeState(0);
        setActiveTab("scenes");
        await refresh();
        setSaveStatus("saved");
        toast.success("Generation started. You can leave this page and come back later.");
      })
      .catch(async (err: any) => {
        console.error("[lyric-video] auto generation flow failed from preview", err);
        setSaveStatus("failed");
        await refresh();
        toast.error(err?.message || "Generate storyboard failed");
      })
      .finally(() => {
        setPreparingAudio(false);
      });
  }, [lines.length, preparingAudio, project, refresh]);

  useEffect(() => {
    const shouldCreateStory =
      project &&
      lines.length > 0 &&
      scenes.length === 0 &&
      !creatingStory &&
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
        setProject((previous) => data.project || (previous ? { ...previous, storyPrompt: data.storyPrompt } : previous));
        setSaveStatus("saved");
        toast.success("Story created");
      })
      .catch((err: any) => {
        toast.error(err?.message || "Generate story failed");
      })
      .finally(() => {
        setCreatingStory(false);
      });
  }, [creatingStory, lines.length, project, scenes.length]);

  useEffect(() => {
    if (!audioSrc) {
      audioRef.current?.pause();
      audioRef.current = null;
      scenePreviewEndRef.current = null;
      setIsPlaying(false);
      return;
    }

    const audio = new Audio(audioSrc);
    audio.preload = "metadata";
    audio.currentTime = clamp(currentTime, 0, totalDuration);
    audioRef.current = audio;

    function syncCurrentTime() {
      const nextTime = Number(clamp(audio.currentTime || 0, 0, totalDuration).toFixed(3));
      const sceneEnd = scenePreviewEndRef.current;
      if (sceneEnd !== null && nextTime >= sceneEnd) {
        audio.currentTime = sceneEnd;
        setCurrentTimeState(Number(sceneEnd.toFixed(3)));
        scenePreviewEndRef.current = null;
        audio.pause();
        return;
      }
      setCurrentTimeState(nextTime);
    }

    function handlePlay() {
      setIsPlaying(true);
    }

    function handlePause() {
      setIsPlaying(false);
    }

    function handleEnded() {
      scenePreviewEndRef.current = null;
      setIsPlaying(false);
      setCurrentTimeState(Number(clamp(audio.duration || totalDuration, 0, totalDuration).toFixed(3)));
    }

    function handleError() {
      scenePreviewEndRef.current = null;
      setIsPlaying(false);
      toast.error("Audio failed to load");
    }

    audio.addEventListener("timeupdate", syncCurrentTime);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadedmetadata", syncCurrentTime);
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", syncCurrentTime);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadedmetadata", syncCurrentTime);
      audio.removeEventListener("error", handleError);
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [audioSrc, totalDuration]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      audioRef.current?.pause();
    };
  }, []);

  function setCurrentTime(time: number) {
    scenePreviewEndRef.current = null;
    const nextTime = Number(clamp(time, 0, totalDuration).toFixed(3));
    setCurrentTimeState(nextTime);
    if (audioRef.current && Math.abs(audioRef.current.currentTime - nextTime) > 0.05) {
      audioRef.current.currentTime = nextTime;
    }
  }

  function pausePlayback() {
    scenePreviewEndRef.current = null;
    audioRef.current?.pause();
    setIsPlaying(false);
  }

  async function playAudio(from?: number, sceneEnd?: number | null) {
    const audio = audioRef.current;
    if (!audioAvailable || !audio) {
      setIsPlaying(false);
      toast.error("No audio available for this project");
      return;
    }

    scenePreviewEndRef.current = sceneEnd ?? null;
    if (typeof from === "number") {
      const startTime = Number(clamp(from, 0, totalDuration).toFixed(3));
      audio.currentTime = startTime;
      setCurrentTimeState(startTime);
    }

    try {
      await audio.play();
    } catch {
      scenePreviewEndRef.current = null;
      setIsPlaying(false);
      toast.error("Click play again to start audio");
    }
  }

  async function playFrom(time: number) {
    await playAudio(time, null);
  }

  async function togglePlayback() {
    if (isPlaying) {
      pausePlayback();
      return;
    }
    const startTime = currentTime >= totalDuration ? 0 : currentTime;
    await playAudio(startTime, null);
  }

  async function playScenePreview(startTime: number, endTime: number) {
    const safeStart = clamp(startTime, 0, totalDuration);
    const safeEnd = clamp(endTime, safeStart, totalDuration);
    const outsideScene = currentTime < safeStart || currentTime >= safeEnd;
    await playAudio(outsideScene ? safeStart : currentTime, safeEnd);
  }

  function setZoom(zoomValue: number) {
    setZoomState(Number(clamp(zoomValue, 1, 3).toFixed(2)));
  }

  function updateProjectField<K extends keyof LyricVideoProject>(key: K, value: LyricVideoProject[K]) {
    setProject((previous) => (previous ? { ...previous, [key]: value } : previous));
    pendingProjectPatchRef.current = { ...pendingProjectPatchRef.current, [key]: value };
    setSaveStatus("saving");

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      const patch = pendingProjectPatchRef.current;
      pendingProjectPatchRef.current = {};
      try {
        await requestJson<LyricVideoProject>(`/api/lyric-videos/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        setSaveStatus("saved");
      } catch (err: any) {
        setSaveStatus("failed");
        toast.error(err?.message || "Save failed");
      }
    }, 600);
  }

  function setLines(nextLines: LyricLine[]) {
    setLinesState(nextLines);
    setLyricsDirty(true);
  }

  function setWords(nextWords: LyricWord[]) {
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

      console.info("[lyric-video] requesting one-click lyric video image generation", { projectId });
      const generated = await requestJson<GenerationRunResponse>(`/api/lyric-videos/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      console.info("[lyric-video] one-click lyric video image generation queued", {
        projectId,
        lineCount: generated.lines?.length || 0,
        sceneCount: generated.scenes?.length || 0,
        firstScene: generated.scenes?.[0],
      });

      setProject((previous) => generated.project || previous);
      if (generated.run) setGenerationRun(generated.run);
      if (generated.steps) setGenerationSteps(generated.steps);
      if (generated.lines?.length) setLinesState(generated.lines);
      if (generated.words?.length || generated.lines?.length) {
        setWordsState(generated.words?.length ? sortWords(generated.words) : createWordsFromLines(generated.lines || []));
      }
      if (generated.scenes?.length) setScenes(generated.scenes);
      setLyricsDirty(false);
      setWordsDirty(false);
      setCurrentTimeState(0);
      setActiveTab("scenes");
      await refresh();
      setSaveStatus("saved");
      toast.success("Generation started. You can leave this page and come back later.");
    } catch (err: any) {
      console.error("[lyric-video] upload/transcribe flow failed", err);
      setSaveStatus("failed");
      await refresh();
      throw err;
    } finally {
      setPreparingAudio(false);
    }
  }

  async function createStory() {
    if (creatingStory) return;
    if (!project) {
      toast.error("Project unavailable");
      return;
    }
    if (lines.length === 0) {
      toast.error("Generate lyrics before creating a story");
      return;
    }

    setCreatingStory(true);
    setSaveStatus("saving");
    try {
      const data = await requestJson<StoryGenerationResponse>(`/api/lyric-videos/${project.id}/story`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setProject(data.project || { ...project, storyPrompt: data.storyPrompt });
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

      let storyPrompt = (project.storyPrompt || "").trim();
      if (!storyPrompt) {
        const story = await requestJson<StoryGenerationResponse>(`/api/lyric-videos/${project.id}/story`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        storyPrompt = story.storyPrompt;
        setProject((previous) => story.project || (previous ? { ...previous, storyPrompt } : previous));
      }

      const generated = await requestJson<LyricScene[]>(`/api/lyric-videos/${project.id}/storyboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyPrompt }),
      });
      setScenes(generated || []);
      setProject((previous) =>
        previous
          ? {
              ...previous,
              storyPrompt,
              scenesStatus: "ready",
              pipelineStage: "storyboard_ready",
              pipelineError: null,
            }
          : previous,
      );
      setActiveTab("scenes");
      setSaveStatus("saved");
      await refresh();
      toast.success("Storyboard prompts are ready");
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Generate storyboard failed");
    }
  }

  async function generateCastCandidates() {
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
    try {
      await requestJson<LyricScene[]>(`/api/lyric-videos/${project.id}/images`);
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || "Sync scene images failed");
    }
  }

  async function retryFailedImageBatches() {
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
      currentTime,
      isPlaying,
      activeTab,
      zoom,
      totalDuration,
      currentScene,
      currentLine,
      currentWord,
      lyricsDirty,
      wordsDirty,
      exporting,
      preparingAudio,
      creatingStory,
      castBusy,
      audioAvailable,
      setCurrentTime,
      setIsPlaying,
      togglePlayback,
      playFrom,
      playScenePreview,
      pausePlayback,
      setActiveTab,
      setZoom,
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
      audioAvailable,
      currentLine,
      currentScene,
      currentTime,
      currentWord,
      cast,
      castBusy,
      creatingStory,
      exporting,
      exports,
      generationRun,
      generationSteps,
      latestExport,
      lines,
      loadError,
      loading,
      lyricsDirty,
      preparingAudio,
      project,
      projectId,
      saveStatus,
      scenes,
      totalDuration,
      isPlaying,
      words,
      wordsDirty,
      zoom,
      refresh,
      retryFailedImageBatches,
    ],
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
