"use client";

import { useTranslations } from "next-intl";
import { Coins, Home, PlusCircle, Settings, Video } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { AppTopbar } from "@/components/app-topbar";
import { BrandLogo } from "@/components/brand-logo";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("dashboard");

  const navItems = [
    {
      href: "/create",
      label: t("nav.create"),
      icon: PlusCircle,
      group: t("nav.workspace"),
    },
    {
      href: "/creations",
      label: t("nav.creations"),
      icon: Video,
      group: t("nav.workspace"),
    },
    {
      href: "/settings/credits",
      label: t("nav.credits"),
      icon: Coins,
      group: t("nav.workspace"),
    },
  ];

  const footerNavItems = [
    { href: "/settings", label: t("nav.settings"), icon: Settings },
    { href: "/", label: t("nav.home"), icon: Home, newTab: true },
  ];

  return (
    <AppLayout
      navItems={navItems}
      footerNavItems={footerNavItems}
      brand={<BrandLogo variant="sidebar" showName />}
      mobileBrand={<BrandLogo variant="topbar" showName />}
      brandHref="/create"
      profileHref="/settings/profile"
      topbar={({ brand, brandHref, user }) => (
        <AppTopbar
          brand={brand}
          brandHref={brandHref}
          helpLink={{ href: "/#faq", label: t("nav.help") }}
          pricingLink={{ href: "/pricing", label: t("nav.pricing") }}
          upgradeLabel={t("nav.upgrade")}
          creditLabel={t("nav.credits")}
          user={user}
        />
      )}
    >
      {children}
    </AppLayout>
  );
}
