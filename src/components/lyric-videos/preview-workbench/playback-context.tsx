"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import type { LyricLine, LyricScene, LyricVideoProject, LyricWord } from "./types";
import { clamp, msToSeconds, secondsToMs } from "./utils";

type PlaybackContextValue = {
  audioAvailable: boolean;
  currentTime: number;
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
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scenePreviewEndRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastUiUpdateRef = useRef(0);
  const latestPlaybackRef = useRef({ currentTime: 0, isPlaying: false, totalDuration });
  const audioSrc = project?.processedAudioUrl || project?.audioUrl || project?.originalAudioUrl || "";
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

  useEffect(() => {
    if (!audioSrc) {
      audioRef.current?.pause();
      audioRef.current = null;
      scenePreviewEndRef.current = null;
      setIsPlaying(false);
      setCurrentTimeState(0);
      return;
    }

    const audio = new Audio(audioSrc);
    audio.preload = "auto";
    audio.currentTime = clamp(latestPlaybackRef.current.currentTime, 0, totalDuration);
    audioRef.current = audio;

    function applyAudioTime(force = false) {
      const now = performance.now();
      const nextTime = Number(clamp(audio.currentTime || 0, 0, totalDuration).toFixed(3));
      const sceneEnd = scenePreviewEndRef.current;
      if (sceneEnd !== null && nextTime >= sceneEnd) {
        audio.currentTime = sceneEnd;
        setCurrentTimeState(Number(sceneEnd.toFixed(3)));
        scenePreviewEndRef.current = null;
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
      });
    }

    function handlePlay() {
      setIsPlaying(true);
      scheduleAudioTime(true);
    }

    function handlePause() {
      setIsPlaying(false);
      scheduleAudioTime(true);
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

    audio.addEventListener("timeupdate", () => scheduleAudioTime(false));
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadedmetadata", () => scheduleAudioTime(true));
    audio.addEventListener("seeking", () => scheduleAudioTime(true));
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      audioRef.current = audioRef.current === audio ? null : audioRef.current;
    };
  }, [audioSrc, totalDuration]);

  useEffect(() => {
    if (currentTime > totalDuration) {
      setCurrentTime(totalDuration);
    }
  }, [currentTime, totalDuration]);

  useEffect(() => {
    return () => {
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
      currentTime,
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
    [audioAvailable, currentLine, currentScene, currentTime, currentWord, isPlaying, totalDuration],
  );

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export function usePlayback() {
  const value = useContext(PlaybackContext);
  if (!value) throw new Error("usePlayback must be used inside PlaybackProvider");
  return value;
}
