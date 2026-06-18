import { getTranslations } from "next-intl/server";

type HowItWorksStep = {
  title: string;
  description: string;
};

const STEP_IMAGES = [
  "/seo-pages/ai-lyric-video-generator/how-to-1.png",
  "/seo-pages/ai-lyric-video-generator/how-to-2.png",
  "/seo-pages/ai-lyric-video-generator/how-to-3.png",
] as const;

export async function HowItWorks() {
  const t = await getTranslations("landing");
  const steps = t.raw("how_it_works.steps") as HowItWorksStep[];

  return (
    <section id="how-it-works" className="bg-brand-panel px-5 py-[70px] text-brand-ink lg:py-[120px]">
      <div className="mx-auto max-w-[1340px]">
        <div className="text-center">
          <h2 className="text-xl font-bold leading-[25px] lg:text-4xl lg:leading-10">
            {t("how_it_works.title")}
          </h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => {
            const imageSrc = STEP_IMAGES[index];

            return (
              <article key={step.title} className="rounded-lg border border-brand-line bg-brand-soft/45 p-5 shadow-sm">
                <div className="relative mb-6 aspect-[16/7] overflow-hidden rounded-md border border-brand-line bg-brand-stage-gradient">
                  {imageSrc ? (
                    <img
                      src={imageSrc}
                      alt={step.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                  <span className="absolute left-3 top-3 flex size-8 items-center justify-center rounded-md bg-brand-accent text-sm font-bold leading-5 text-brand-accent-ink shadow-[0_10px_25px_var(--brand-accent-shadow-soft)]">
                    {index + 1}
                  </span>
                </div>
                <div className="px-1 pb-2">
                  <p className="text-base font-semibold leading-6 text-brand-ink lg:text-xl lg:leading-7">
                    Step {index + 1}: {step.title}
                  </p>
                  <p className="mt-3 text-sm font-normal leading-5 text-brand-muted lg:text-base lg:leading-6">
                    {step.description}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
