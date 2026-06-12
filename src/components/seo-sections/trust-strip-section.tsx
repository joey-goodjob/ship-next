import { CheckCircle2 } from "lucide-react";

export function TrustStripSection({ items }: { items: string[] }) {
  return (
    <section className="border-y border-brand-line bg-brand-panel px-5 py-5">
      <div className="mx-auto grid max-w-[980px] grid-cols-2 gap-3 text-sm font-semibold leading-5 text-brand-ink lg:grid-cols-4 lg:text-base lg:leading-6">
        {items.map((item) => (
          <div key={item} className="flex items-center justify-center gap-2">
            <CheckCircle2 className="size-5 shrink-0 text-brand-accent-hover" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
