import { Upload } from "lucide-react";
import Image from "next/image";
import type { SeoPageContent } from "@/lib/seo-pages";
import { SectionHeading } from "./section-heading";

function StepImagePreview({
  image,
  title,
  index,
}: {
  image?: string;
  title: string;
  index: number;
}) {
  if (image) {
    return (
      <div className="relative mb-5 aspect-[16/9] overflow-hidden rounded-md border border-brand-line bg-brand-stage-gradient">
        <Image
          src={image}
          alt={title}
          fill
          unoptimized
          sizes="(min-width: 768px) 33vw, 100vw"
          className="object-cover"
        />
        <div className="absolute left-3 top-3 flex size-8 items-center justify-center rounded-md bg-brand-accent text-sm font-bold leading-5 text-brand-accent-ink shadow-[0_10px_25px_var(--brand-accent-shadow-soft)]">
          {index + 1}
        </div>
      </div>
    );
  }

  return (
    <div className="relative mb-5 aspect-[16/9] overflow-hidden rounded-md border border-brand-line bg-brand-stage-gradient p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_24%,rgba(255,190,0,0.2),transparent_28%)]" />
      <div className="relative h-full rounded-md border border-brand-line bg-brand-panel/75 p-4">
        <span className="block h-3 w-20 rounded-full bg-brand-accent/80" />
        <div className="mt-5 space-y-2">
          <span className="block h-2 w-full rounded-full bg-brand-ink/70" />
          <span className="block h-2 w-4/5 rounded-full bg-brand-muted/60" />
          <span className="block h-2 w-3/5 rounded-full bg-brand-muted/45" />
        </div>
        <div className="absolute bottom-4 right-4 flex size-9 items-center justify-center rounded-md bg-brand-accent text-brand-accent-ink">
          <Upload className="size-4" />
        </div>
      </div>
    </div>
  );
}

export function HowToSection({ content }: { content: NonNullable<SeoPageContent["howItWorks"]> }) {
  return (
    <section id="seo-how-it-works" className="bg-brand-panel px-5 py-[70px] lg:py-[120px]">
      <div className="mx-auto max-w-[1060px]">
        <SectionHeading title={content.title} />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {content.steps.map((step, index) => (
            <article key={step.title} className="rounded-md border border-brand-line bg-brand-soft/45 p-4">
              <StepImagePreview image={step.image} title={step.title} index={index} />
              <div className="px-1 pb-2">
                <h3 className="text-base font-semibold leading-6 text-brand-ink lg:text-xl lg:leading-7">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm font-normal leading-5 text-brand-muted lg:text-base lg:leading-6">
                  {step.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
