import type { ReactNode } from "react";
import { Lock } from "lucide-react";

export function FieldBlock({
  action,
  children,
  helper,
  label,
  locked,
  lockReason,
}: {
  action?: ReactNode;
  children: ReactNode;
  helper?: string;
  label: string;
  locked?: boolean;
  lockReason?: string;
}) {
  return (
    <section>
      <div className="mb-[8px] flex items-center justify-between gap-3">
        <label className="inline-flex items-center gap-[5px] text-[13px] font-[800] text-[#334155]">
          {label}
          {locked ? (
            <span title={lockReason} aria-label="Locked">
              <Lock className="h-[12px] w-[12px] text-[#61708A]" />
            </span>
          ) : null}
        </label>
        {action}
      </div>
      {children}
      {helper ? <p className="mt-[8px] text-[12px] font-[500] leading-5 text-[#667085]">{helper}</p> : null}
    </section>
  );
}
