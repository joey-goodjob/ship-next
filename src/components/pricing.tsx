"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PricingPlan {
  id: string;
  name: string;
  description?: string;
  price: string;
  originalPrice?: string;
  currency?: string;
  interval?: string;
  featured?: boolean;
  badge?: string;
  features: string[];
  buttonText?: string;
  productId?: string;
  paymentProvider?: string;
  priceInCents?: number;
  plan?: {
    name: string;
    interval: string;
    intervalCount: number;
  };
}

export interface PricingGroup {
  key: string;
  label: string;
  plans: PricingPlan[];
}

export function Pricing({
  groups,
  onCheckout,
}: {
  groups: PricingGroup[];
  onCheckout?: (plan: PricingPlan) => void;
}) {
  const t = useTranslations("common");
  const [activeGroup, setActiveGroup] = useState(groups[0]?.key || "");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const currentGroup = groups.find((g) => g.key === activeGroup) || groups[0];

  async function handleCheckout(plan: PricingPlan) {
    if (onCheckout) {
      onCheckout(plan);
      return;
    }

    if (!plan.productId || !plan.priceInCents) return;

    setLoadingId(plan.id);
    try {
      const res = await fetch("/api/payment/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: plan.productId,
          price: plan.priceInCents,
          currency: plan.currency || "usd",
          type: plan.plan ? "subscription" : "one-time",
          description: plan.name,
          plan: plan.plan,
          payment_provider: plan.paymentProvider || "stripe",
        }),
      });
      const data = await res.json();
      if (data.code === 0 && data.data?.checkout_url) {
        window.location.href = data.data.checkout_url;
      }
    } catch {
      // error handled silently
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Group tabs */}
      {groups.length > 1 && (
        <div className="flex justify-center">
          <div className="inline-flex items-center rounded-lg border border-border p-1 bg-muted/50">
            {groups.map((group) => (
              <button
                key={group.key}
                onClick={() => setActiveGroup(group.key)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                  activeGroup === group.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {group.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Plans grid */}
      <div
        className={cn(
          "mx-auto grid gap-6",
          currentGroup?.plans.length === 2
            ? "max-w-2xl sm:grid-cols-2"
            : currentGroup?.plans.length === 3
              ? "max-w-4xl sm:grid-cols-2 lg:grid-cols-3"
              : "max-w-5xl sm:grid-cols-2 lg:grid-cols-4"
        )}
      >
        {currentGroup?.plans.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "relative flex flex-col rounded-xl border p-6",
              plan.featured
                ? "border-primary shadow-lg"
                : "border-border"
            )}
          >
            {plan.badge && (
              <span className="absolute -top-3 left-4 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                {plan.badge}
              </span>
            )}

            <div className="mb-4">
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              {plan.description && (
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              )}
            </div>

            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">{plan.price}</span>
                {plan.interval && (
                  <span className="text-sm text-muted-foreground">/{plan.interval}</span>
                )}
              </div>
              {plan.originalPrice && (
                <span className="text-sm text-muted-foreground line-through">
                  {plan.originalPrice}
                </span>
              )}
            </div>

            <ul className="mb-6 flex-1 space-y-2.5">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              variant={plan.featured ? "default" : "outline"}
              className="w-full"
              onClick={() => handleCheckout(plan)}
              disabled={loadingId === plan.id}
            >
              {loadingId === plan.id
                ? t("pricing.processing")
                : plan.buttonText || t("pricing.get_started")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
