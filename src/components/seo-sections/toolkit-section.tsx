import Image from "next/image";
import { CirclePlay, Layers3, Upload, WandSparkles } from "lucide-react";
import type { SeoPageContent } from "@/lib/seo-pages";
import { SectionHeading } from "./section-heading";

const USE_CASE_ICONS = [CirclePlay, Layers3, WandSparkles, Upload] as const;

export function ToolkitSection({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: NonNullable<SeoPageContent["useCases"]>;
}) {
  return (
    <section className="px-5 py-[70px] lg:py-[120px]">
      <div className="mx-auto max-w-[1180px]">
        <SectionHeading title={title} description={description} />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {items.map((item, index) => {
            const Icon = USE_CASE_ICONS[index % USE_CASE_ICONS.length];
            return (
              <article key={item.title} className="rounded-md border border-brand-line bg-brand-panel p-5 shadow-sm">
                {item.image ? (
                  <div className="relative mb-5 aspect-video overflow-hidden rounded-md">
                    <Image
                      src={item.image}
                      alt={item.title}
                      fill
                      sizes="(min-width: 1024px) 280px, (min-width: 768px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="mb-5 flex aspect-video items-center justify-center rounded-md bg-brand-stage-gradient text-brand-panel">
                    <Icon className="size-12 drop-shadow" />
                  </div>
                )}
                <h3 className="text-base font-semibold leading-6 text-brand-ink lg:text-xl lg:leading-7">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm font-normal leading-5 text-brand-muted">{item.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
