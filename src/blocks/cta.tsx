import { Link } from "@/core/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Upload } from "lucide-react";

const TAAFT_URL =
  "https://theresanaiforthat.com/ai/ai-lyric-video-maker/?ref=featured&v=1703659";
const TAAFT_BADGE_URL =
  "https://media.theresanaiforthat.com/featured-on-taaft.png?width=600";

export async function CTA() {
  const t = await getTranslations("landing");

  return (
    <section className="relative isolate overflow-hidden bg-black px-5 py-[76px] text-white sm:px-8 lg:py-[108px]">
      <div
        className="absolute inset-0 bg-cover bg-[60%_center] sm:bg-center"
        style={{ backgroundImage: "url('/imgs/beatviz-m-cta.webp')" }}
        aria-hidden={true}
      />
      <div className="absolute inset-0 bg-linear-to-r from-black/74 via-black/28 to-black/10" aria-hidden={true} />
      <div className="absolute inset-0 bg-linear-to-t from-black/46 via-transparent to-black/12" aria-hidden={true} />

      <div className="relative z-10 mx-auto flex min-h-[390px] max-w-[1200px] items-center">
        <div className="max-w-[620px]">
          <a
            href={TAAFT_URL}
            target="_blank"
            rel="nofollow noopener"
            className="mb-8 hidden w-fit transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/60 active:scale-[0.98] sm:block"
          >
            <img
              src={TAAFT_BADGE_URL}
              alt="Featured on There's An AI For That"
              width={300}
              className="h-auto w-[230px] border border-white/70 bg-white/74 px-2 py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.18)] lg:w-[300px]"
            />
          </a>
          <h2 className="text-balance text-[34px] font-bold leading-[1.14] text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.28)] sm:text-[44px] lg:text-[58px]">
            {t("cta.line1")}
            <br />
            <span className="text-brand-accent">{t("cta.line2")}</span>
            <br />
            {t("cta.line3")}
          </h2>
          <Link
            href="/#create"
            className="mt-8 inline-flex h-14 items-center justify-center gap-3 rounded-full bg-brand-accent px-8 text-base font-semibold leading-6 text-black shadow-[0_18px_45px_rgba(236,163,7,0.28)] transition-colors hover:bg-brand-accent-hover"
          >
            <Upload className="size-5" />
            {t("cta.button")}
          </Link>
          <p className="mt-4 max-w-md text-sm font-medium leading-5 text-white/78">
            {t("cta.note")}
          </p>
        </div>
      </div>
    </section>
  );
}
