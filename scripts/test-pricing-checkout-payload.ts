import assert from 'node:assert/strict';

import {
  buildPricingCheckoutPayload,
  getPlanCheckoutCredits,
  getPlanCheckoutPriceInCents,
} from '../src/blocks/pricing';

const creatorMonthly = buildPricingCheckoutPayload({
  planKey: 'creator',
  billingCycle: 'monthly',
  planName: 'Creator',
});

assert.equal(creatorMonthly?.price, 3900);
assert.equal(creatorMonthly?.currency, 'usd');
assert.equal(creatorMonthly?.type, 'subscription');
assert.equal(creatorMonthly?.payment_provider, 'stripe');
assert.equal(creatorMonthly?.credits, 2000);
assert.deepEqual(creatorMonthly?.plan, {
  name: 'Creator',
  interval: 'month',
  intervalCount: 1,
});
assert.equal(creatorMonthly?.product_id, 'creator-monthly');
assert.equal(creatorMonthly?.offer, undefined);

const creatorMonthlyOffer = buildPricingCheckoutPayload({
  planKey: 'creator',
  billingCycle: 'monthly',
  planName: 'Creator',
  offer: 'first-month-30',
});

assert.equal(creatorMonthlyOffer?.offer, 'first-month-30');

const proAnnual = buildPricingCheckoutPayload({
  planKey: 'pro',
  billingCycle: 'annual',
  planName: 'Pro',
  offer: 'first-month-30',
});

assert.equal(proAnnual?.price, 99000);
assert.equal(proAnnual?.credits, 72000);
assert.equal(proAnnual?.product_id, 'pro-annual');
assert.equal(proAnnual?.offer, undefined);
assert.deepEqual(proAnnual?.plan, {
  name: 'Pro',
  interval: 'year',
  intervalCount: 1,
});

assert.equal(getPlanCheckoutPriceInCents('ultra', 'annual'), 148800);
assert.equal(getPlanCheckoutCredits('ultra', 'annual'), 120000);
assert.equal(buildPricingCheckoutPayload({
  planKey: 'free',
  billingCycle: 'monthly',
  planName: 'Free',
}), null);

console.log('pricing checkout payload checks passed');
