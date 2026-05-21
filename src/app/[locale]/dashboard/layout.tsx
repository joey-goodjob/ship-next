"use client";

import { useTranslations } from "next-intl";
import { Coins, Home, Settings, Video } from "lucide-react";
import { envConfigs } from "@/config";
import { AppLayout } from "@/components/app-layout";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("dashboard");

  const navItems = [
    {
      href: "/dashboard/lyric-videos",
      label: t("nav.lyric_videos"),
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
      brand={envConfigs.app_name}
      brandHref="/dashboard/lyric-videos"
      profileHref="/settings/profile"
    >
      {children}
    </AppLayout>
  );
}
