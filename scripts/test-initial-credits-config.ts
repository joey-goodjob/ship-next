import assert from 'node:assert/strict';

import { resolveInitialCreditsGrant } from '@/modules/credits/service';

const defaultGrant = resolveInitialCreditsGrant({});
assert.deepEqual(defaultGrant, {
  enabled: true,
  credits: 150,
  validDays: 0,
  description: 'Initial credits',
});

const configuredGrant = resolveInitialCreditsGrant({
  initial_credits_enabled: 'true',
  initial_credits_amount: '200',
  initial_credits_valid_days: '30',
  initial_credits_description: 'Welcome bonus',
});
assert.deepEqual(configuredGrant, {
  enabled: true,
  credits: 200,
  validDays: 30,
  description: 'Welcome bonus',
});

const disabledGrant = resolveInitialCreditsGrant({
  initial_credits_enabled: 'false',
});
assert.deepEqual(disabledGrant, {
  enabled: false,
  credits: 0,
  validDays: 0,
  description: 'Initial credits',
});

console.log('initial credits config ok');
