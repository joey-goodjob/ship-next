import { Users } from "lucide-react";

export function PanelEmpty({ description, title }: { description: string; title: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[8px] border border-dashed border-[#E8E8E8] bg-[#FAFAFA] px-8 text-center">
      <Users className="mb-3 size-8 text-[#F5A623]" />
      <p className="text-[14px] font-[800] text-[#1A1A2E]">{title}</p>
      <p className="mt-2 max-w-sm text-[13px] font-[500] leading-6 text-[#667085]">{description}</p>
    </div>
  );
}
