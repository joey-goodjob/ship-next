import type { SeoPageContent } from "@/lib/seo-pages";

export function ContentSectionsSection({
  blocks,
}: {
  blocks: NonNullable<SeoPageContent["contentSections"]>;
}) {
  return (
    <section className="px-5 py-[70px] lg:py-[120px]">
      <div className="mx-auto max-w-[820px]">
        <div className="flex flex-col gap-12">
          {blocks.map((block) => (
            <article key={block.heading}>
              <h2 className="text-balance text-xl font-bold leading-8 text-brand-ink lg:text-3xl lg:leading-10">
                {block.heading}
              </h2>
              <div className="mt-4 flex flex-col gap-4">
                {block.body.map((paragraph, index) => (
                  <p
                    key={index}
                    className="text-sm font-normal leading-6 text-brand-muted lg:text-base lg:leading-7"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
