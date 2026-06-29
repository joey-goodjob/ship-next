"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Check, Gift, Info, Mic2, Sparkles, Star, WandSparkles, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/core/i18n/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

type BillingCycle = "monthly" | "annual";
type PlanKey = "free" | "creator" | "pro" | "ultra";
type FeatureState = "included" | "unavailable";
type CheckoutPlanKey = Exclude<PlanKey, "free">;

type FeatureCopy = {
  key: string;
  label: string;
  description?: string;
};

type CreditPack = {
  credits: string;
  price: string;
};

type CreditInfoGroup = {
  title: string;
  items: Array<{
    name: string;
    description: string;
    cost: string | string[];
    badge?: string;
    discount?: string;
  }>;
};

type PricingFaq = {
  question: string;
  answer: string;
};

type PlanVisual = {
  icon: ReactNode;
  iconClassName: string;
  rotateClassName: string;
};

export type PricingCheckoutPayload = {
  product_name: string;
  plan_name: string;
  price: number;
  currency: "usd";
  type: "subscription" | "one-time";
  description: string;
  plan?: {
    name: string;
    interval: "month" | "year";
    intervalCount: 1;
  };
  credits: number;
  credits_valid_days?: number;
  redirect?: string;
  payment_provider: "stripe";
};

const PLANS: Array<{
  key: PlanKey;
  monthlyPrice: number;
  annualMonthlyPrice?: string;
  annualBilledPrice?: number;
  annualSavings?: number;
  creditsKey: string;
  featured?: boolean;
  featureStates: Record<string, FeatureState>;
}> = [
  {
    key: "free",
    monthlyPrice: 0,
    creditsKey: "free",
    featureStates: {
      resolution: "included",
      transcription: "included",
      trimmer: "included",
      watermark: "unavailable",
      commercial: "included",
      unlimited_exports: "unavailable",
      premium_models: "unavailable",
      upload_images: "unavailable",
      ai_image_edit: "unavailable",
      lip_sync: "unavailable",
      reduced_credits: "unavailable",
      premiere: "unavailable",
      resolve: "unavailable",
      final_cut: "unavailable",
    },
  },
  {
    key: "creator",
    monthlyPrice: 39,
    annualMonthlyPrice: "32.5",
    annualBilledPrice: 390,
    annualSavings: 78,
    creditsKey: "creator",
    featureStates: {
      resolution: "included",
      transcription: "included",
      trimmer: "included",
      watermark: "included",
      commercial: "included",
      unlimited_exports: "included",
      premium_models: "included",
      upload_images: "unavailable",
      ai_image_edit: "unavailable",
      lip_sync: "unavailable",
      reduced_credits: "unavailable",
      premiere: "unavailable",
      resolve: "unavailable",
      final_cut: "unavailable",
    },
  },
  {
    key: "pro",
    monthlyPrice: 99,
    annualMonthlyPrice: "82.5",
    annualBilledPrice: 990,
    annualSavings: 198,
    creditsKey: "pro",
    featured: true,
    featureStates: {
      resolution: "included",
      transcription: "included",
      trimmer: "included",
      watermark: "included",
      commercial: "included",
      unlimited_exports: "included",
      premium_models: "included",
      upload_images: "included",
      ai_image_edit: "included",
      lip_sync: "included",
      reduced_credits: "included",
      premiere: "included",
      resolve: "included",
      final_cut: "included",
    },
  },
  {
    key: "ultra",
    monthlyPrice: 149,
    annualMonthlyPrice: "124",
    annualBilledPrice: 1488,
    annualSavings: 300,
    creditsKey: "ultra",
    featureStates: {
      resolution: "included",
      transcription: "included",
      trimmer: "included",
      watermark: "included",
      commercial: "included",
      unlimited_exports: "included",
      premium_models: "included",
      upload_images: "included",
      ai_image_edit: "included",
      lip_sync: "included",
      reduced_credits: "included",
      premiere: "included",
      resolve: "included",
      final_cut: "included",
    },
  },
];

