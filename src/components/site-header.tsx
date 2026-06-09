"use client";

import { Link } from "@/core/i18n/navigation";
import { useTranslations } from "next-intl";
import { Menu, Play, X } from "lucide-react";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSelector } from "@/components/locale-selector";
import { SiteUserMenu } from "@/components/site-user-menu";
import { useSession } from "@/core/auth/client";
import { cn } from "@/lib/utils";

export interface NavLink {
  href: string;
  label: string;
  external?: boolean;
}

export function SiteHeader({
  navLinks,
}: {
  navLinks?: NavLink[];
}) {
  const t = useTranslations("common");
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = useSession();
  const user = session?.user;
  const renderNavLink = (
    link: NavLink,
    className: string,
    onClick?: () => void,
  ) => {
    if (link.external) {
      return (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
          onClick={onClick}
        >
          {link.label}
        </a>
      );
    }

    return (
      <Link key={link.href} href={link.href} className={className} onClick={onClick}>
        {link.label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-brand-line/80 bg-brand-panel/92 text-brand-ink backdrop-blur-md">
      <div className="mx-auto grid h-[88px] max-w-[1180px] grid-cols-[1fr_auto] items-center gap-4 px-5 sm:px-8 md:grid-cols-[1fr_auto_1fr]">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2">
          <span className="relative flex size-10 items-center justify-center rounded-full border-[4px] border-brand-ink bg-brand-panel shadow-[0_8px_22px_var(--brand-elevation-shadow-soft)]">
            <span className="absolute -right-1 top-1 flex size-5 items-center justify-center rounded-full bg-brand-accent-soft">
              <Play className="ml-0.5 size-3 fill-brand-accent text-brand-accent" />
            </span>
            <span className="relative size-2 rounded-full bg-brand-accent" />
          </span>
          <span className="text-[26px] font-extrabold tracking-[-0.012em] text-brand-ink">
            LyricVideo <span className="text-brand-accent">AI</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-10 md:flex">
          {navLinks?.map((link) =>
            renderNavLink(
              link,
              "text-sm font-bold text-brand-muted transition-colors [@media(hover:hover)]:hover:text-brand-accent-hover",
            ),
          )}
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center justify-end gap-5 md:flex">
          <span className="h-8 w-px bg-brand-line" aria-hidden={true} />
          <LocaleSelector />
          <ThemeToggle />
          {user ? (
            <SiteUserMenu
              name={user.name || "User"}
              email={user.email}
              image={user.image}
            />
          ) : (
            <Link
              href="/#create"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-10 rounded-full border-brand-line bg-brand-panel px-5 text-sm font-bold text-brand-muted shadow-sm transition-[background-color,transform,border-color] active:scale-[0.98] [@media(hover:hover)]:hover:border-brand-accent/40 [@media(hover:hover)]:hover:bg-brand-accent-soft [@media(hover:hover)]:hover:text-brand-accent-hover",
              )}
            >
              {t("nav.get_started")}
            </Link>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="rounded-md p-2 text-brand-ink md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-brand-line bg-brand-panel/95 px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col gap-2">
            {navLinks?.map((link) =>
              renderNavLink(
                link,
                "rounded-md px-3 py-2 text-sm font-semibold text-brand-muted transition-colors [@media(hover:hover)]:hover:bg-brand-accent-soft [@media(hover:hover)]:hover:text-brand-accent-hover",
                () => setMobileOpen(false),
              ),
            )}
          </nav>
          <div className="mt-3 flex items-center gap-2 border-t border-brand-line pt-3">
            <LocaleSelector />
            <ThemeToggle />
            <div className="flex-1" />
            {user ? (
              <SiteUserMenu
                name={user.name || "User"}
                email={user.email}
                image={user.image}
              />
            ) : (
              <Link
                href="/#create"
                className={cn(buttonVariants({ variant: "outline" }), "gap-1.5 rounded-full border-brand-line text-brand-muted")}
                onClick={() => setMobileOpen(false)}
              >
                {t("nav.get_started")}
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
