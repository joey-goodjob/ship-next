import { getTranslations } from "next-intl/server";
import { SiteHeader, type SiteHeaderVariant } from "@/components/site-header";

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

  return (
    <SiteHeader
      navLinks={navLinks}
      discordLink={{ href: "https://discord.gg/2YmWtNx3z7", label: "Discord" }}
      variant={variant}
    />
  );
}
