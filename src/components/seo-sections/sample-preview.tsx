import { Film } from "lucide-react";

export function SamplePreview() {
  return (
    <div className="relative aspect-video overflow-hidden rounded-md border border-brand-line bg-brand-stage-gradient shadow-[0_22px_70px_var(--brand-elevation-shadow-soft)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.38),transparent_24%),linear-gradient(120deg,transparent,rgba(255,255,255,0.2),transparent)]" />
      <div className="absolute inset-x-5 bottom-5 rounded-md bg-black/42 p-4 text-white backdrop-blur">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="h-2 w-24 rounded-full bg-white/80" />
          <span className="h-2 w-12 rounded-full bg-white/45" />
        </div>
        <div className="space-y-2">
          <span className="block h-3 w-full rounded-full bg-white/92" />
          <span className="block h-3 w-4/5 rounded-full bg-white/62" />
          <span className="block h-3 w-2/3 rounded-full bg-white/42" />
        </div>
      </div>
      <div className="absolute left-5 top-5 flex size-9 items-center justify-center rounded-md bg-brand-panel/90 text-brand-accent-hover shadow-sm">
        <Film className="size-3.5 text-brand-accent-hover" />
      </div>
    </div>
  );
}
