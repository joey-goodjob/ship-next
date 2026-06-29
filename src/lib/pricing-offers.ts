export const FIRST_MONTH_OFFER_ID = "first-month-30";
export const FIRST_MONTH_OFFER_DISCOUNT_PERCENT = 30;

const FIRST_MONTH_OFFER_ELIGIBLE_PLAN_KEYS = ["creator", "pro", "ultra"] as const;

export type FirstMonthOfferPlanKey = (typeof FIRST_MONTH_OFFER_ELIGIBLE_PLAN_KEYS)[number];
export type OfferBillingCycle = "monthly" | "annual";

export function isFirstMonthOfferEligible(planKey: string, billingCycle: OfferBillingCycle) {
  return (
    billingCycle === "monthly" &&
    FIRST_MONTH_OFFER_ELIGIBLE_PLAN_KEYS.includes(planKey as FirstMonthOfferPlanKey)
  );
}

export function getFirstMonthOfferPrice(monthlyPrice: number) {
  const discounted = monthlyPrice * (1 - FIRST_MONTH_OFFER_DISCOUNT_PERCENT / 100);
  return Number.isInteger(discounted) ? String(discounted) : discounted.toFixed(1);
}

export function getFirstMonthOfferEndsAt(nowMs = Date.now()) {
  const now = new Date(nowMs);
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    23,
    59,
    59,
    999,
  );
}

export function formatFirstMonthOfferEndDate(locale: string, nowMs = Date.now()) {
  const endsAt = getFirstMonthOfferEndsAt(nowMs);

  if (locale === "zh") {
    return `${endsAt.getMonth() + 1} 月 ${endsAt.getDate()} 日`;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(endsAt);
}

export function getFirstMonthOfferCountdown(nowMs = Date.now()) {
  const endsAtMs = getFirstMonthOfferEndsAt(nowMs).getTime();
  const remainingSeconds = Math.max(0, Math.floor((endsAtMs - nowMs) / 1000));
  const days = Math.floor(remainingSeconds / 86400);
  const hours = Math.floor((remainingSeconds % 86400) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  return { days, hours, minutes, seconds };
}
