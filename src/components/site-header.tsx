"use client";

import { Link } from "@/core/i18n/navigation";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { DiscordIcon } from "@/components/discord-icon";
import { buttonVariants } from "@/components/ui/button";
import { LocaleSelector } from "@/components/locale-selector";
import { SiteUserMenu } from "@/components/site-user-menu";
import { TopBanner, type TopBannerConfig } from "@/components/top-banner";
import { useSession } from "@/core/auth/client";
import { cn } from "@/lib/utils";

export interface NavLink {
  href: string;
  label: string;
  external?: boolean;
}

export type SiteHeaderVariant = "default" | "heroOverlay";

export function SiteHeader({
  navLinks,
  discordLink,
  variant = "default",
  topBanner,
}: {
  navLinks?: NavLink[];
  discordLink?: Pick<NavLink, "href" | "label">;
  variant?: SiteHeaderVariant;
  topBanner?: TopBannerConfig;
}) {
  const t = useTranslations("common");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { data: session } = useSession();
  const user = session?.user;
  const isHeroOverlay = variant === "heroOverlay";
  const isTransparent = isHeroOverlay && !scrolled && !mobileOpen;

  useEffect(() => {
    if (!isHeroOverlay) {
      return;
    }

    const syncScrollState = () => {
      setScrolled(window.scrollY > 24);
    };

    syncScrollState();
    window.addEventListener("scroll", syncScrollState, { passive: true });

    return () => {
      window.removeEventListener("scroll", syncScrollState);
    };
  }, [isHeroOverlay]);

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
    <header
      className={cn(
        "top-0 z-50 w-full border-b transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300",
        isHeroOverlay
          ? "fixed text-white"
          : "sticky border-brand-line/80 bg-brand-panel/92 text-brand-ink backdrop-blur-md",
        isTransparent
          ? "border-transparent bg-transparent shadow-none"
          : isHeroOverlay
            ? "border-[rgba(255,255,255,0.10)] bg-[rgba(5,9,19,0.88)] shadow-[0_12px_30px_rgba(5,9,19,0.28)] backdrop-blur-md"
            : null,
      )}
    >
      {topBanner ? <TopBanner banner={topBanner} /> : null}

      <div className="mx-auto grid h-[88px] max-w-[1180px] grid-cols-[1fr_auto] items-center gap-4 px-5 sm:px-8 md:grid-cols-[1fr_auto_1fr]">
        {/* Brand */}
        <Link href="/" className="flex w-fit items-center rounded-md p-1 transition-transform active:scale-95">
          <BrandLogo
            variant="header"
            showName
            className={isHeroOverlay ? "text-white" : undefined}
            textClassName={isHeroOverlay ? "text-white" : undefined}
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-10 md:flex">
          {navLinks?.map((link) =>
            renderNavLink(
              link,
              cn(
                "text-sm font-bold transition-colors",
                isHeroOverlay
                  ? "text-slate-300/80 [@media(hover:hover)]:hover:text-brand-accent"
                  : "text-brand-muted [@media(hover:hover)]:hover:text-brand-accent-hover",
              ),
            ),
          )}
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center justify-end gap-3 md:flex lg:gap-5">
          {discordLink ? (
            <a
              href={discordLink.href}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-10 items-center gap-2 rounded-full bg-[#5865f2] px-4 text-sm font-extrabold text-white shadow-[0_10px_24px_color-mix(in_oklch,#5865f2_32%,transparent)] transition-colors [@media(hover:hover)]:hover:bg-[#4752c4] active:scale-95 lg:inline-flex"
            >
              <DiscordIcon className="size-4" />
              {discordLink.label}
            </a>
          ) : null}
          <span className={cn("h-8 w-px", isHeroOverlay ? "bg-white/12" : "bg-brand-line")} aria-hidden={true} />
          <LocaleSelector
            className={isHeroOverlay ? "text-slate-300/85 hover:bg-white/10 hover:text-white" : undefined}
          />
          {user ? (
            <div className={isHeroOverlay ? "[&_button]:border-white/10 [&_button]:bg-white/8 [&_button]:text-white" : undefined}>
              <SiteUserMenu
                name={user.name || "User"}
                email={user.email}
                image={user.image}
              />
            </div>
          ) : (
            <Link
              href="/sign-in"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-10 rounded-full border-transparent bg-white px-5 text-sm font-bold text-brand-ink shadow-sm transition-[background-color,transform] [@media(hover:hover)]:hover:bg-white/90 active:scale-[0.98]",
              )}
            >
              {t("nav.start_free")}
            </Link>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className={cn(
            "rounded-md p-2 md:hidden",
            isHeroOverlay ? "text-white" : "text-brand-ink",
          )}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className={cn(
            "border-t px-4 pb-4 pt-2 md:hidden",
            isHeroOverlay
              ? "border-[rgba(255,255,255,0.10)] bg-[rgba(5,9,19,0.95)] text-white shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-md"
              : "border-brand-line bg-brand-panel/95",
          )}
        >
          <nav className="flex flex-col gap-2">
            {navLinks?.map((link) =>
              renderNavLink(
                link,
                cn(
                  "rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                  isHeroOverlay
                    ? "text-slate-200 [@media(hover:hover)]:hover:bg-white/10 [@media(hover:hover)]:hover:text-brand-accent"
                    : "text-brand-muted [@media(hover:hover)]:hover:bg-brand-accent-soft [@media(hover:hover)]:hover:text-brand-accent-hover",
                ),
                () => setMobileOpen(false),
              ),
            )}
          </nav>
          <div className={cn("mt-3 flex items-center gap-2 border-t pt-3", isHeroOverlay ? "border-white/10" : "border-brand-line")}>
            {discordLink ? (
              <a
                href={discordLink.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[#5865f2] px-4 text-sm font-extrabold text-white shadow-[0_10px_24px_color-mix(in_oklch,#5865f2_24%,transparent)] transition-colors [@media(hover:hover)]:hover:bg-[#4752c4] active:scale-95"
                onClick={() => setMobileOpen(false)}
              >
                <DiscordIcon className="size-4" />
                {discordLink.label}
              </a>
            ) : null}
            <LocaleSelector
              className={isHeroOverlay ? "text-slate-200 hover:bg-white/10 hover:text-white" : undefined}
            />
            <div className="flex-1" />
            {user ? (
              <div className={isHeroOverlay ? "[&_button]:border-white/10 [&_button]:bg-white/8 [&_button]:text-white" : undefined}>
                <SiteUserMenu
                  name={user.name || "User"}
                  email={user.email}
                  image={user.image}
                />
              </div>
            ) : (
              <Link
                href="/sign-in"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "gap-1.5 rounded-full border-transparent bg-white font-bold text-brand-ink hover:bg-white/90",
                )}
                onClick={() => setMobileOpen(false)}
              >
                {t("nav.start_free")}
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
