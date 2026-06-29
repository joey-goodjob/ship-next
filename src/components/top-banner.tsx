"use client";

import { Gift, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@/core/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TopBannerTarget = "_self" | "_blank";

export type TopBannerConfig = {
  id: string;
  text: string;
  buttonText?: string;
  href?: string;
  target?: TopBannerTarget;
  dismissedExpiryDays?: number;
};

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href) || /^mailto:/i.test(href) || /^tel:/i.test(href);
}

function readDismissed(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;

    const parsed = JSON.parse(raw) as { expiresAt?: number };
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(key);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function writeDismissed(key: string, days: number) {
  try {
    const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(key, JSON.stringify({ expiresAt }));
  } catch {
    // The banner should still close when storage is unavailable.
  }
}

export function TopBanner({
  banner,
  className,
}: {
  banner: TopBannerConfig;
  className?: string;
}) {
  const dismissKey = useMemo(() => `top-banner-dismissed:${banner.id}`, [banner.id]);
  const [visible, setVisible] = useState(false);
  const href = banner.href;
  const target = banner.target || "_self";
  const dismissedExpiryDays = banner.dismissedExpiryDays ?? 1;

  useEffect(() => {
    setVisible(!readDismissed(dismissKey));
  }, [dismissKey]);

  if (!visible) {
    return null;
  }

  const button = banner.buttonText && href ? (
    isExternalHref(href) ? (
      <a
        href={href}
        target={target}
        rel={target === "_blank" ? "noreferrer noopener" : undefined}
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          "h-8 rounded-full bg-white px-3 text-xs font-bold text-brand-ink shadow-sm hover:bg-white/90",
        )}
      >
        {banner.buttonText}
      </a>
    ) : (
      <Link
        href={href}
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          "h-8 rounded-full bg-white px-3 text-xs font-bold text-brand-ink shadow-sm hover:bg-white/90",
        )}
      >
        {banner.buttonText}
      </Link>
    )
  ) : null;
  const content = (
    <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-center text-xs font-extrabold leading-4 sm:text-sm sm:leading-5">
      <Gift className="hidden size-4 shrink-0 sm:block" aria-hidden={true} />
      <span className="min-w-0 text-balance">{banner.text}</span>
    </div>
  );
  const linkedContent = href && !button ? (
    isExternalHref(href) ? (
      <a
        href={href}
        target={target}
        rel={target === "_blank" ? "noreferrer noopener" : undefined}
        className="min-w-0 flex-1 hover:underline"
      >
        {content}
      </a>
    ) : (
      <Link href={href} className="min-w-0 flex-1 hover:underline">
        {content}
      </Link>
    )
  ) : (
    content
  );

  return (
    <div
      className={cn(
        "border-b border-white/10 bg-brand-accent text-brand-ink shadow-[0_10px_28px_rgba(236,163,7,0.20)]",
        className,
      )}
    >
      <div className="mx-auto flex min-h-10 max-w-[1180px] items-center justify-between gap-2 px-4 py-1.5 sm:px-8">
        {linkedContent}

        <div className="flex shrink-0 items-center gap-1.5">
          {button}
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-full text-brand-ink/75 transition-colors hover:bg-black/10 hover:text-brand-ink"
            aria-label="Close promotion banner"
            onClick={() => {
              writeDismissed(dismissKey, dismissedExpiryDays);
              setVisible(false);
            }}
          >
            <X className="size-4" aria-hidden={true} />
          </button>
        </div>
      </div>
    </div>
  );
}
