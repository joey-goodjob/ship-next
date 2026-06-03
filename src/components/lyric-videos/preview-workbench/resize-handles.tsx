import type { PointerEvent } from "react";

export function VerticalResizeHandle({ onPointerDown }: { onPointerDown: (event: PointerEvent<HTMLDivElement>) => void }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize side panel"
      tabIndex={0}
      onPointerDown={onPointerDown}
      className="group relative z-10 h-full w-[8px] shrink-0 cursor-col-resize bg-transparent"
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#E8E8E8] transition group-hover:bg-[#F5A623]" />
      <span className="absolute left-1/2 top-1/2 h-[46px] w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#D6DCE5] opacity-0 transition group-hover:opacity-100" />
    </div>
  );
}

export function HorizontalResizeHandle({ onPointerDown }: { onPointerDown: (event: PointerEvent<HTMLDivElement>) => void }) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize timeline"
      tabIndex={0}
      onPointerDown={onPointerDown}
      className="group relative z-10 h-[8px] shrink-0 cursor-row-resize bg-white"
    >
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[#E8E8E8] transition group-hover:bg-[#F5A623]" />
      <span className="absolute left-1/2 top-1/2 h-[4px] w-[56px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#D6DCE5] opacity-0 transition group-hover:opacity-100" />
    </div>
  );
}
