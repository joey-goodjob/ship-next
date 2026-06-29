import assert from "node:assert/strict";

import {
  FIRST_MONTH_OFFER_ID,
  formatFirstMonthOfferEndDate,
  getFirstMonthOfferEndsAt,
  getFirstMonthOfferPrice,
  getFirstMonthOfferCountdown,
  isFirstMonthOfferEligible,
} from "../src/lib/pricing-offers";
import { getCheckoutPromotionCode } from "../src/lib/checkout-promotion-offers";

assert.equal(FIRST_MONTH_OFFER_ID, "first-month-30");

assert.equal(getFirstMonthOfferPrice(39), "27.3");
assert.equal(getFirstMonthOfferPrice(99), "69.3");
assert.equal(getFirstMonthOfferPrice(149), "104.3");

const june29Noon = new Date("2026-06-29T12:00:00-04:00").getTime();
const rollingEnd = getFirstMonthOfferEndsAt(june29Noon);
assert.equal(rollingEnd.getFullYear(), 2026);
assert.equal(rollingEnd.getMonth(), 5);
assert.equal(rollingEnd.getDate(), 30);
assert.equal(rollingEnd.getHours(), 23);
assert.equal(rollingEnd.getMinutes(), 59);
assert.equal(rollingEnd.getSeconds(), 59);
assert.equal(formatFirstMonthOfferEndDate("en", june29Noon), "Jun 30");
assert.equal(formatFirstMonthOfferEndDate("zh", june29Noon), "6 月 30 日");

assert.deepEqual(
  getFirstMonthOfferCountdown(june29Noon),
  { days: 1, hours: 11, minutes: 59, seconds: 59 },
);

assert.equal(isFirstMonthOfferEligible("creator", "monthly"), true);
assert.equal(isFirstMonthOfferEligible("pro", "monthly"), true);
assert.equal(isFirstMonthOfferEligible("ultra", "monthly"), true);
assert.equal(isFirstMonthOfferEligible("free", "monthly"), false);
assert.equal(isFirstMonthOfferEligible("creator", "annual"), false);

assert.equal(
  getCheckoutPromotionCode({
    offer: "first-month-30",
    productId: "creator-monthly",
    type: "subscription",
    plan: { interval: "month" },
  }),
  "promo_1TniRBRUTwylBxWIvt8GCW2z",
);

assert.equal(
  getCheckoutPromotionCode({
    offer: "first-month-30",
    productId: "creator-annual",
    type: "subscription",
    plan: { interval: "year" },
  }),
  undefined,
);

assert.equal(
  getCheckoutPromotionCode({
    offer: "first-month-30",
    productId: "2500-credits-pack",
    type: "one-time",
  }),
  undefined,
);

assert.equal(
  getCheckoutPromotionCode({
    offer: "unknown-offer",
    productId: "creator-monthly",
    type: "subscription",
    plan: { interval: "month" },
  }),
  undefined,
);

console.log("pricing offer discount checks passed");
