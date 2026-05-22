"use client";

import { Link } from "@/core/i18n/navigation";
import { useTranslations } from "next-intl";
import { Menu, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSelector } from "@/components/locale-selector";
import { SiteUserMenu } from "@/components/site-user-menu";
import { useSession } from "@/core/auth/client";
import { cn } from "@/lib/utils";
import { envConfigs } from "@/config";

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
    <header className="sticky top-0 z-50 w-full border-b border-transparent bg-white/95 text-slate-950 backdrop-blur-sm">
      <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-5 sm:px-8">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2">
          <span className="relative flex size-6 items-center justify-center rounded-full border-[3px] border-slate-950">
            <span className="absolute -right-1 top-0 size-3 rounded-sm bg-[#fbbf24]" />
            <span className="relative size-2 rounded-full bg-white" />
          </span>
          <span className="text-[26px] font-extrabold tracking-tight">
            Lyric<span className="text-[#fbbf24]">Video AI</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {navLinks?.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener noreferrer" : undefined}
              className="text-sm font-semibold text-slate-500 transition-colors hover:text-slate-950"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-3 md:flex">
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
              href="/dashboard/lyric-videos/upload"
              className={cn(buttonVariants(), "h-10 gap-2 rounded-[10px] bg-[#fbbf24] px-5 font-bold text-slate-950 hover:bg-[#f59e0b]")}
            >
              {t("nav.get_started")}
              <Sparkles className="size-4" />
            </Link>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col gap-2">
            {navLinks?.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target={link.external ? "_blank" : undefined}
                rel={link.external ? "noopener noreferrer" : undefined}
                className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
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
                href="/dashboard/lyric-videos/upload"
                className={cn(buttonVariants(), "gap-1.5 bg-[#fbbf24] text-slate-950 hover:bg-[#f59e0b]")}
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
