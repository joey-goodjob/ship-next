"use client";

import { useTranslations } from "next-intl";
import { LayoutDashboard, Users, Shield, KeyRound, DollarSign, CreditCard, Coins, FolderOpen, FileText, Settings, Home, Ticket, Film, ChartNoAxesCombined, Radar, Bug } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { BrandLogo } from "@/components/brand-logo";

export function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  const navItems = [
    { href: "/admin", label: t("nav.overview"), icon: LayoutDashboard, group: tc("systems.admin") },
    { href: "/admin/users", label: t("nav.users"), icon: Users, group: t("nav.rbac") },
    { href: "/admin/invite-codes", label: t("nav.invite_codes"), icon: Ticket, group: t("nav.rbac") },
    { href: "/admin/roles", label: t("nav.roles"), icon: Shield, group: t("nav.rbac") },
    { href: "/admin/permissions", label: t("nav.permissions"), icon: KeyRound, group: t("nav.rbac") },
    { href: "/admin/categories", label: t("nav.categories"), icon: FolderOpen, group: t("nav.content") },
    { href: "/admin/posts", label: t("nav.posts"), icon: FileText, group: t("nav.content") },
    { href: "/admin/payments", label: t("nav.payments"), icon: DollarSign, group: t("nav.billing") },
    { href: "/admin/subscriptions", label: t("nav.subscriptions"), icon: CreditCard, group: t("nav.billing") },
    { href: "/admin/credits", label: t("nav.credits"), icon: Coins, group: t("nav.billing") },
    { href: "/admin/analytics", label: t("nav.analytics"), icon: ChartNoAxesCombined, group: t("nav.business") },
    { href: "/admin/clarity", label: t("nav.clarity"), icon: Radar, group: t("nav.business") },
    { href: "/admin/bug-radar", label: t("nav.bug_radar"), icon: Bug, group: t("nav.business") },
    { href: "/admin/creations", label: t("nav.creations"), icon: Film, group: t("nav.business") },
  ];

  const footerNavItems = [
    { href: "/admin/settings", label: t("nav.settings"), icon: Settings },
    { href: "/", label: tc("systems.home"), icon: Home, newTab: true },
  ];

  return (
    <AppLayout
      navItems={navItems}
      footerNavItems={footerNavItems}
      brand={<BrandLogo variant="sidebar" showName />}
      profileHref="/settings/profile"
      requirePermission="admin.*"
    >
      {children}
    </AppLayout>
  );
}
