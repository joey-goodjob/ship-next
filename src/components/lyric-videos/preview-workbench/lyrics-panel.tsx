"use client";

import { useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { AlertCircle, FileText, Loader2, MoreVertical, Pause, Play, Plus, Save, StepBack, StepForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { LYRIC_FRAME_RATE } from "./constants";
import { useEditor } from "./editor-context";
import { usePlayback } from "./playback-context";
import type { LyricScene, LyricWord } from "./types";
import {
  clamp,
  formatClock,
  formatMs,
  frameToMs,
  lineOverlapsRange,
  msToFrame,
  msToSeconds,
  secondsToMs,
  wordId,
  wordOverlapsRange,
} from "./utils";

export function LyricsPanel() {
  const {
    lines,
    lyricsDirty,
    project,
    saveLyrics,
    scenes,
    setWords,
    words,
  } = useEditor();
  const {
    currentLine,
    currentScene,
    currentTime,
    currentWord,
    isPlaying,
    pausePlayback,
    playScenePreview,
    setCurrentTime,
    totalDuration,
  } = usePlayback();
  const [openWordMenuId, setOpenWordMenuId] = useState<string | null>(null);
  const lyricsProcessing = project?.lyricsStatus === "processing";
  const lyricsFailed = project?.lyricsStatus === "failed";
  const projectEndMs = secondsToMs(totalDuration);
  const segmentStartMs = currentScene?.startMs ?? 0;
  const segmentEndMs = Math.max(segmentStartMs + 1, currentScene?.endMs ?? projectEndMs);
  const maxFrame = msToFrame(Math.max(1, segmentEndMs - segmentStartMs));
  const visibleWords = currentScene ? words.filter((word) => wordOverlapsRange(word, segmentStartMs, segmentEndMs)) : words;
  const sceneIndex = currentScene ? scenes.findIndex((scene) => scene.id === currentScene.id) : -1;
  const previousScene = sceneIndex > 0 ? scenes[sceneIndex - 1] : undefined;
  const nextScene = sceneIndex >= 0 && sceneIndex < scenes.length - 1 ? scenes[sceneIndex + 1] : undefined;
  const sceneLines = currentScene ? lines.filter((line) => lineOverlapsRange(line, segmentStartMs, segmentEndMs)) : lines;
  const sceneText =
    currentScene?.text?.trim() ||
    visibleWords
      .map((word) => word.word.trim())
      .filter(Boolean)
      .join(" ") ||
    sceneLines
      .map((line) => line.text.trim())
      .filter(Boolean)
      .join(" ");
  const invalidWords = words.filter((word) => !word.word.trim() || msToFrame(word.endMs) <= msToFrame(word.startMs));
  const invalidSceneWords = visibleWords.filter((word) => !word.word.trim() || msToFrame(word.endMs) <= msToFrame(word.startMs));
  const invalidHiddenWords = invalidWords.length - invalidSceneWords.length;
  const canSaveLyrics = lyricsDirty && lines.length > 0 && words.length > 0 && invalidSceneWords.length === 0;

  function goToScene(scene?: LyricScene) {
    if (!scene) return;
    setOpenWordMenuId(null);
    setCurrentTime(msToSeconds(scene.startMs));
  }

  async function saveAndNext() {
    const saved = await saveLyrics();
    if (saved && nextScene) setCurrentTime(msToSeconds(nextScene.startMs));
  }

  function wordFrame(ms: number) {
    return clamp(msToFrame(ms - segmentStartMs), 0, maxFrame);
  }

  function frameMs(frame: number) {
    return clamp(segmentStartMs + frameToMs(frame), segmentStartMs, segmentEndMs);
  }

  function updateWord(wordId: string, patch: Partial<LyricWord>) {
    setOpenWordMenuId(null);
    setWords(words.map((word) => (word.id === wordId ? { ...word, ...patch } : word)));
  }

  function updateWordFrame(wordIdValue: string, key: "startMs" | "endMs", rawValue: string | number) {
    setOpenWordMenuId(null);
    const frame = clamp(Math.round(Number(rawValue) || 0), 0, Math.max(1, maxFrame));
    setWords(
      words.map((word) => {
        if (word.id !== wordIdValue) return word;
        const currentStartFrame = wordFrame(word.startMs);
        const currentEndFrame = wordFrame(word.endMs);
        if (key === "startMs") {
          const startFrame = clamp(frame, 0, Math.max(0, currentEndFrame - 1));
          return { ...word, startMs: frameMs(startFrame) };
        }
        const endFrame = clamp(frame, currentStartFrame + 1, Math.max(currentStartFrame + 1, maxFrame));
        return { ...word, endMs: frameMs(endFrame) };
      }),
    );
  }

  function nudgeWordFrame(word: LyricWord, key: "startMs" | "endMs", delta: number) {
    updateWordFrame(word.id, key, wordFrame(word[key]) + delta);
  }

  function addWord() {
    setOpenWordMenuId(null);
    const baseLine =
      sceneLines.find((line) => currentTime >= msToSeconds(line.startMs) && currentTime < msToSeconds(line.endMs)) ||
      currentLine ||
      sceneLines[0] ||
      lines[lines.length - 1];
    const preferredStartMs = currentWord?.endMs ?? secondsToMs(currentTime);
    const baseStartMs = clamp(preferredStartMs, segmentStartMs, Math.max(segmentStartMs, segmentEndMs - 1));
    const baseStartFrame = wordFrame(baseStartMs);
    const startFrame = clamp(baseStartFrame, 0, Math.max(0, maxFrame - 1));
    const endFrame = clamp(startFrame + Math.max(1, Math.round(LYRIC_FRAME_RATE * 0.4)), startFrame + 1, Math.max(startFrame + 1, maxFrame));
    const nextWord: LyricWord = {
      id: wordId(words.length),
      lineId: baseLine?.id || null,
      word: "word",
      startMs: frameMs(startFrame),
      endMs: frameMs(endFrame),
      sort: words.length,
    };
    setWords([...words, nextWord]);
    setCurrentTime(msToSeconds(nextWord.startMs));
  }

  function deleteWord(wordIdValue: string) {
    setWords(words.filter((word) => word.id !== wordIdValue));
    setOpenWordMenuId(null);
  }

  return (
    <div className="flex flex-col gap-[16px]" onClick={() => setOpenWordMenuId(null)}>
      {currentScene ? (
        <div className="rounded-[8px] border border-[#DDE5EF] bg-[#F8FBFF] p-[10px]">
          <div className="flex items-start justify-between gap-[10px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-[8px]">
                <span className="text-[14px] font-[900] text-[#1A1A2E]">Scene {sceneIndex + 1}</span>
                <span className="rounded-full border border-[#D8E2EE] bg-white px-[7px] py-[2px] font-mono text-[11px] font-[800] text-[#61708A]">
                  {formatMs(segmentStartMs)} - {formatMs(segmentEndMs)}
                </span>
                <span className="text-[11px] font-[800] text-[#8A94A6]">
                  {visibleWords.length} {visibleWords.length === 1 ? "word" : "words"}
                </span>
              </div>
              <p className="mt-[6px] max-h-[40px] overflow-hidden text-[12px] font-[700] leading-5 text-[#4E6384]">
                {sceneText || "No recognized words in this scene yet."}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-[6px]">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  goToScene(previousScene);
                }}
                disabled={!previousScene}
                aria-label="Previous scene"
                className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] border border-[#CAD3DF] bg-white text-[#61708A] hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <StepBack className="h-[14px] w-[14px]" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  goToScene(nextScene);
                }}
                disabled={!nextScene}
                aria-label="Next scene"
                className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] border border-[#CAD3DF] bg-white text-[#61708A] hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <StepForward className="h-[14px] w-[14px]" />
              </button>
            </div>
          </div>

          <div className="mt-[10px] flex flex-wrap justify-end gap-[8px]">
            <button
              type="button"
              onClick={saveLyrics}
              disabled={!canSaveLyrics}
              className="inline-flex h-[32px] items-center gap-[7px] rounded-[6px] border border-[#CAD3DF] bg-white px-[10px] text-[12px] font-[800] text-[#334155] hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save className="h-[14px] w-[14px]" />
              Save
            </button>
            <button
              type="button"
              onClick={saveAndNext}
              disabled={!canSaveLyrics || !nextScene}
              className="inline-flex h-[32px] items-center gap-[7px] rounded-[6px] bg-[#1A1A2E] px-[10px] text-[12px] font-[800] text-white hover:bg-[#2D2D44] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save &amp; Next
              <StepForward className="h-[14px] w-[14px]" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={saveLyrics}
            disabled={!canSaveLyrics}
            className="inline-flex h-[32px] items-center gap-[7px] rounded-[6px] border border-[#CAD3DF] bg-white px-[10px] text-[12px] font-[800] text-[#334155] hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save className="h-[14px] w-[14px]" />
            Save
          </button>
        </div>
      )}

      {lyricsProcessing ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[8px] border border-dashed border-[#E8E8E8] bg-[#FAFAFA] px-8 text-center">
          <Loader2 className="mb-3 size-8 animate-spin text-[#F5A623]" />
          <p className="text-[14px] font-[800] text-[#1A1A2E]">Preparing lyrics</p>
          <p className="mt-2 max-w-sm text-[13px] font-[500] leading-6 text-[#667085]">
            The selected audio clip is being trimmed and transcribed.
          </p>
        </div>
      ) : lyricsFailed ? (
        <div className="rounded-[8px] border border-red-200 bg-red-50 p-[14px] text-red-700">
          <div className="flex items-center gap-[8px] text-[13px] font-[800]">
            <AlertCircle className="h-[15px] w-[15px]" />
            Lyrics generation failed
          </div>
          <p className="mt-[8px] text-[12px] font-[600] leading-5">{project?.pipelineError || "Please try uploading the clip again."}</p>
        </div>
      ) : lines.length === 0 ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[8px] border border-dashed border-[#E8E8E8] bg-[#FAFAFA] px-8 text-center">
          <FileText className="mb-3 size-8 text-[#F5A623]" />
          <p className="text-[14px] font-[800] text-[#1A1A2E]">No lyrics yet</p>
          <p className="mt-2 max-w-sm text-[13px] font-[500] leading-6 text-[#667085]">
            Upload an audio clip first, then ElevenLabs will generate timed lyrics here.
          </p>
        </div>
      ) : null}

      {words.length > 0 ? (
        <>
          <LyricsMiniWaveform
            currentTime={currentTime}
            currentWord={currentWord}
            isPlaying={isPlaying}
            onPlayScene={() => playScenePreview(msToSeconds(segmentStartMs), msToSeconds(segmentEndMs))}
            onPause={pausePlayback}
            segmentEndMs={segmentEndMs}
            segmentStartMs={segmentStartMs}
            setCurrentTime={setCurrentTime}
            words={visibleWords}
          />

          <div className="mx-auto w-full max-w-[560px]">
            <div className="grid grid-cols-[minmax(132px,1fr)_142px_142px_36px] gap-[8px] px-[2px] pb-[8px] text-[12px] font-[800] text-[#405372] max-[560px]:grid-cols-[minmax(116px,1fr)_112px_112px_34px]">
              <span>Word</span>
              <span>Start Frame</span>
              <span>End Frame</span>
              <span />
            </div>

            <div className="flex flex-col gap-[7px]">
              {visibleWords.map((word) => {
              const active = currentWord?.id === word.id;
              const invalid = !word.word.trim() || msToFrame(word.endMs) <= msToFrame(word.startMs);
              return (
                <div
                  key={word.id}
                  onClick={() => setCurrentTime(msToSeconds(word.startMs))}
                  className={cn(
                    "grid grid-cols-[minmax(132px,1fr)_142px_142px_36px] items-center gap-[8px] rounded-[6px] outline-none max-[560px]:grid-cols-[minmax(116px,1fr)_112px_112px_34px]",
                    active ? "bg-[#FFF8EB]" : "hover:bg-[#F8F9FA]",
                    invalid ? "border-red-300 bg-red-50" : "",
                  )}
                >
                  <input
                    value={word.word}
                    onChange={(event) => updateWord(word.id, { word: event.target.value })}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`${word.word || "word"} text`}
                    className={cn(
                      "h-[36px] min-w-0 rounded-[5px] border bg-white px-[10px] text-[13px] font-[700] text-[#26364E] outline-none focus:border-[#F5A623]",
                      active ? "border-[#F5A623]" : "border-[#CAD3DF]",
                      invalid ? "border-red-300" : "",
                    )}
                  />
                  <WordFrameStepper
                    label={`${word.word || "word"} start frame`}
                    max={maxFrame}
                    min={0}
                    value={wordFrame(word.startMs)}
                    onChange={(value) => updateWordFrame(word.id, "startMs", value)}
                    onStep={(delta) => nudgeWordFrame(word, "startMs", delta)}
                  />
                  <WordFrameStepper
                    label={`${word.word || "word"} end frame`}
                    max={maxFrame}
                    min={1}
                    value={wordFrame(word.endMs)}
                    onChange={(value) => updateWordFrame(word.id, "endMs", value)}
                    onStep={(delta) => nudgeWordFrame(word, "endMs", delta)}
                  />
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenWordMenuId(openWordMenuId === word.id ? null : word.id);
                      }}
                      aria-label={`${word.word || "word"} actions`}
                      className="flex h-[36px] w-[34px] items-center justify-center rounded-[5px] border border-[#CAD3DF] bg-white text-[#61708A] hover:bg-[#F8F9FA]"
                    >
                      <MoreVertical className="h-[15px] w-[15px]" />
                    </button>
                    {openWordMenuId === word.id ? (
                      <div
                        className="absolute right-0 top-[40px] z-20 w-[112px] rounded-[6px] border border-[#DDE5EF] bg-white p-[4px] shadow-[0_8px_20px_rgba(15,23,42,0.12)]"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => deleteWord(word.id)}
                          className="flex h-[30px] w-full items-center rounded-[4px] px-[8px] text-left text-[12px] font-[800] text-red-600 hover:bg-red-50"
                        >
                          Delete word
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
              })}
            </div>

            {visibleWords.length === 0 ? (
              <div className="rounded-[8px] border border-[#E8E8E8] bg-[#FAFAFA] p-[14px] text-center text-[13px] font-[700] leading-6 text-[#667085]">
                No words in this scene yet. Add a word to start timing this section.
              </div>
            ) : null}
          </div>

          {invalidSceneWords.length > 0 ? (
            <p className="mx-auto w-full max-w-[560px] rounded-[6px] border border-red-200 bg-red-50 px-[10px] py-[8px] text-[12px] font-[700] leading-5 text-red-700">
              Fix empty words and frame ranges in this scene before saving.
            </p>
          ) : null}
          {invalidSceneWords.length === 0 && invalidHiddenWords > 0 ? (
            <p className="mx-auto w-full max-w-[560px] rounded-[6px] border border-amber-200 bg-amber-50 px-[10px] py-[8px] text-[12px] font-[700] leading-5 text-amber-800">
              {invalidHiddenWords} issue{invalidHiddenWords === 1 ? "" : "s"} in other scenes will not block this scene.
            </p>
          ) : null}
        </>
      ) : lines.length > 0 && !lyricsProcessing ? (
        <div className="rounded-[8px] border border-[#E8E8E8] bg-[#FAFAFA] p-[14px] text-[13px] font-[600] leading-6 text-[#667085]">
          This project has line-level lyrics only. Add a word to start frame-level timing.
        </div>
      ) : null}

      <button
        type="button"
        onClick={addWord}
        disabled={lines.length === 0 || maxFrame <= 1}
        className="mx-auto inline-flex h-[34px] items-center gap-[7px] rounded-[6px] border border-[#CAD3DF] bg-white px-[12px] text-[13px] font-[800] text-[#334155] hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-[14px] w-[14px]" />
        Add word
      </button>
    </div>
  );
}

