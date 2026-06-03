"use client";

import { useRef } from "react";
import type { PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { clamp, formatClock, msToSeconds } from "./utils";

export function Timeline({ height }: { height: number }) {
  const { currentScene, currentTime, currentWord, lines, scenes, setCurrentTime, totalDuration, words, zoom } = useEditor();
  const timelineRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const trackWidth = `${Math.max(100, zoom * 100)}%`;
  const playheadPct = (currentTime / totalDuration) * 100;
  const ticks = Array.from({ length: Math.floor(totalDuration) + 1 }, (_, index) => index);
  const rulerHeight = 22;
  const sceneTop = 24;
  const sceneHeight = clamp(Math.round(height * 0.42), 32, 72);
  const lyricTop = sceneTop + sceneHeight + 8;
  const lyricHeight = Math.max(18, height - lyricTop - 6);

  function secondsAt(clientX: number) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return (clamp(clientX - rect.left, 0, rect.width) / rect.width) * totalDuration;
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setCurrentTime(secondsAt(event.clientX));
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    setCurrentTime(secondsAt(event.clientX));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className="shrink-0 overflow-x-auto bg-[#FAFAFA]" style={{ height }}>
      <div
        ref={timelineRef}
        className="relative h-full min-w-full touch-none"
        style={{ width: trackWidth }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="absolute left-0 right-0 top-0" style={{ height: rulerHeight }}>
          {ticks.map((tick) => (
            <div
              key={tick}
              className="absolute top-0 flex h-[20px] -translate-x-1/2 flex-col items-center"
              style={{ left: `${(tick / totalDuration) * 100}%` }}
            >
              <span className="font-mono text-[11px] leading-[13px] text-[#888888]">{formatClock(tick)}</span>
              <span className="mt-[2px] h-[4px] w-[1px] bg-[#CCCCCC]" />
            </div>
          ))}
        </div>

        <div className="absolute left-0 right-0" style={{ top: sceneTop, height: sceneHeight }}>
          {scenes.length === 0 ? (
            <div className="absolute inset-x-0 top-0 bg-[#E9EDF3]" style={{ height: sceneHeight }} />
          ) : (
            scenes.map((scene) => {
              const left = (msToSeconds(scene.startMs) / totalDuration) * 100;
              const width = ((scene.endMs - scene.startMs) / 1000 / totalDuration) * 100;
              const active = currentScene?.id === scene.id;
              return (
                <div
                  key={scene.id}
                  className={cn("absolute top-0 overflow-hidden border-r border-white", active ? "outline outline-[2px] outline-[#F5A623]" : "")}
                  style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%`, height: sceneHeight }}
                >
                  {scene.imageUrl ? (
                    <img src={scene.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#E8EEF7] text-[10px] font-[800] uppercase text-[#8A94A6]">
                      {scene.status}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="absolute left-0 right-0" style={{ top: lyricTop, height: lyricHeight }}>
          <div className="absolute inset-x-0 top-[13px] h-[1px] bg-[#DDE8F4]" />
          {(words.length > 0 ? words : lines).map((item, index) => {
            const active = "word" in item && currentWord?.id === item.id;
            const left = (msToSeconds(item.startMs) / totalDuration) * 100;
            const width = ((item.endMs - item.startMs) / 1000 / totalDuration) * 100;
            return (
              <span
                key={item.id || index}
                className={cn(
                  "absolute top-[5px] min-w-[2px] rounded-[2px]",
                  words.length > 0 ? "bg-[#4A90D9]/75" : "bg-[#4A90D9]/70",
                  active ? "outline outline-[2px] outline-[#F5A623]" : "",
                )}
                style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%`, height: Math.min(16, lyricHeight - 8) }}
              />
            );
          })}
        </div>

        <div className="absolute bottom-0 top-0 w-[2px] bg-[#E53935]" style={{ left: `${playheadPct}%` }}>
          <span className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[10px] border-x-transparent border-t-[#E53935]" />
        </div>
      </div>
    </div>
  );
}
