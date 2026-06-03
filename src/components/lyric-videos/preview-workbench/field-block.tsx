import type { ReactNode } from "react";

export function FieldBlock({
  action,
  children,
  helper,
  label,
}: {
  action?: ReactNode;
  children: ReactNode;
  helper?: string;
  label: string;
}) {
  return (
    <section>
      <div className="mb-[8px] flex items-center justify-between gap-3">
        <label className="text-[13px] font-[800] text-[#334155]">{label}</label>
        {action}
      </div>
      {children}
      {helper ? <p className="mt-[8px] text-[12px] font-[500] leading-5 text-[#667085]">{helper}</p> : null}
    </section>
  );
}
