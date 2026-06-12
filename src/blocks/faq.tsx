import { getTranslations } from "next-intl/server";
import { HelpCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ_KEYS = ["rights", "free_preview", "models", "static_video", "credits"] as const;

export async function FAQ() {
  const t = await getTranslations("landing");

  return (
    <section id="faq" className="bg-brand-soft px-5 py-[70px] text-brand-ink lg:py-[120px]">
      <div className="mx-auto grid max-w-[1200px] gap-14 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="flex flex-col justify-center">
          <h2 className="flex items-center gap-3 text-xl font-bold leading-[25px] lg:text-4xl lg:leading-10">
            <HelpCircle className="size-8" />
            {t("faq.title")}
          </h2>
          <p className="mt-5 max-w-sm text-sm font-normal leading-5 lg:mt-8 lg:text-base lg:leading-6">
            {t("faq.description")}
          </p>
        </div>
        <Accordion className="overflow-hidden rounded-sm bg-brand-panel shadow-sm" defaultValue={["rights"]}>
          {FAQ_KEYS.map((key) => (
            <AccordionItem key={key} value={key} className="border-brand-line">
              <AccordionTrigger className="cursor-pointer px-5 py-6 text-left text-base font-semibold leading-6 text-brand-muted hover:no-underline">
                {t(`faq.${key}.question`)}
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-6 text-sm font-normal leading-5 text-brand-muted lg:text-base lg:leading-6">
                {t(`faq.${key}.answer`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
