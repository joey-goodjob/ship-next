import type { ReactNode } from "react";
import type { ComponentType } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export function FieldBlock({
  action,
  children,
  helper,
  icon: Icon,
  label,
  locked,
  lockReason,
  surface = "plain",
}: {
  action?: ReactNode;
  children: ReactNode;
  helper?: string;
  icon?: ComponentType<{ className?: string }>;
  label: string;
  locked?: boolean;
  lockReason?: string;
  surface?: "plain" | "card";
}) {
  const cardSurface = surface === "card";

  return (
    <section
      className={cn(
        "field-block",
        cardSurface &&
          "rounded-[8px] border border-[var(--editor-line)] bg-[var(--editor-panel-soft)] px-[14px] py-[13px] shadow-[0_1px_0_rgba(255,255,255,0.04)]",
      )}
    >
      <div className={cn("mb-[10px] flex items-center justify-between gap-3", !cardSurface && "mb-[8px]")}>
        <label className="inline-flex min-w-0 items-center gap-[8px] text-[13px] font-[850] text-[var(--editor-text)]">
          {Icon ? (
            <span className="flex size-[24px] shrink-0 items-center justify-center rounded-[6px] bg-[var(--editor-panel-strong)] text-[var(--editor-accent)]">
              <Icon className="h-[14px] w-[14px]" />
            </span>
          ) : null}
          <span className="truncate">{label}</span>
          {locked ? (
            <span title={lockReason} aria-label="Locked">
              <Lock className="h-[12px] w-[12px] text-[var(--editor-muted)]" />
            </span>
          ) : null}
        </label>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
      {helper ? <p className="mt-[8px] text-[12px] font-[500] leading-5 text-[var(--editor-muted)]">{helper}</p> : null}
    </section>
  );
}
