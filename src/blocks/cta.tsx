import { Link } from "@/core/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Upload } from "lucide-react";

export async function CTA() {
  const t = await getTranslations("landing");

  return (
    <section className="bg-gradient-to-r from-[#fff7d1] to-[#fde68a] px-5 py-20 text-center text-slate-950">
      <p className="text-lg leading-9">
        {t("cta.line1")}
        <br />
        {t("cta.line2")}
        <br />
        {t("cta.line3")}
      </p>
      <Link
        href="/dashboard/lyric-videos/upload"
        className="mt-8 inline-flex h-[62px] items-center justify-center gap-3 rounded-[9px] bg-[#fbbf24] px-9 text-2xl font-black uppercase text-slate-950 hover:bg-[#f59e0b]"
      >
        <Upload className="size-6" />
        {t("cta.button")}
      </Link>
    </section>
  );
}
