import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";

export async function Header() {
  const t = await getTranslations("landing");

  const navLinks = [
    { href: "/create", label: t("nav.create") },
    { href: "/#create", label: t("nav.tools") },
    { href: "/pricing", label: t("nav.pricing") },
    { href: "/#faq", label: t("nav.help") },
    { href: "/#faq", label: t("nav.contact") },
  ];

  return <SiteHeader navLinks={navLinks} />;
}
