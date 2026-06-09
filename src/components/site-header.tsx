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

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/92 text-slate-950 backdrop-blur-md">
      <div className="mx-auto grid h-[88px] max-w-[1180px] grid-cols-[1fr_auto] items-center gap-4 px-5 sm:px-8 md:grid-cols-[1fr_auto_1fr]">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2">
          <span className="relative flex size-10 items-center justify-center rounded-full border-[4px] border-[#050b24] bg-white shadow-[0_8px_22px_rgba(15,23,42,0.08)]">
            <span className="absolute -right-1 top-1 flex size-5 items-center justify-center rounded-full bg-teal-100">
              <Play className="ml-0.5 size-3 fill-teal-600 text-teal-600" />
            </span>
            <span className="relative size-2 rounded-full bg-teal-500" />
          </span>
          <span className="text-[26px] font-extrabold tracking-[-0.012em] text-[#050b24]">
            LyricVideo <span className="text-teal-600">AI</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-10 md:flex">
          {navLinks?.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener noreferrer" : undefined}
              className="text-sm font-bold text-slate-500 transition-colors [@media(hover:hover)]:hover:text-teal-700"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center justify-end gap-5 md:flex">
          <span className="h-8 w-px bg-slate-200" aria-hidden={true} />
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
                "h-10 rounded-full border-slate-200 bg-white px-5 text-sm font-bold text-slate-600 shadow-sm transition-[background-color,transform,border-color] active:scale-[0.98] [@media(hover:hover)]:hover:border-teal-200 [@media(hover:hover)]:hover:bg-teal-50 [@media(hover:hover)]:hover:text-teal-700",
              )}
            >
              {t("nav.get_started")}
            </Link>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="rounded-md p-2 text-slate-700 md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white/95 px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col gap-2">
            {navLinks?.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target={link.external ? "_blank" : undefined}
                rel={link.external ? "noopener noreferrer" : undefined}
                className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition-colors [@media(hover:hover)]:hover:bg-teal-50 [@media(hover:hover)]:hover:text-teal-700"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3">
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
                className={cn(buttonVariants({ variant: "outline" }), "gap-1.5 rounded-full border-slate-200 text-slate-600")}
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
