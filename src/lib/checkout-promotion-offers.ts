import { FIRST_MONTH_OFFER_ID } from "@/lib/pricing-offers";

const FIRST_MONTH_PROMOTION_CODE = "promo_1TniRBRUTwylBxWIvt8GCW2z";
const FIRST_MONTH_ELIGIBLE_PRODUCT_IDS = new Set([
  "creator-monthly",
  "pro-monthly",
  "ultra-monthly",
]);

export function getCheckoutPromotionCode({
  offer,
  productId,
  type,
  plan,
}: {
  offer?: string;
  productId?: string;
  type?: string;
  plan?: { interval?: string } | null;
}) {
  if (offer !== FIRST_MONTH_OFFER_ID) return undefined;
  if (type !== "subscription") return undefined;
  if (plan?.interval !== "month") return undefined;
  if (!productId || !FIRST_MONTH_ELIGIBLE_PRODUCT_IDS.has(productId)) return undefined;

  return FIRST_MONTH_PROMOTION_CODE;
}
