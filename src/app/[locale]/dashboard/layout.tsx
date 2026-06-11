"use client";

import { useTranslations } from "next-intl";
import { Coins, Home, PlusCircle, Settings, Video } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { BrandLogo } from "@/components/brand-logo";

export default function DashboardLayout({
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
      brandHref="/create"
      profileHref="/settings/profile"
    >
      {children}
    </AppLayout>
  );
}
