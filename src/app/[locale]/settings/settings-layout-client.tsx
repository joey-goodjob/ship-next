"use client";

import { useTranslations } from "next-intl";
import { LayoutDashboard, User, CreditCard, Key, Receipt, Coins, Home } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { BrandLogo } from "@/components/brand-logo";

export function SettingsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations();

  const group = t("common.systems.settings");
  const navItems = [
    { href: "/settings", label: t("settings.nav.overview"), icon: LayoutDashboard, group },
    { href: "/settings/billing", label: t("settings.nav.billing"), icon: CreditCard, group },
    { href: "/settings/payments", label: t("settings.nav.payments"), icon: Receipt, group },
    { href: "/settings/credits", label: t("settings.nav.credits"), icon: Coins, group },
    { href: "/settings/apikeys", label: t("settings.nav.apikeys"), icon: Key, group },
  ];

  const footerNavItems = [
    { href: "/settings/profile", label: t("settings.nav.profile"), icon: User },
    { href: "/", label: t("common.systems.home"), icon: Home, newTab: true },
  ];

  return (
    <AppLayout
      navItems={navItems}
      footerNavItems={footerNavItems}
      brand={<BrandLogo variant="sidebar" showName />}
    >
      {children}
    </AppLayout>
  );
}
