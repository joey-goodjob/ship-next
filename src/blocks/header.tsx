import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";

export async function Header() {
  const t = await getTranslations("landing");

  const navLinks = [
    { href: "/pricing", label: t("nav.pricing") },
    { href: "/#faq", label: t("nav.contact") },
  ];

  return <SiteHeader navLinks={navLinks} />;
}
