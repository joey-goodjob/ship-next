import assert from 'node:assert/strict';

import { mergeConfigs } from '@/modules/config/service';

const envConfigs = {
  app_name: 'Env App',
  elevenlabs_api_key: 'sk_env_should_not_be_used',
  elevenlabs_stt_model: 'scribe_v2',
};

assert.deepEqual(mergeConfigs(envConfigs, {}), {
  app_name: 'Env App',
  elevenlabs_stt_model: 'scribe_v2',
});

assert.deepEqual(
  mergeConfigs(envConfigs, {
    elevenlabs_api_key: 'sk_db_should_be_used',
  }),
  {
    app_name: 'Env App',
    elevenlabs_api_key: 'sk_db_should_be_used',
    elevenlabs_stt_model: 'scribe_v2',
  },
);

console.log('config table only secret tests passed');
