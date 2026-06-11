"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/core/auth/client";
import { Link, usePathname, useRouter } from "@/core/i18n/navigation";
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
  topbar,
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
  topbar?: (props: {
    brand: React.ReactNode;
    brandHref: string;
    user: {
      name: string;
      email: string;
      image?: string | null;
    };
  }) => React.ReactNode;
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
    <SidebarProvider className="pt-16">
      <div className="fixed inset-x-0 top-0 z-40">
        {topbar ? (
          topbar({
            brand: mobileBrand || brand,
            brandHref,
            user: {
              name: session.user.name || "User",
              email: session.user.email,
              image: session.user.image,
            },
          })
        ) : (
          <header className="flex h-16 shrink-0 items-center border-b border-brand-line bg-brand-panel px-3 text-brand-ink shadow-[0_1px_0_var(--brand-elevation-shadow-soft)] sm:px-4 lg:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <SidebarTrigger className="size-9 shrink-0 rounded-md text-brand-muted transition-colors hover:bg-brand-soft hover:text-brand-ink active:scale-95" />
              <Link
                href={brandHref}
                className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-brand-ink transition-colors hover:text-brand-accent-hover active:scale-95"
              >
                <span className="flex min-w-0 shrink-0 items-center">
                  {brand}
                </span>
              </Link>
            </div>
            {headerExtra && (
              <div className="flex shrink-0 items-center gap-1">{headerExtra}</div>
            )}
          </header>
        )}
      </div>
      <AppSidebar
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
      <SidebarInset className="min-h-[calc(100svh-4rem)]">
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