const DEFAULT_PACK_INDEX = 2;
const DEFAULT_DURATION_MINUTES = 3;
const CREDIT_PACK_VALID_DAYS = 365;

const PLAN_MONTHLY_CREDITS: Record<PlanKey, number> = {
  free: 150,
  creator: 2_000,
  pro: 6_000,
  ultra: 10_000,
};

const PLAN_VISUALS: Record<PlanKey, PlanVisual> = {
  free: {
    icon: <Gift className="size-6" />,
    iconClassName: "text-emerald-300",
    rotateClassName: "md:-rotate-[0.8deg]",
  },
  creator: {
    icon: <Mic2 className="size-6" />,
    iconClassName: "text-amber-300",
    rotateClassName: "md:rotate-[0.7deg]",
  },
  pro: {
    icon: <Star className="size-6" />,
    iconClassName: "text-brand-accent",
    rotateClassName: "md:-rotate-[0.35deg]",
  },
  ultra: {
    icon: <WandSparkles className="size-6" />,
    iconClassName: "text-sky-300",
    rotateClassName: "md:rotate-[0.9deg]",
  },
};

function findPricingPlan(planKey: PlanKey) {
  return PLANS.find((plan) => plan.key === planKey);
}

export function getPlanCheckoutPriceInCents(
  planKey: PlanKey,
  billingCycle: BillingCycle
) {
  const plan = findPricingPlan(planKey);
  if (!plan || plan.monthlyPrice <= 0) return null;

  const amount =
    billingCycle === "annual"
      ? plan.annualBilledPrice
      : plan.monthlyPrice;

  return typeof amount === "number" ? amount * 100 : null;
}

export function getPlanCheckoutCredits(
  planKey: PlanKey,
  billingCycle: BillingCycle
) {
  const monthlyCredits = PLAN_MONTHLY_CREDITS[planKey] || 0;
  return billingCycle === "annual" ? monthlyCredits * 12 : monthlyCredits;
}

export function buildPricingCheckoutPayload({
  planKey,
  billingCycle,
  planName,
}: {
  planKey: PlanKey;
  billingCycle: BillingCycle;
  planName: string;
}): PricingCheckoutPayload | null {
  if (planKey === "free") return null;

  const price = getPlanCheckoutPriceInCents(planKey, billingCycle);
  if (!price) return null;

  const interval = billingCycle === "annual" ? "year" : "month";

  return {
    product_name: planName,
    plan_name: planName,
    price,
    currency: "usd",
    type: "subscription",
    description: `${planName} ${billingCycle} plan`,
    plan: {
      name: planName,
      interval,
      intervalCount: 1,
    },
    credits: getPlanCheckoutCredits(planKey, billingCycle),
    payment_provider: "stripe",
  };
}

