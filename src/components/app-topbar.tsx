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

export function AppTopbar({
  brand,
  brandHref = "/create",
  helpLink,
  pricingLink,
  upgradeLabel,
  creditLabel,
  user,
}: {
  brand: React.ReactNode;
  brandHref?: string;
  helpLink: AppTopbarLink;
  pricingLink: AppTopbarLink;
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
