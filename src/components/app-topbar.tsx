"use client";

import { useEffect, useState } from "react";
import { Coins, HelpCircle, Sparkles } from "lucide-react";
import { Link } from "@/core/i18n/navigation";
import { LocaleSelector } from "@/components/locale-selector";
import { SiteUserMenu } from "@/components/site-user-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";

export type AppTopbarLink = {
  href: string;
  label: string;
};

type AppTopbarUser = {
  name: string;
  email: string;
  image?: string | null;
};

type CreditsResponse = {
  code?: number;
  data?: {
    balance?: number;
  };
};

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M19.54 5.34A17.6 17.6 0 0 0 15.2 4c-.2.36-.42.84-.58 1.22a16.4 16.4 0 0 0-5.24 0A11 11 0 0 0 8.8 4a17.6 17.6 0 0 0-4.35 1.34C1.7 9.45.95 13.46 1.32 17.4A17.8 17.8 0 0 0 6.66 20c.43-.58.82-1.2 1.16-1.86-.64-.24-1.25-.54-1.82-.9l.44-.34a12.6 12.6 0 0 0 11.12 0l.44.34c-.57.36-1.18.66-1.82.9.34.66.73 1.28 1.16 1.86a17.8 17.8 0 0 0 5.34-2.6c.44-4.56-.75-8.54-3.14-12.06ZM8.62 14.96c-1.05 0-1.9-.96-1.9-2.14s.84-2.14 1.9-2.14c1.06 0 1.92.97 1.9 2.14 0 1.18-.84 2.14-1.9 2.14Zm6.76 0c-1.05 0-1.9-.96-1.9-2.14s.84-2.14 1.9-2.14c1.06 0 1.92.97 1.9 2.14 0 1.18-.84 2.14-1.9 2.14Z" />
    </svg>
  );
}

export function AppTopbar({
  brand,
  brandHref = "/create",
  helpLink,
  pricingLink,
  discordLink,
  upgradeLabel,
  creditLabel,
  user,
}: {
  brand: React.ReactNode;
  brandHref?: string;
  helpLink: AppTopbarLink;
  pricingLink: AppTopbarLink;
  discordLink?: AppTopbarLink;
  upgradeLabel: string;
  creditLabel: string;
  user: AppTopbarUser;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoaded, setBalanceLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    fetch("/api/credits")
      .then((response) => response.json())
      .then((body: CreditsResponse) => {
        if (!mounted) return;
        const nextBalance = Number(body?.data?.balance);
        setBalance(body?.code === 0 && Number.isFinite(nextBalance) ? nextBalance : 0);
      })
      .catch(() => {
        if (mounted) setBalance(0);
      })
      .finally(() => {
        if (mounted) setBalanceLoaded(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const balanceText = balanceLoaded ? (balance ?? 0).toLocaleString() : "...";

  return (
    <header className="flex h-16 shrink-0 items-center border-b border-brand-line bg-brand-panel px-3 text-brand-ink shadow-[0_1px_0_var(--brand-elevation-shadow-soft)] sm:px-4 lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger className="size-9 shrink-0 rounded-md text-brand-muted transition-colors hover:bg-brand-soft hover:text-brand-ink active:scale-95" />
        <Link href={brandHref} className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-brand-ink transition-colors hover:text-brand-accent-hover active:scale-95">
          <span className="flex shrink-0 items-center">
            {brand}
          </span>
        </Link>
      </div>

      <nav className="hidden items-center gap-6 md:flex">
        <Link
          href={helpLink.href}
          className="inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-brand-muted transition-colors hover:text-brand-ink active:scale-95"
        >
          <HelpCircle className="size-4 text-brand-subtle" />
          {helpLink.label}
        </Link>
        <Link
          href={pricingLink.href}
          className="inline-flex h-10 items-center text-sm font-semibold text-brand-muted transition-colors hover:text-brand-ink active:scale-95"
        >
          {pricingLink.label}
        </Link>
        {discordLink ? (
          <a
            href={discordLink.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[#5865f2] px-4 text-sm font-extrabold text-white shadow-[0_10px_24px_color-mix(in_oklch,#5865f2_32%,transparent)] transition-colors hover:bg-[#4752c4] active:scale-95"
          >
            <DiscordIcon className="size-4" />
            {discordLink.label}
          </a>
        ) : null}
      </nav>

      <div className="ml-2 flex shrink-0 items-center gap-2 sm:ml-4 md:gap-3">
        <LocaleSelector
          variant="pill"
          className="hidden h-9 border-brand-line bg-brand-soft px-3 text-brand-muted hover:border-brand-accent/40 hover:bg-brand-accent-soft hover:text-brand-accent-hover sm:inline-flex"
        />
        <Link
          href="/settings/credits"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-brand-accent-hairline bg-brand-accent-soft px-3 text-sm font-bold text-brand-ink shadow-[inset_0_1px_0_var(--brand-accent-hairline)] transition-colors hover:border-brand-accent/40 hover:bg-brand-soft active:scale-95"
          aria-label={`${balanceText} ${creditLabel}`}
        >
          <Coins className="size-4 text-brand-accent-hover" />
          <span className="tabular-nums text-brand-accent-hover">{balanceText}</span>
          <span className="hidden text-xs font-semibold text-brand-muted sm:inline">{creditLabel}</span>
        </Link>
        <Link
          href={pricingLink.href}
          className="hidden h-9 items-center gap-1.5 rounded-full bg-brand-accent px-4 text-sm font-extrabold text-brand-accent-ink shadow-[0_0_20px_var(--brand-accent-shadow-soft)] transition-colors hover:bg-brand-accent-hover active:scale-95 sm:inline-flex"
        >
          <Sparkles className="size-4" />
          {upgradeLabel}
        </Link>
        <SiteUserMenu name={user.name} email={user.email} image={user.image} />
      </div>
    </header>
  );
}
