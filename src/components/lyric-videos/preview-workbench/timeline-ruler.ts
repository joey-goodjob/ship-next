import { formatClock } from "./utils";

export type TimelineRulerTick = {
  second: number;
  label: string | null;
  strength: "major" | "medium" | "minor";
};

export function buildTimelineRulerTicks({
  totalDurationSeconds,
  zoom,
}: {
  totalDurationSeconds: number;
  zoom: number;
}): TimelineRulerTick[] {
  const safeDuration = Math.max(0, Math.ceil(totalDurationSeconds || 0));
  const labelStep = zoom >= 2 || safeDuration <= 30 ? 5 : 10;

  return Array.from({ length: safeDuration + 1 }, (_, second) => {
    const hasLabel = second % labelStep === 0;
    const strength = hasLabel ? "major" : second % 5 === 0 ? "medium" : "minor";

    return {
      second,
      label: hasLabel ? formatClock(second) : null,
      strength,
    };
  });
}