function parsePriceInCents(price: string) {
  const amount = Number(price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
}

function parseCreditAmount(credits: string) {
  const amount = Number(credits.replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
}

export function buildCreditPackCheckoutPayload(
  pack: CreditPack
): PricingCheckoutPayload | null {
  const credits = parseCreditAmount(pack.credits);
  const price = parsePriceInCents(pack.price);
  if (!credits || !price) return null;

  const name = `${pack.credits} credits pack`;
  return {
    product_name: name,
    plan_name: name,
    price,
    currency: "usd",
    type: "one-time",
    description: name,
    credits,
    credits_valid_days: CREDIT_PACK_VALID_DAYS,
    payment_provider: "stripe",
  };
}

function formatPrice(plan: (typeof PLANS)[number], billingCycle: BillingCycle) {
  if (plan.monthlyPrice === 0) return "$0";
  if (billingCycle === "annual" && plan.annualMonthlyPrice) {
    return `$${plan.annualMonthlyPrice}`;
  }
  return `$${plan.monthlyPrice}`;
}

function formatDollarAmount(amount: number) {
  return `$${amount.toLocaleString("en-US")}`;
}

function statusIcon(status: FeatureState) {
  if (status === "included") return <Check className="size-3.5" />;
  return <X className="size-3.5" />;
}

function PlanCard({
  plan,
  billingCycle,
  features,
}: {
  plan: (typeof PLANS)[number];
  billingCycle: BillingCycle;
  features: FeatureCopy[];
}) {
  const t = useTranslations("landing");
  const commonT = useTranslations("common");
  const locale = useLocale();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const showAnnualPrice = billingCycle === "annual" && Boolean(plan.annualBilledPrice);
  const visual = PLAN_VISUALS[plan.key];
  const planName = t(`pricing_plans.${plan.key}.name`);
  const isPaidPlan = plan.key !== "free";
  const checkoutButtonText = isCheckingOut
    ? commonT("pricing.processing")
    : t(`pricing_plans.${plan.key}.cta`);
  const signInPath =
    locale === "en"
      ? "/sign-in?redirect=/pricing"
      : `/${locale}/sign-in?redirect=/${locale}/pricing`;

  async function handleCheckout() {
    if (!isPaidPlan) return;

    const payload = buildPricingCheckoutPayload({
      planKey: plan.key as CheckoutPlanKey,
      billingCycle,
      planName,
    });

    if (!payload) return;

    setIsCheckingOut(true);
    setCheckoutError(null);

    try {
      const res = await fetch("/api/payment/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.code === 0 && data.data?.checkout_url) {
        window.location.href = data.data.checkout_url;
        return;
      }

      if (data.message === "Unauthorized") {
        window.location.href = signInPath;
        return;
      }

      setCheckoutError(data.message || "Checkout failed");
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setIsCheckingOut(false);
    }
  }

  return (
    <div
      className={cn(
        "group relative flex h-full min-h-[640px] flex-col rounded-[14px] border-2 bg-[#18191d] p-5 text-white shadow-[8px_8px_0_0_rgba(0,0,0,0.72)] transition-[transform,box-shadow] duration-200 ease-out",
        "border-white/75",
        "[@media(hover:hover)]:hover:-translate-y-1 [@media(hover:hover)]:hover:shadow-[12px_12px_0_0_rgba(0,0,0,0.78)]",
        "active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:transform-none",
        visual.rotateClassName,
        plan.featured
          ? "bg-[#1f1f22] shadow-[8px_8px_0_0_rgba(0,0,0,0.8),0_0_0_3px_rgba(245,190,32,0.2)]"
          : ""
      )}
    >
      {plan.featured ? (
        <div className="absolute -right-3 -top-4 z-10 rotate-[10deg] whitespace-nowrap rounded-full border-2 border-[#08090a] bg-brand-accent px-4 py-1 text-xs font-black uppercase text-brand-accent-ink shadow-[3px_3px_0_0_rgba(0,0,0,0.85)]">
          {t("pricing_labels.most_popular")}
        </div>
      ) : null}

      <div className="flex min-h-[132px] flex-col">
        <div
          className={cn(
            "mb-5 flex size-12 items-center justify-center rounded-full border-2 border-white/80 bg-[#111215] shadow-[2px_2px_0_0_rgba(0,0,0,0.72)]",
            visual.iconClassName
          )}
          aria-hidden="true"
        >
          {visual.icon}
        </div>
        <h3 className="text-2xl font-black leading-tight tracking-[-0.012em] text-white">
          {planName}
        </h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-white/58">
          {t(`pricing_plans.${plan.key}.note`)}
        </p>
      </div>

      <div className="mt-6">
        {showAnnualPrice ? (
          <div className="mb-1 text-sm font-black text-white/45 line-through">
            ${plan.monthlyPrice}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <span className="font-mono text-5xl font-black leading-none tracking-[-0.022em] text-white tabular-nums">
            {formatPrice(plan, billingCycle)}
          </span>
          <span className="mb-1.5 text-sm font-black text-white/58">
            / {t("pricing_labels.month")}
          </span>
        </div>
      </div>

      {showAnnualPrice ? (
        <div className="mt-2 space-y-1">
          <p className="text-sm font-semibold text-white/58">
            {t("pricing_labels.billed_annually", {
              amount: formatDollarAmount(plan.annualBilledPrice ?? 0),
            })}
          </p>
          <p className="text-sm font-black text-emerald-300">
            {t("pricing_labels.annual_savings", {
              amount: formatDollarAmount(plan.annualSavings ?? 0),
            })}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm font-semibold text-white/58">
          {t(`pricing_plans.${plan.key}.billing_note`)}
        </p>
      )}

      <div className="mt-6 flex min-h-12 items-center gap-2 rounded-[10px] border-2 border-white/18 bg-white/[0.05] px-3 py-3 text-sm font-black text-white">
        <span>{t(`pricing_plans.${plan.key}.credits`)}</span>
        <Info className="size-4 shrink-0 text-white/45" />
      </div>

      {isPaidPlan ? (
        <button
          type="button"
          disabled={isCheckingOut}
          className={cn(
            "mt-5 flex min-h-12 items-center justify-center rounded-[10px] border-2 px-4 text-center text-sm font-black transition-[transform,box-shadow,background-color,color] duration-200 ease-out",
            "shadow-[4px_4px_0_0_rgba(0,0,0,0.82)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none",
            plan.featured
              ? "border-[#08090a] bg-brand-accent text-brand-accent-ink [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:bg-brand-accent-hover [@media(hover:hover)]:hover:shadow-[6px_6px_0_0_rgba(0,0,0,0.86)]"
              : "border-white/78 bg-[#111215] text-white [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:bg-white [@media(hover:hover)]:hover:text-[#111215] [@media(hover:hover)]:hover:shadow-[6px_6px_0_0_rgba(0,0,0,0.86)]"
          )}
          onClick={handleCheckout}
        >
          {checkoutButtonText}
        </button>
      ) : (
        <Link
          href="/create"
          className={cn(
            "mt-5 flex min-h-12 items-center justify-center rounded-[10px] border-2 px-4 text-center text-sm font-black transition-[transform,box-shadow,background-color,color] duration-200 ease-out",
            "border-white/78 bg-[#111215] text-white shadow-[4px_4px_0_0_rgba(0,0,0,0.82)] active:scale-[0.97] motion-reduce:transition-none",
            "[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:bg-white [@media(hover:hover)]:hover:text-[#111215] [@media(hover:hover)]:hover:shadow-[6px_6px_0_0_rgba(0,0,0,0.86)]"
          )}
        >
          {checkoutButtonText}
        </Link>
      )}

      {checkoutError ? (
        <p className="mt-3 text-xs font-bold leading-5 text-rose-300">
          {checkoutError}
        </p>
      ) : null}

      <div className="mt-6 border-t-2 border-white/14 pt-5">
        <p className="mb-4 text-xs font-black uppercase tracking-[0.12em] text-white/42">
          {t("pricing_labels.features")}
        </p>
        <ul className="space-y-3">
          {features.map((feature) => {
            const state = plan.featureStates[feature.key] ?? "unavailable";
            return (
              <li
                key={feature.key}
                className={cn(
                  "flex items-start gap-2 text-sm font-semibold leading-5",
                  state === "included" ? "text-white" : "text-white/36"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                    state === "included"
                      ? "border-white/72 text-emerald-300"
                      : "border-white/18 text-rose-300/70"
                  )}
                >
                  {statusIcon(state)}
                </span>
                <span>
                  {feature.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function BillingToggle({
  billingCycle,
  onChange,
}: {
  billingCycle: BillingCycle;
  onChange: (value: BillingCycle) => void;
}) {
  const t = useTranslations("landing");

  return (
    <div className="mx-auto mt-8 inline-flex max-w-full items-center justify-center gap-1 rounded-lg border border-brand-line bg-[#242529] p-1 text-sm font-black text-brand-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      {(["monthly", "annual"] as const).map((cycle) => (
        <button
          key={cycle}
          type="button"
          aria-pressed={billingCycle === cycle}
          className={cn(
            "h-9 whitespace-nowrap rounded-md px-4 transition-colors",
            billingCycle === cycle
              ? "bg-[#18191d] text-white shadow-sm"
              : "text-brand-muted hover:text-white"
          )}
          onClick={() => onChange(cycle)}
        >
          {t(`pricing_labels.${cycle}`)}
        </button>
      ))}
      <span className="whitespace-nowrap rounded-full border border-emerald-400/80 px-3 py-1.5 text-xs uppercase text-emerald-400">
        {t("pricing_labels.save_two_months")}
      </span>
    </div>
  );
}

function CreditPacks({
  packs,
}: {
  packs: CreditPack[];
}) {
  const t = useTranslations("landing");
  const commonT = useTranslations("common");
  const locale = useLocale();
  const [selectedIndex, setSelectedIndex] = useState(DEFAULT_PACK_INDEX);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const selectedPack = packs[selectedIndex] ?? packs[DEFAULT_PACK_INDEX];
  const signInPath =
    locale === "en"
      ? "/sign-in?redirect=/pricing"
      : `/${locale}/sign-in?redirect=/${locale}/pricing`;
  const settingsCreditsPath =
    locale === "en" ? "/settings/credits" : `/${locale}/settings/credits`;

  async function handleCheckout() {
    const payload = buildCreditPackCheckoutPayload(selectedPack);
    if (!payload) return;

    setIsCheckingOut(true);
    setCheckoutError(null);

    try {
      const res = await fetch("/api/payment/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          redirect: settingsCreditsPath,
        }),
      });
      const data = await res.json();

      if (data.code === 0 && data.data?.checkout_url) {
        window.location.href = data.data.checkout_url;
        return;
      }

      if (data.message === "Unauthorized") {
        window.location.href = signInPath;
        return;
      }

      setCheckoutError(data.message || "Checkout failed");
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setIsCheckingOut(false);
    }
  }

  return (
    <section className="mt-20 rounded-lg border border-brand-line bg-brand-panel p-5 shadow-sm sm:p-8 lg:grid lg:grid-cols-[1fr_360px] lg:gap-10">
      <div>
        <h2 className="text-3xl font-black text-brand-ink">
          {t("credits_pack.title")}
        </h2>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-brand-muted sm:text-base">
          {t("credits_pack.description")}
        </p>
        <p className="mt-3 text-xs font-semibold leading-5 text-brand-muted">
          {t("credits_pack.expiry")}
        </p>

        <p className="mt-8 text-sm font-black text-brand-muted">
          {t("credits_pack.number_label")}
        </p>
        <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-lg border border-brand-line bg-brand-soft md:grid-cols-7">
          {packs.map((pack, index) => {
            const selected = index === selectedIndex;
            return (
              <button
                key={pack.credits}
                type="button"
                aria-pressed={selected}
                className={cn(
                  "min-h-24 border-b border-r border-brand-line px-3 py-4 text-center transition-colors md:border-b-0",
                  selected
                    ? "bg-brand-panel shadow-sm"
                    : "hover:bg-brand-panel/70"
                )}
                onClick={() => setSelectedIndex(index)}
              >
                <span className="block text-lg font-black text-brand-ink">
                  {pack.credits}
                </span>
                <span className="mt-3 block border-t border-brand-line pt-3 text-base font-black text-brand-muted">
                  {pack.price}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-8 space-y-3 text-sm font-bold text-brand-ink">
          <p className="flex items-start gap-3">
            <Check className="mt-0.5 size-5 shrink-0 text-emerald-500" />
            {t("credits_pack.included")}
          </p>
          <p className="flex items-start gap-3">
            <Check className="mt-0.5 size-5 shrink-0 text-emerald-500" />
            {t("credits_pack.creator_features")}
          </p>
          <p className="flex items-start gap-3 text-brand-muted">
            <Info className="mt-0.5 size-5 shrink-0" />
            {t("credits_pack.plan_features")}
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-brand-line bg-brand-panel p-5 lg:mt-0">
        <p className="text-sm font-black text-brand-ink">
          {t("credits_pack.purchase_title")}
        </p>
        <div className="mt-5 text-4xl font-black text-brand-ink">
          {selectedPack.price}
        </div>
        <p className="mt-3 text-sm font-semibold leading-6 text-brand-muted">
          {t("credits_pack.purchase_description")}
        </p>
        <button
          type="button"
          disabled={isCheckingOut}
          className="mt-5 flex min-h-12 w-full items-center justify-center rounded-md bg-brand-accent px-4 text-center text-sm font-black text-brand-ink transition-colors hover:bg-brand-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
          onClick={handleCheckout}
        >
          {isCheckingOut
            ? commonT("pricing.processing")
            : t("credits_pack.purchase_cta", { credits: selectedPack.credits })}
        </button>
        {checkoutError ? (
          <p className="mt-3 text-xs font-bold leading-5 text-rose-600">
            {checkoutError}
          </p>
        ) : null}
        <p className="mt-4 text-xs font-semibold leading-5 text-brand-muted">
          {t("credits_pack.applied")}
        </p>
      </div>
    </section>
  );
}

function StudioService() {
  const t = useTranslations("landing");

  return (
    <section className="mx-auto mt-12 max-w-3xl rounded-lg border border-brand-line bg-brand-panel p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-brand-accent">
            {t("pricing_studio.eyebrow")}
          </p>
          <h2 className="mt-2 text-2xl font-black text-brand-ink">
            {t("pricing_studio.title")}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">
            {t("pricing_studio.description")}
          </p>
        </div>
        <Link
          href="/create"
          className="flex h-11 shrink-0 items-center justify-center rounded-md border border-brand-line px-5 text-sm font-black text-brand-ink hover:bg-brand-soft"
        >
          {t("pricing_studio.cta")}
        </Link>
      </div>
    </section>
  );
}

function CreditsCalculator() {
  const t = useTranslations("landing");
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [backdrop, setBackdrop] = useState<"static" | "animated">("static");
  const [resolution, setResolution] = useState<"1080p" | "4k">("1080p");

  const estimatedCredits = useMemo(() => {
    const seconds = durationMinutes * 60;
    const backdropCost = backdrop === "animated" ? seconds * 4 : 0;
    const resolutionCost = resolution === "4k" ? Math.round(seconds * 0.5) : 0;
    return seconds + 130 + backdropCost + resolutionCost;
  }, [backdrop, durationMinutes, resolution]);

  const durationLabel = `${String(durationMinutes).padStart(2, "0")}:00`;

  return (
    <section className="mt-16 rounded-lg border border-brand-line bg-brand-panel p-5 shadow-sm sm:p-8 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
      <div>
        <h2 className="text-3xl font-black text-brand-ink">
          {t("pricing_calculator.title")}
        </h2>
        <div className="mt-8 space-y-8">
          <div>
            <div className="flex items-center justify-between gap-4">
              <p className="font-black text-brand-ink">
                {t("pricing_calculator.length_label")}
              </p>
              <p className="text-sm font-black text-brand-muted">{durationLabel}</p>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              value={durationMinutes}
              aria-label={t("pricing_calculator.length_aria")}
              className="mt-5 w-full accent-[var(--brand-accent)]"
              onChange={(event) => setDurationMinutes(Number(event.target.value))}
            />
            <p className="mt-3 text-xs font-semibold leading-5 text-brand-muted">
              {t("pricing_calculator.length_help")}
            </p>
          </div>

          <div>
            <p className="font-black text-brand-ink">
              {t("pricing_calculator.backdrop_label")}
            </p>
            <div className="mt-3 inline-flex rounded-md bg-brand-soft p-1 text-sm font-black">
              {(["static", "animated"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={backdrop === option}
                  className={cn(
                    "rounded px-5 py-2 transition-colors",
                    backdrop === option
                      ? "bg-brand-panel text-brand-ink shadow-sm"
                      : "text-brand-muted hover:text-brand-ink"
                  )}
                  onClick={() => setBackdrop(option)}
                >
                  {t(`pricing_calculator.${option}`)}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-brand-muted">
              {t("pricing_calculator.backdrop_help")}
            </p>
          </div>

          <div>
            <p className="font-black text-brand-ink">
              {t("pricing_calculator.resolution_label")}
            </p>
            <div className="mt-3 inline-flex rounded-md bg-brand-soft p-1 text-sm font-black">
              {(["1080p", "4k"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={resolution === option}
                  className={cn(
                    "rounded px-5 py-2 transition-colors",
                    resolution === option
                      ? "bg-brand-panel text-brand-ink shadow-sm"
                      : "text-brand-muted hover:text-brand-ink"
                  )}
                  onClick={() => setResolution(option)}
                >
                  {t(`pricing_calculator.${option}`)}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-brand-muted">
              {t("pricing_calculator.resolution_help")}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-10 flex min-h-72 flex-col items-center justify-center border-t border-brand-line text-center lg:mt-0 lg:border-l lg:border-t-0 lg:pl-10">
        <p className="font-semibold text-brand-muted">
          {t("pricing_calculator.estimate_label")}
        </p>
        <div className="mt-6 text-5xl font-black text-brand-accent">
          {estimatedCredits.toLocaleString()} {t("pricing_labels.credits_unit")}*
        </div>
        <p className="mt-5 max-w-xs text-xs font-semibold leading-5 text-brand-muted">
          {t("pricing_calculator.estimate_note")}
        </p>
      </div>
    </section>
  );
}

function CreditInfo({ groups }: { groups: CreditInfoGroup[] }) {
  const t = useTranslations("landing");

  return (
    <section className="mt-16 rounded-lg border border-brand-line bg-brand-panel p-5 shadow-sm sm:p-8">
      <h2 className="text-3xl font-black text-brand-ink">
        {t("pricing_labels.credit_info")}
      </h2>
      <div className="mt-8 space-y-10">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="font-black text-brand-ink">{group.title}</h3>
            <div className="mt-5 divide-y divide-brand-line border-t border-brand-line">
              {group.items.map((item) => (
                <div key={item.name} className="grid gap-4 py-5 text-sm md:grid-cols-[1fr_0.9fr]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-brand-ink">{item.name}</p>
                      {item.badge ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black uppercase text-amber-700">
                          {item.badge}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs font-semibold leading-5 text-brand-muted">
                      {item.description}
                    </p>
                  </div>
                  <div className="font-semibold leading-6 text-brand-ink">
                    {Array.isArray(item.cost) ? (
                      <ul className="space-y-1">
                        {item.cost.map((line) => (
                          <li key={line} className="flex gap-2">
                            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-ink" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>{item.cost}</p>
                    )}
                    {item.discount ? (
                      <p className="mt-2 text-xs font-black text-emerald-600">
                        {item.discount}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EnterpriseSection() {
  const t = useTranslations("landing");
  const features = t.raw("enterprise.features") as string[];

  return (
    <section className="mt-20 grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr]">
      <h2 className="text-4xl font-black leading-tight text-brand-ink">
        {t("enterprise.pitch")}
      </h2>
      <div className="rounded-lg border border-brand-line bg-brand-panel p-5 shadow-sm sm:p-6">
        <p className="font-black text-brand-ink">{t("enterprise.name")}</p>
        <h3 className="mt-8 text-4xl font-black text-brand-ink">
          {t("enterprise.title")}
        </h3>
        <Link
          href="/create"
          className="mt-6 flex h-12 items-center justify-center rounded-md border border-brand-ink px-4 text-center text-sm font-black text-brand-ink hover:bg-brand-soft"
        >
          {t("enterprise.cta")}
        </Link>
        <ul className="mt-7 space-y-3 border-t border-brand-line pt-6 text-sm font-semibold text-brand-ink">
          {features.map((item) => (
            <li key={item} className="flex gap-2">
              <Check className="mt-0.5 size-5 shrink-0 text-emerald-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs font-semibold leading-5 text-brand-muted">
          {t("enterprise.note")}
        </p>
      </div>
    </section>
  );
}

export function Pricing({ title }: { title?: string } = {}) {
  const t = useTranslations("landing");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const features = t.raw("pricing_features") as FeatureCopy[];
  const creditPacks = t.raw("pricing_credit_packs") as CreditPack[];
  const creditInfoGroups = t.raw("pricing_credit_info") as CreditInfoGroup[];
  const faqItems = t.raw("pricing_faq.items") as PricingFaq[];

  return (
    <main className="bg-brand-panel text-brand-ink">
      <section
        id="pricing"
        className="relative overflow-hidden bg-[#0b0c0f] px-5 pb-16 pt-10 text-white sm:pb-24"
      >
        <div
          className="pointer-events-none absolute left-7 top-28 hidden rotate-[-12deg] text-4xl text-brand-accent drop-shadow-[3px_3px_0_rgba(0,0,0,0.8)] md:block"
          aria-hidden="true"
        >
          *
        </div>
        <div
          className="pointer-events-none absolute right-9 top-24 hidden rotate-[12deg] text-4xl text-brand-accent drop-shadow-[3px_3px_0_rgba(0,0,0,0.8)] md:block"
          aria-hidden="true"
        >
          ++
        </div>
        <div
          className="pointer-events-none absolute left-1/2 top-40 h-3 w-48 -translate-x-1/2 rotate-[-1deg] rounded-full bg-brand-accent/20 blur-sm"
          aria-hidden="true"
        />
        <div className="mx-auto max-w-[1280px]">
          <div className="text-center">
            <div className="mx-auto mb-5 inline-flex rotate-[-1deg] items-center gap-2 rounded-full border-2 border-white/18 bg-white/[0.05] px-4 py-2 text-xs font-black uppercase text-white/62 shadow-[3px_3px_0_0_rgba(0,0,0,0.55)]">
              <Sparkles className="size-4 text-brand-accent" />
              {t("pricing.eyebrow")}
            </div>
            <h1 className="mx-auto max-w-4xl text-balance text-5xl font-black leading-tight tracking-[-0.022em] text-white sm:text-[64px]">
              {title ?? t("pricing.title")}
            </h1>
            <p className="mx-auto mt-4 max-w-3xl text-pretty text-lg font-semibold leading-8 text-white/58 sm:text-2xl">
              {t("pricing.description")}
            </p>
            <BillingToggle
              billingCycle={billingCycle}
              onChange={setBillingCycle}
            />
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.key}
                plan={plan}
                billingCycle={billingCycle}
                features={features}
              />
            ))}
          </div>

          <div className="text-brand-ink">
            <CreditPacks packs={creditPacks} />
            <StudioService />
            <CreditsCalculator />
            <CreditInfo groups={creditInfoGroups} />
            <EnterpriseSection />
          </div>
        </div>
      </section>

      <section className="bg-brand-soft px-5 py-24 text-center">
        <h2 className="text-4xl font-black leading-tight text-brand-ink">
          {t("pricing_faq.title")}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl font-semibold leading-7 text-brand-muted">
          {t("pricing_faq.description")}
        </p>
        <Accordion
          className="mx-auto mt-12 max-w-[760px] overflow-hidden rounded-lg border border-brand-line bg-brand-panel text-left shadow-sm"
          defaultValue={["0"]}
        >
          {faqItems.map((item, index) => (
            <AccordionItem
              key={item.question}
              value={String(index)}
              className="border-brand-line"
            >
              <AccordionTrigger className="px-5 py-6 text-left font-black text-brand-ink hover:no-underline">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-6 font-semibold leading-8 text-brand-muted">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="bg-brand-cta-gradient px-5 py-20 text-center">
        <p className="mx-auto max-w-2xl text-lg font-semibold leading-9 text-brand-ink">
          {t("pricing_cta.copy")}
        </p>
        <Link
          href="/create"
          className="mt-8 inline-flex min-h-[56px] items-center justify-center rounded-md bg-brand-accent px-8 text-lg font-black uppercase text-brand-ink hover:bg-brand-accent/90"
        >
          {t("pricing_cta.cta")}
        </Link>
      </section>
    </main>
  );
}
