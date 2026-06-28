import assert from "node:assert/strict";

import { buildCreditPackCheckoutPayload } from "../src/blocks/pricing";

const payload = buildCreditPackCheckoutPayload({
  credits: "2,500",
  price: "$50",
});

assert.deepEqual(payload, {
  product_name: "2,500 credits pack",
  plan_name: "2,500 credits pack",
  price: 5000,
  currency: "usd",
  type: "one-time",
  description: "2,500 credits pack",
  credits: 2500,
  credits_valid_days: 365,
  payment_provider: "stripe",
});

assert.equal(
  buildCreditPackCheckoutPayload({ credits: "", price: "$50" }),
  null,
  "invalid credit amount should not create checkout payload",
);

assert.equal(
  buildCreditPackCheckoutPayload({ credits: "2,500", price: "" }),
  null,
  "invalid price should not create checkout payload",
);

console.log("pricing credit pack checkout payload checks passed");