function LyricsMiniWaveform({
  currentTime,
  currentWord,
  isPlaying,
  onPause,
  onPlayScene,
  segmentEndMs,
  segmentStartMs,
  setCurrentTime,
  words,
}: {
  currentTime: number;
  currentWord?: LyricWord;
  isPlaying: boolean;
  onPause: () => void;
  onPlayScene: () => void;
  segmentEndMs: number;
  segmentStartMs: number;
  setCurrentTime: (time: number) => void;
  words: LyricWord[];
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const durationMs = Math.max(1, segmentEndMs - segmentStartMs);
  const playheadPct = clamp(((secondsToMs(currentTime) - segmentStartMs) / durationMs) * 100, 0, 100);
  const bars = useMemo(
    () =>
      Array.from({ length: 96 }, (_, index) => {
        const wave = Math.sin(index * 0.58) * 0.35 + Math.sin(index * 1.17) * 0.22 + Math.sin(index * 0.19) * 0.18;
        return clamp(28 + Math.abs(wave) * 52 + ((index * 13) % 17), 24, 86);
      }),
    [],
  );
  const tickCount = clamp(Math.ceil(durationMs / 1000), 1, 4);
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => index / tickCount);

  function seekFromClientX(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const pct = clamp((clientX - rect.left) / rect.width, 0, 1);
    setCurrentTime(msToSeconds(segmentStartMs + durationMs * pct));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromClientX(event.clientX);
  }

  function pctForMs(ms: number) {
    return clamp(((ms - segmentStartMs) / durationMs) * 100, 0, 100);
  }

  return (
    <div className="rounded-[6px] border border-[#DDE5EF] bg-white p-[8px]">
      <div className="flex items-stretch gap-[8px]">
        <button
          type="button"
          onClick={() => (isPlaying ? onPause() : onPlayScene())}
          aria-label={isPlaying ? "Pause lyrics" : "Play lyrics"}
          className="flex h-[54px] w-[42px] shrink-0 items-center justify-center rounded-[6px] border border-[#D8E2EE] bg-white text-[#405372] hover:bg-[#F8F9FA]"
        >
          {isPlaying ? <Pause className="h-[20px] w-[20px]" /> : <Play className="h-[20px] w-[20px]" />}
        </button>
        <div
          ref={trackRef}
          className="relative h-[54px] flex-1 touch-none overflow-hidden rounded-[5px] border border-[#D8E2EE] bg-[#F4F8FF]"
          onPointerDown={handlePointerDown}
        >
          <div className="absolute inset-x-0 top-1/2 flex h-[42px] -translate-y-1/2 items-center gap-[2px] px-[2px]">
            {bars.map((height, index) => (
              <span key={index} className="flex-1 rounded-full bg-[#69A9FF]" style={{ height: `${height}%` }} />
            ))}
          </div>

          {words.map((word) => {
            const left = pctForMs(word.startMs);
            const right = pctForMs(word.endMs);
            const active = currentWord?.id === word.id;
            return (
              <button
                key={word.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setCurrentTime(msToSeconds(word.startMs));
                }}
                className={cn(
                  "absolute top-[4px] h-[46px] overflow-hidden rounded-[4px] border px-[6px] text-left text-[12px] font-[800] leading-[46px] text-[#37506F] outline-none",
                  active ? "border-[#F5A623] bg-[#E6F1FF]/95 text-[#1F3350]" : "border-[#74ADF3] bg-[#BFD9FF]/72 hover:bg-[#D9E9FF]",
                )}
                style={{ left: `${left}%`, width: `${Math.max(5, right - left)}%` }}
              >
                <span className="block truncate">{word.word || "word"}</span>
              </button>
            );
          })}

          <div className="absolute bottom-0 top-0 z-10 w-[2px] bg-[#FF4757]" style={{ left: `${playheadPct}%` }}>
            <span className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[9px] border-x-transparent border-t-[#FF4757]" />
          </div>
        </div>
      </div>

      <div className="ml-[50px] mt-[6px] flex justify-between font-mono text-[11px] font-[700] text-[#61708A]">
        {ticks.map((tick) => (
          <span key={tick}>{formatClock((durationMs * tick) / 1000, true)}</span>
        ))}
      </div>
    </div>
  );
}

function WordFrameStepper({
  label,
  max,
  min,
  onChange,
  onStep,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: string) => void;
  onStep: (delta: number) => void;
  value: number;
}) {
  return (
    <div className="flex h-[36px] min-w-0 overflow-hidden rounded-[5px] border border-[#CAD3DF] bg-white">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onStep(-1);
        }}
        disabled={value <= min}
        aria-label={`${label} decrease`}
        className="flex w-[30px] shrink-0 items-center justify-center border-r border-[#DDE5EF] text-[#8AA0BC] hover:bg-[#F8F9FA] disabled:opacity-35"
      >
        <StepBack className="h-[14px] w-[14px]" />
      </button>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        aria-label={label}
        className="h-full min-w-0 flex-1 border-0 bg-white px-[8px] font-mono text-[13px] font-[800] text-[#26364E] outline-none focus:bg-[#FFF8EB]"
      />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onStep(1);
        }}
        disabled={value >= max}
        aria-label={`${label} increase`}
        className="flex w-[30px] shrink-0 items-center justify-center border-l border-[#DDE5EF] text-[#8AA0BC] hover:bg-[#F8F9FA] disabled:opacity-35"
      >
        <StepForward className="h-[14px] w-[14px]" />
      </button>
    </div>
  );
}
