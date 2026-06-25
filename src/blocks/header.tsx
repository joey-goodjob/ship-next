import { getTranslations } from "next-intl/server";
import { SiteHeader, type SiteHeaderVariant } from "@/components/site-header";
import type { TopBannerConfig } from "@/components/top-banner";

export async function Header({
  variant = "default",
}: {
  variant?: SiteHeaderVariant;
}) {
  const t = await getTranslations("landing");

  const navLinks = [
    { href: "/create", label: t("nav.create") },
    { href: "/#create", label: t("nav.tools") },
    { href: "/pricing", label: t("nav.pricing") },
    { href: "/#faq", label: t("nav.help") },
  ];
  const topBanner = t.raw("top_banner") as TopBannerConfig;

  return (
    <SiteHeader
      navLinks={navLinks}
      discordLink={{ href: "https://discord.gg/2YmWtNx3z7", label: "Discord" }}
      variant={variant}
      topBanner={topBanner}
    />
  );
}
