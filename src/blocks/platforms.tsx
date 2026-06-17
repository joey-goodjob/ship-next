import { getTranslations } from "next-intl/server";
import { Link } from "@/core/i18n/navigation";
import { Monitor, Smartphone, Square } from "lucide-react";

const PLATFORM_ICONS = [Monitor, Smartphone, Square] as const;

type PlatformItem = {
  platform: string;
  description: string;
  link_text: string;
  link_href: string;
};

export async function Platforms() {
  const t = await getTranslations("landing");
  const items = t.raw("platforms.items") as PlatformItem[];

  return (
    <section className="bg-brand-panel px-5 py-[70px] text-brand-ink lg:py-[120px]">
      <div className="mx-auto max-w-[1180px]">
        <h2 className="text-center text-xl font-bold leading-[25px] lg:text-4xl lg:leading-10">
          {t("platforms.title")}
        </h2>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {items.map((item, index) => {
            const Icon = PLATFORM_ICONS[index] ?? Monitor;
            return (
              <div
                key={item.platform}
                className="rounded-md border border-brand-line bg-brand-soft p-6 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <Icon className="size-6 text-brand-accent" />
                  <h3 className="text-lg font-semibold leading-7 text-brand-ink">
                    {item.platform}
                  </h3>
                </div>
                <p className="mt-4 text-sm leading-5 text-brand-muted lg:text-base lg:leading-6">
                  {item.description}
                </p>
                <Link
                  href={item.link_href}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-accent hover:underline"
                >
                  {item.link_text} <span>→</span>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
