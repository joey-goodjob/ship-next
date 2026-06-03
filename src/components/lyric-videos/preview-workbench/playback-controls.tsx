"use client";

import { Expand, Pause, Play, Shuffle, SkipBack, SkipForward, StepBack, StepForward, Type, Volume2, Wand2, ZoomIn, ZoomOut } from "lucide-react";
import { useEditor } from "./editor-context";
import { formatClock } from "./utils";

export function PlaybackControls() {
  const { audioAvailable, currentTime, isPlaying, setCurrentTime, setZoom, togglePlayback, totalDuration, zoom } = useEditor();

  return (
    <div className="flex h-[40px] shrink-0 items-center border-t border-[#E8E8E8] bg-[#F8F9FA] px-[16px]">
      <div className="flex w-[220px] items-center gap-[12px] text-[#666666]">
        <Expand className="h-[18px] w-[18px]" />
        <Volume2 className="h-[18px] w-[18px]" />
        <Type className="h-[18px] w-[18px]" />
      </div>

      <div className="flex flex-1 items-center justify-center gap-[14px]">
        <div className="flex items-center gap-[8px] text-[#666666]">
          <Wand2 className="h-[16px] w-[16px]" />
          <Shuffle className="h-[16px] w-[16px]" />
        </div>

        <div className="flex items-center gap-[8px] text-[#666666]">
          <button type="button" onClick={() => setCurrentTime(0)} aria-label="Jump to start">
            <SkipBack className="h-[16px] w-[16px]" />
          </button>
          <button type="button" onClick={() => setCurrentTime(currentTime - 1)} aria-label="Previous">
            <StepBack className="h-[16px] w-[16px]" />
          </button>
          <button
            type="button"
            onClick={togglePlayback}
            disabled={!audioAvailable}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-[28px] w-[28px] items-center justify-center text-[#333333] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPlaying ? <Pause className="h-[20px] w-[20px]" /> : <Play className="h-[20px] w-[20px]" />}
          </button>
          <button type="button" onClick={() => setCurrentTime(currentTime + 1)} aria-label="Next">
            <StepForward className="h-[16px] w-[16px]" />
          </button>
          <button type="button" onClick={() => setCurrentTime(totalDuration)} aria-label="Jump to end">
            <SkipForward className="h-[16px] w-[16px]" />
          </button>
        </div>

        <span className="ml-[8px] font-mono text-[13px] font-[800] text-[#444444]">
          {formatClock(currentTime, true)} / {formatClock(totalDuration, true)}
        </span>
      </div>

      <label className="flex w-[220px] items-center justify-end gap-[8px] text-[#666666]">
        <ZoomOut className="h-[16px] w-[16px]" />
        <input
          type="range"
          min="1"
          max="3"
          step="0.25"
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="w-[80px] accent-[#999999]"
          aria-label="Timeline zoom"
        />
        <ZoomIn className="h-[16px] w-[16px]" />
      </label>
    </div>
  );
}
