"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SparklesIcon } from "lucide-react";
import { Link } from "@/core/i18n/navigation";
import { cn } from "@/lib/utils";

interface PlanState {
  balance: number;
  planName: string | null;
  description: string | null;
  creditsAmount: number | null;
  creditsValidDays: number | null;
}

export function PlanCard({ buyHref = "/pricing" }: { buyHref?: string }) {
  const t = useTranslations("common.planCard");
  const [state, setState] = useState<PlanState | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/credits").then((r) => r.json()).catch(() => null),
      fetch("/api/user/subscriptions/current").then((r) => r.json()).catch(() => null),
    ]).then(([credits, sub]) => {
      if (!active) return;
      const balance = Number(credits?.data?.balance) || 0;
      const s = sub?.data || null;
      setState({
        balance,
        planName: s?.planName || s?.productName || null,
        description: s?.description || null,
        creditsAmount: s?.creditsAmount ?? null,
        creditsValidDays: s?.creditsValidDays ?? null,
      });
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const balance = state?.balance ?? 0;
  const total = state?.creditsAmount ?? 0;
  const hasTotal = total > 0;
  const pct = hasTotal ? Math.min(100, Math.round((balance / total) * 100)) : 0;
  const planName = state?.planName || t("free");

  return (
    <div
      className={cn(
        "rounded-xl border border-brand-line bg-brand-soft/60 p-3 text-brand-ink",
        "group-data-[collapsible=icon]:hidden",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-brand-muted">
          {t("title")}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-accent-soft px-2 py-0.5 text-[11px] font-semibold text-brand-accent-ink">
          <SparklesIcon className="size-3" />
          {planName}
        </span>
      </div>

      {state?.description && (
        <p className="mt-1 truncate text-xs text-brand-muted">{state.description}</p>
      )}

      <Link href="/settings/credits" className="group/credits mt-3 block">
        <p className="text-xs text-brand-muted">{t("creditsRemaining")}</p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums transition-colors group-hover/credits:text-brand-accent-hover">
          {loaded ? balance.toLocaleString() : "..."}
          {hasTotal && (
            <span className="text-sm font-normal text-brand-muted">
              {" "}
              / {total.toLocaleString()}
            </span>
          )}
        </p>

        {hasTotal && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brand-line">
            <div
              className="h-full rounded-full bg-brand-accent transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </Link>

      {state?.creditsValidDays ? (
        <p className="mt-2 text-[11px] text-brand-muted">
          {t("outputKept", { days: state.creditsValidDays })}
        </p>
      ) : null}

      <Link
        href={buyHref}
        className="mt-3 flex w-full items-center justify-center rounded-lg border border-brand-line bg-brand-panel px-3 py-2 text-xs font-medium text-brand-ink transition-colors hover:bg-brand-soft active:scale-[0.98]"
      >
        {t("buyCredits")}
      </Link>
    </div>
  );
}
