"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import type { LyricLine, LyricScene, LyricVideoProject, LyricWord } from "./types";
import { clamp, msToSeconds, secondsToMs } from "./utils";

type PlaybackContextValue = {
  audioAvailable: boolean;
  audioReadyState: number;
  currentTime: number;
  isAudioLoading: boolean;
  isPlaying: boolean;
  totalDuration: number;
  currentScene?: LyricScene;
  currentLine?: LyricLine;
  currentWord?: LyricWord;
  setCurrentTime: (time: number) => void;
  togglePlayback: () => Promise<void>;
  playFrom: (time: number) => Promise<void>;
  playScenePreview: (startTime: number, endTime: number) => Promise<void>;
  pausePlayback: () => void;
};

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

function normalizeAudioSrc(src: string) {
  const trimmed = src.trim();
  if (!trimmed || typeof window === "undefined") return trimmed;

  try {
    const url = new URL(trimmed, window.location.href);
    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (isLocalhost && url.pathname.startsWith("/")) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

function playbackErrorMessage(error: unknown) {
  const mediaError = error instanceof Error ? error : null;
  const name = mediaError?.name || "PlaybackError";
  const message = mediaError?.message || "";

  if (name === "NotAllowedError") return "Browser blocked audio playback. Click play again.";
  if (name === "AbortError") return "Audio playback was interrupted. Click play again.";
  if (name === "NotSupportedError") return "Audio file is not supported by this browser.";
  return message ? `Audio playback failed: ${message}` : "Audio playback failed";
}

function shouldRetryPlayAfterLoad(error: unknown, audio: HTMLAudioElement) {
  const errorName = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (errorName === "NotAllowedError" || errorName === "NotSupportedError") return false;
  if (errorName === "AbortError") return true;
  return audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA && audio.networkState !== HTMLMediaElement.NETWORK_NO_SOURCE;
}

export function PlaybackProvider({
  children,
  lines,
  project,
  scenes,
  totalDuration,
  words,
}: {
  children: ReactNode;
  lines: LyricLine[];
  project: LyricVideoProject | null;
  scenes: LyricScene[];
  totalDuration: number;
  words: LyricWord[];
}) {
  const [currentTime, setCurrentTimeState] = useState(0);
  const [audioReadyState, setAudioReadyState] = useState(0);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingPlayAudioRef = useRef<HTMLAudioElement | null>(null);
  const scenePreviewEndRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastUiUpdateRef = useRef(0);
  const playbackClockActiveRef = useRef(false);
  const latestPlaybackRef = useRef({ currentTime: 0, isPlaying: false, totalDuration });
  const rawAudioSrc = project?.processedAudioUrl || project?.audioUrl || project?.originalAudioUrl || "";
  const audioSrc = useMemo(() => normalizeAudioSrc(rawAudioSrc), [rawAudioSrc]);
  const audioAvailable = Boolean(audioSrc);

  useEffect(() => {
    latestPlaybackRef.current = { currentTime, isPlaying, totalDuration };
  }, [currentTime, isPlaying, totalDuration]);

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

  function syncAudioReadyState(audio: HTMLAudioElement | null = audioRef.current) {
    setAudioReadyState(audio?.readyState || HTMLMediaElement.HAVE_NOTHING);
  }

  function markAudioLoading(audio: HTMLAudioElement | null = audioRef.current) {
    syncAudioReadyState(audio);
    setIsAudioLoading(true);
  }

  function clearAudioLoading(audio: HTMLAudioElement | null = audioRef.current) {
    syncAudioReadyState(audio);
    setIsAudioLoading(false);
  }

  function clearPendingPlayback(audio?: HTMLAudioElement) {
    if (!audio || pendingPlayAudioRef.current === audio) pendingPlayAudioRef.current = null;
  }

  async function resumePendingPlayback(audio: HTMLAudioElement) {
    if (pendingPlayAudioRef.current !== audio || audioRef.current !== audio) return;
    try {
      await audio.play();
      if (audioRef.current !== audio) return;
      if (!audio.paused) {
        clearPendingPlayback(audio);
        playbackClockActiveRef.current = true;
        setIsPlaying(true);
        clearAudioLoading(audio);
      }
    } catch (error) {
      if (shouldRetryPlayAfterLoad(error, audio)) {
        markAudioLoading(audio);
        return;
      }

      clearPendingPlayback(audio);
      scenePreviewEndRef.current = null;
      playbackClockActiveRef.current = false;
      setIsPlaying(false);
      clearAudioLoading(audio);
      console.warn("[lyric-video] pending audio play failed", {
        audioSrc,
        errorName: error instanceof Error ? error.name : undefined,
        errorMessage: error instanceof Error ? error.message : String(error),
        networkState: audio.networkState,
        readyState: audio.readyState,
      });
      toast.error(playbackErrorMessage(error));
    }
  }

  useEffect(() => {
    if (!audioSrc) {
      audioRef.current?.pause();
      audioRef.current = null;
      pendingPlayAudioRef.current = null;
      scenePreviewEndRef.current = null;
      playbackClockActiveRef.current = false;
      setIsAudioLoading(false);
      setAudioReadyState(HTMLMediaElement.HAVE_NOTHING);
      setIsPlaying(false);
      setCurrentTimeState(0);
      return;
    }

    const audio = new Audio(audioSrc);
    audio.preload = "auto";
    audio.currentTime = clamp(latestPlaybackRef.current.currentTime, 0, latestPlaybackRef.current.totalDuration);
    audioRef.current = audio;
    setAudioReadyState(audio.readyState);
    setIsAudioLoading(true);

    function applyAudioTime(force = false) {
      const now = performance.now();
      const duration = latestPlaybackRef.current.totalDuration;
      const nextTime = Number(clamp(audio.currentTime || 0, 0, duration).toFixed(3));
      const sceneEnd = scenePreviewEndRef.current;
      if (sceneEnd !== null && nextTime >= sceneEnd) {
        audio.currentTime = sceneEnd;
        setCurrentTimeState(Number(sceneEnd.toFixed(3)));
        scenePreviewEndRef.current = null;
        playbackClockActiveRef.current = false;
        audio.pause();
        return;
      }
      if (force || now - lastUiUpdateRef.current >= 100) {
        lastUiUpdateRef.current = now;
        setCurrentTimeState(nextTime);
      }
    }

    function scheduleAudioTime(force = false) {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        applyAudioTime(force);
        if (playbackClockActiveRef.current && !audio.paused && !audio.ended) {
          scheduleAudioTime(false);
        }
      });
    }

    function handlePlay() {
      if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) markAudioLoading(audio);
      scheduleAudioTime(true);
    }

    function handlePlaying() {
      clearPendingPlayback(audio);
      playbackClockActiveRef.current = true;
      setIsPlaying(true);
      clearAudioLoading(audio);
      scheduleAudioTime(true);
    }

    function handlePause() {
      clearPendingPlayback(audio);
      playbackClockActiveRef.current = false;
      setIsPlaying(false);
      clearAudioLoading(audio);
      scheduleAudioTime(true);
    }

    function handleEnded() {
      const duration = latestPlaybackRef.current.totalDuration;
      scenePreviewEndRef.current = null;
      clearPendingPlayback(audio);
      playbackClockActiveRef.current = false;
      setIsPlaying(false);
      clearAudioLoading(audio);
      setCurrentTimeState(Number(clamp(audio.duration || duration, 0, duration).toFixed(3)));
    }

    function handleError() {
      const errorCode = audio.error?.code;
      scenePreviewEndRef.current = null;
      clearPendingPlayback(audio);
      playbackClockActiveRef.current = false;
      setIsPlaying(false);
      clearAudioLoading(audio);
      console.warn("[lyric-video] audio failed to load", {
        audioSrc,
        errorCode,
        networkState: audio.networkState,
        readyState: audio.readyState,
      });
      toast.error(errorCode ? `Audio failed to load (code ${errorCode})` : "Audio failed to load");
    }

    function handleLoadStateChange(event: Event) {
      syncAudioReadyState(audio);
      if (event.type === "waiting" || event.type === "stalled") {
        if (pendingPlayAudioRef.current === audio || playbackClockActiveRef.current) markAudioLoading(audio);
      } else if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        if (pendingPlayAudioRef.current === audio) {
          void resumePendingPlayback(audio);
        } else {
          clearAudioLoading(audio);
        }
      }
      console.debug("[lyric-video] audio load state", {
        audioSrc,
        event: event.type,
        networkState: audio.networkState,
        readyState: audio.readyState,
      });
    }

    function handleTimeUpdate() {
      scheduleAudioTime(false);
    }

    function handleLoadedMetadata() {
      syncAudioReadyState(audio);
      scheduleAudioTime(true);
    }

    function handleSeeking() {
      scheduleAudioTime(true);
    }

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("seeking", handleSeeking);
    audio.addEventListener("error", handleError);
    audio.addEventListener("canplay", handleLoadStateChange);
    audio.addEventListener("canplaythrough", handleLoadStateChange);
    audio.addEventListener("loadeddata", handleLoadStateChange);
    audio.addEventListener("waiting", handleLoadStateChange);
    audio.addEventListener("stalled", handleLoadStateChange);
    audio.load();

    return () => {
      playbackClockActiveRef.current = false;
      audio.pause();
      clearPendingPlayback(audio);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("seeking", handleSeeking);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("canplay", handleLoadStateChange);
      audio.removeEventListener("canplaythrough", handleLoadStateChange);
      audio.removeEventListener("loadeddata", handleLoadStateChange);
      audio.removeEventListener("waiting", handleLoadStateChange);
      audio.removeEventListener("stalled", handleLoadStateChange);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      audioRef.current = audioRef.current === audio ? null : audioRef.current;
    };
  }, [audioSrc]);

  useEffect(() => {
    if (currentTime > totalDuration) {
      setCurrentTime(totalDuration);
    }
  }, [currentTime, totalDuration]);

  useEffect(() => {
    return () => {
      playbackClockActiveRef.current = false;
      pendingPlayAudioRef.current = null;
      audioRef.current?.pause();
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
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
    pendingPlayAudioRef.current = null;
    playbackClockActiveRef.current = false;
    audioRef.current?.pause();
    setIsAudioLoading(false);
    setIsPlaying(false);
  }

  async function playAudio(from?: number, sceneEnd?: number | null) {
    const audio = audioRef.current;
    if (!audioAvailable || !audio) {
      setIsAudioLoading(false);
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

    pendingPlayAudioRef.current = audio;
    markAudioLoading(audio);

    try {
      if (audio.networkState === HTMLMediaElement.NETWORK_EMPTY || audio.readyState === HTMLMediaElement.HAVE_NOTHING) {
        audio.load();
      }
      await audio.play();
      if (audioRef.current !== audio) return;
      if (!audio.paused) {
        clearPendingPlayback(audio);
        playbackClockActiveRef.current = true;
        setIsPlaying(true);
        clearAudioLoading(audio);
      }
    } catch (error) {
      console.warn("[lyric-video] audio play failed", {
        audioSrc,
        errorName: error instanceof Error ? error.name : undefined,
        errorMessage: error instanceof Error ? error.message : String(error),
        networkState: audio.networkState,
        readyState: audio.readyState,
      });

      if (shouldRetryPlayAfterLoad(error, audio)) {
        markAudioLoading(audio);
        return;
      }

      clearPendingPlayback(audio);
      scenePreviewEndRef.current = null;
      playbackClockActiveRef.current = false;
      clearAudioLoading(audio);
      setIsPlaying(false);
      toast.error(playbackErrorMessage(error));
    }
  }

  async function playFrom(time: number) {
    await playAudio(time, null);
  }

  async function togglePlayback() {
    if (latestPlaybackRef.current.isPlaying) {
      pausePlayback();
      return;
    }
    const startTime = latestPlaybackRef.current.currentTime >= totalDuration ? 0 : latestPlaybackRef.current.currentTime;
    await playAudio(startTime, null);
  }

  async function playScenePreview(startTime: number, endTime: number) {
    const safeStart = clamp(startTime, 0, totalDuration);
    const safeEnd = clamp(endTime, safeStart, totalDuration);
    const outsideScene = latestPlaybackRef.current.currentTime < safeStart || latestPlaybackRef.current.currentTime >= safeEnd;
    await playAudio(outsideScene ? safeStart : latestPlaybackRef.current.currentTime, safeEnd);
  }

  const value = useMemo<PlaybackContextValue>(
    () => ({
      audioAvailable,
      audioReadyState,
      currentTime,
      isAudioLoading,
      isPlaying,
      totalDuration,
      currentScene,
      currentLine,
      currentWord,
      setCurrentTime,
      togglePlayback,
      playFrom,
      playScenePreview,
      pausePlayback,
    }),
    [audioAvailable, audioReadyState, currentLine, currentScene, currentTime, currentWord, isAudioLoading, isPlaying, totalDuration],
  );

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export function usePlayback() {
  const value = useContext(PlaybackContext);
  if (!value) throw new Error("usePlayback must be used inside PlaybackProvider");
  return value;
}
