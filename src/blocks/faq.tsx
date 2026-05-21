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
    <section id="faq" className="bg-[#f4f4f5] px-5 py-24 text-slate-950 sm:py-32">
      <div className="mx-auto grid max-w-[1200px] gap-14 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="flex flex-col justify-center">
          <h2 className="flex items-center gap-3 text-4xl font-black tracking-[-0.04em]">
            <HelpCircle className="size-8" />
            {t("faq.title")}
          </h2>
          <p className="mt-8 max-w-sm text-lg leading-8">
            {t("faq.description")}
          </p>
        </div>
        <Accordion className="overflow-hidden rounded-sm bg-white shadow-sm" defaultValue={["rights"]}>
          {FAQ_KEYS.map((key) => (
            <AccordionItem key={key} value={key} className="border-slate-200">
              <AccordionTrigger className="cursor-pointer px-5 py-6 text-left text-base font-black text-slate-600 hover:no-underline">
                {t(`faq.${key}.question`)}
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-6 text-base font-semibold leading-8 text-slate-600">
                {t(`faq.${key}.answer`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
