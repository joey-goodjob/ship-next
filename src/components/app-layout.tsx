"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/core/auth/client";
import { usePathname, useRouter } from "@/core/i18n/navigation";
import { AppSidebar, type NavItem } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export function AppLayout({
  children,
  navItems,
  footerNavItems,
  brand,
  brandHref = "/",
  mobileBrand,
  headerExtra,
  profileHref,
  requirePermission,
  unauthorizedRedirect = "/settings",
}: {
  children: React.ReactNode;
  navItems: NavItem[];
  footerNavItems?: NavItem[];
  brand: React.ReactNode;
  brandHref?: string;
  mobileBrand?: React.ReactNode;
  headerExtra?: React.ReactNode;
  profileHref?: string;
  requirePermission?: string;
  unauthorizedRedirect?: string;
}) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (isPending) return;

    if (!session?.user) {
      setAuthorized(false);
      const callbackUrl = `${pathname}${window.location.search}`;
      router.push(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }

    if (!requirePermission) {
      setAuthorized(true);
      return;
    }

    fetch("/api/user/permissions")
      .then((r) => r.json())
      .then((res) => {
        const admin = res.code === 0 && res.data?.isAdmin === true;
        if (admin) {
          setAuthorized(true);
        } else {
          router.push(unauthorizedRedirect);
        }
      })
      .catch(() => {
        router.push(unauthorizedRedirect);
      });
  }, [isPending, session, router, requirePermission, unauthorizedRedirect, pathname]);

  if (isPending || !authorized || !session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar
        brand={brand}
        brandHref={brandHref}
        navItems={navItems}
        footerNavItems={footerNavItems}
        footer={
          <UserMenu
            name={session.user.name || "User"}
            email={session.user.email}
            image={session.user.image}
            profileHref={profileHref}
          />
        }
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
          </div>
          <div className="flex-1" />
          {headerExtra && (
            <div className="flex items-center gap-1 px-4">{headerExtra}</div>
          )}
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
