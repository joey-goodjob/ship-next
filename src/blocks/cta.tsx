import { Link } from "@/core/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Upload } from "lucide-react";

export async function CTA() {
  const t = await getTranslations("landing");

  return (
    <section className="bg-brand-cta-gradient px-5 py-[70px] text-center text-brand-ink lg:py-24">
      <p className="text-sm font-normal leading-5 lg:text-base lg:leading-6">
        {t("cta.line1")}
        <br />
        {t("cta.line2")}
        <br />
        {t("cta.line3")}
      </p>
      <Link
        href="/#create"
        className="mt-8 inline-flex h-11 items-center justify-center gap-3 rounded-[9px] bg-brand-accent px-6 text-base font-semibold leading-6 text-brand-ink hover:bg-brand-accent-hover"
      >
        <Upload className="size-5" />
        {t("cta.button")}
      </Link>
    </section>
  );
}
