import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { SeoPageContent } from "@/lib/seo-pages";
import { SectionHeading } from "./section-heading";

export function FaqSection({ content }: { content: NonNullable<SeoPageContent["faq"]> }) {
  return (
    <section id="faq" className="bg-brand-soft px-5 py-[70px] lg:py-[120px]">
      <div className="mx-auto max-w-[900px]">
        <SectionHeading title={content.title} />
        <Accordion className="mt-10 overflow-hidden rounded-sm bg-brand-panel shadow-sm" defaultValue={["faq-0"]}>
          {content.items.map((faq, index) => (
            <AccordionItem key={faq.question} value={`faq-${index}`} className="border-brand-line">
              <AccordionTrigger className="cursor-pointer px-5 py-6 text-left text-base font-semibold leading-6 text-brand-muted hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-6 text-sm font-normal leading-5 text-brand-muted lg:text-base lg:leading-6">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
