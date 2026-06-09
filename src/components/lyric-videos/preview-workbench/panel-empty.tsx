import { Users } from "lucide-react";

export function PanelEmpty({ description, title }: { description: string; title: string }) {
  return (
    <div className="panel-empty flex min-h-[220px] flex-col items-center justify-center rounded-[8px] border border-dashed border-[var(--editor-line)] bg-[var(--editor-panel-soft)] px-8 text-center">
      <Users className="mb-3 size-8 text-[var(--editor-accent)]" />
      <p className="text-[14px] font-[800] text-[var(--editor-text)]">{title}</p>
      <p className="mt-2 max-w-sm text-[13px] font-[500] leading-6 text-[var(--editor-muted)]">{description}</p>
    </div>
  );
}
