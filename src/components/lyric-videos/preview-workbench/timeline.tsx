"use client";

import { memo, useMemo, useRef } from "react";
import type { PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { usePlayback } from "./playback-context";
import type { LyricLine, LyricScene, LyricWord } from "./types";
import { clamp, formatClock, msToSeconds } from "./utils";

export function Timeline({ height }: { height: number }) {
  const { lines, scenes, words, zoom } = useEditor();
  const { currentScene, currentTime, currentWord, setCurrentTime, totalDuration } = usePlayback();
  const timelineRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const trackWidth = `${Math.max(100, zoom * 100)}%`;
  const playheadPct = (currentTime / totalDuration) * 100;
  const ticks = useMemo(() => Array.from({ length: Math.floor(totalDuration) + 1 }, (_, index) => index), [totalDuration]);
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
    <div className="timeline shrink-0 overflow-x-auto bg-[var(--editor-panel-soft)]" style={{ height }}>
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
              <span className="font-mono text-[11px] leading-[13px] text-[var(--editor-subtle)]">{formatClock(tick)}</span>
              <span className="mt-[2px] h-[4px] w-[1px] bg-[var(--editor-line)]" />
            </div>
          ))}
        </div>

        <div className="absolute left-0 right-0" style={{ top: sceneTop, height: sceneHeight }}>
          <TimelineScenes scenes={scenes} activeSceneId={currentScene?.id} totalDuration={totalDuration} sceneHeight={sceneHeight} />
        </div>

        <div className="absolute left-0 right-0" style={{ top: lyricTop, height: lyricHeight }}>
          <div className="absolute inset-x-0 top-[13px] h-[1px] bg-[var(--editor-line)]" />
          <TimelineWords
            items={words.length > 0 ? words : lines}
            activeWordId={currentWord?.id}
            hasWords={words.length > 0}
            totalDuration={totalDuration}
            lyricHeight={lyricHeight}
          />
        </div>

        <div className="absolute bottom-0 top-0 w-[2px] bg-[var(--editor-danger)]" style={{ left: `${playheadPct}%` }}>
          <span className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[10px] border-x-transparent border-t-[var(--editor-danger)]" />
        </div>
      </div>
    </div>
  );
}

const TimelineScenes = memo(function TimelineScenes({
  activeSceneId,
  sceneHeight,
  scenes,
  totalDuration,
}: {
  activeSceneId?: string;
  sceneHeight: number;
  scenes: LyricScene[];
  totalDuration: number;
}) {
  if (scenes.length === 0) {
    return <div className="absolute inset-x-0 top-0 bg-[var(--editor-panel-strong)]" style={{ height: sceneHeight }} />;
  }
  return scenes.map((scene) => {
    const left = (msToSeconds(scene.startMs) / totalDuration) * 100;
    const width = ((scene.endMs - scene.startMs) / 1000 / totalDuration) * 100;
    const active = activeSceneId === scene.id;
    return (
      <div
        key={scene.id}
        className={cn("absolute top-0 overflow-hidden border-r border-[var(--editor-bg)]", active ? "outline outline-[2px] outline-[var(--editor-accent)]" : "")}
        style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%`, height: sceneHeight }}
      >
        {scene.imageUrl ? (
          <img src={scene.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[var(--editor-panel-strong)] text-[10px] font-[800] uppercase text-[var(--editor-subtle)]">
            {scene.status}
          </div>
        )}
      </div>
    );
  });
});

const TimelineWords = memo(function TimelineWords({
  activeWordId,
  hasWords,
  items,
  lyricHeight,
  totalDuration,
}: {
  activeWordId?: string;
  hasWords: boolean;
  items: Array<LyricWord | LyricLine>;
  lyricHeight: number;
  totalDuration: number;
}) {
  return items.map((item, index) => {
    const active = "word" in item && activeWordId === item.id;
    const left = (msToSeconds(item.startMs) / totalDuration) * 100;
    const width = ((item.endMs - item.startMs) / 1000 / totalDuration) * 100;
    return (
      <span
        key={item.id || index}
        className={cn(
          "absolute top-[5px] min-w-[2px] rounded-[2px]",
          hasWords ? "bg-[var(--editor-accent)]/75" : "bg-[var(--editor-accent)]/70",
          active ? "outline outline-[2px] outline-[var(--editor-accent)]" : "",
        )}
        style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%`, height: Math.min(16, lyricHeight - 8) }}
      />
    );
  });
});
