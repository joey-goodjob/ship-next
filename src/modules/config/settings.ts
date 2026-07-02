/**
 * Settings definitions — tabs, groups, and fields.
 *
 * This drives the admin settings UI. Add new settings here
 * and they'll automatically appear in the admin panel.
 */

export interface Setting {
  name: string;
  title: string;
  type: 'text' | 'password' | 'textarea' | 'number' | 'switch' | 'select';
  placeholder?: string;
  options?: { label: string; value: string }[];
  tip?: string;
  group: string;
  tab: string;
  defaultValue?: string;
}

export interface SettingGroup {
  name: string;
  title: string;
  description?: string;
  tab: string;
}

export interface SettingTab {
  name: string;
  title: string;
}

export function getSettingTabs(): SettingTab[] {
  return [
    { name: 'general', title: 'General' },
    { name: 'auth', title: 'Auth' },
    { name: 'payment', title: 'Payment' },
    { name: 'email', title: 'Email' },
    { name: 'storage', title: 'Storage' },
    { name: 'ai', title: 'AI' },
    { name: 'analytics', title: 'Analytics' },
  ];
}

export function getSettingGroups(): SettingGroup[] {
  return [
    // General
    { name: 'appinfo', title: 'App Info', description: 'Basic application settings', tab: 'general' },
    { name: 'user_role', title: 'User Roles', description: 'Default role for new users', tab: 'general' },
    { name: 'credit', title: 'Credits', description: 'Initial credits for new users', tab: 'general' },

    // Auth
    { name: 'email_auth', title: 'Email Auth', description: 'Email/password authentication', tab: 'auth' },
    { name: 'google_auth', title: 'Google Auth', description: 'Google OAuth login', tab: 'auth' },
    { name: 'github_auth', title: 'GitHub Auth', description: 'GitHub OAuth login', tab: 'auth' },

    // Payment
    { name: 'basic_payment', title: 'Basic', description: 'Payment general settings', tab: 'payment' },
    { name: 'stripe', title: 'Stripe', description: 'Stripe payment gateway', tab: 'payment' },
    { name: 'creem', title: 'Creem', description: 'Creem payment gateway', tab: 'payment' },
    { name: 'paypal', title: 'PayPal', description: 'PayPal payment gateway', tab: 'payment' },
    { name: 'alipay', title: 'Alipay', description: 'Alipay payment gateway (native)', tab: 'payment' },
    { name: 'wechat', title: 'WeChat Pay', description: 'WeChat Pay gateway (native)', tab: 'payment' },

    // Email
    { name: 'resend', title: 'Resend', description: 'Resend email service', tab: 'email' },

    // Storage
    { name: 'r2', title: 'Cloudflare R2 / S3', description: 'Object storage settings', tab: 'storage' },

    // AI
    { name: 'replicate', title: 'Replicate', description: 'Replicate AI API', tab: 'ai' },
    { name: 'kie', title: 'Kie / Kling', description: 'Kie AI image, video, and Gemini chat API', tab: 'ai' },
    { name: 'wavespeed', title: 'WaveSpeed', description: 'WaveSpeed GPT Image 2 API', tab: 'ai' },
    { name: 'elevenlabs', title: 'ElevenLabs / Speech to Text', description: 'ElevenLabs Scribe speech-to-text API', tab: 'ai' },
    { name: 'groq', title: 'Groq / Whisper', description: 'Groq speech-to-text transcription API', tab: 'ai' },
    { name: 'gemini', title: 'Gemini', description: 'Google Gemini API', tab: 'ai' },
    { name: 'fal', title: 'Fal', description: 'Fal AI API', tab: 'ai' },

    // Analytics
    { name: 'google_analytics', title: 'Google Analytics', description: 'Google Analytics settings', tab: 'analytics' },
    { name: 'clarity', title: 'Clarity', description: 'Microsoft Clarity settings', tab: 'analytics' },
    { name: 'plausible', title: 'Plausible', description: 'Plausible analytics settings', tab: 'analytics' },
  ];
}

export function getSettings(): Setting[] {
  return [
    // ─── General / App Info ──────────────────────────────────────────
    { name: 'app_name', title: 'App Name', type: 'text', placeholder: 'My App', group: 'appinfo', tab: 'general' },
    { name: 'app_description', title: 'App Description', type: 'textarea', placeholder: 'Create static AI lyric videos from your songs in minutes.', group: 'appinfo', tab: 'general' },
    { name: 'app_url', title: 'App URL', type: 'text', placeholder: 'https://lyricvideomaker.app', group: 'appinfo', tab: 'general' },

    // ─── General / User Roles ────────────────────────────────────────
    { name: 'initial_role_enabled', title: 'Auto-assign role for new users', type: 'switch', group: 'user_role', tab: 'general' },
    { name: 'initial_role_name', title: 'Default role name', type: 'text', placeholder: 'viewer', group: 'user_role', tab: 'general' },

    // ─── General / Credits ───────────────────────────────────────────
    { name: 'initial_credits_enabled', title: 'Grant credits on signup', type: 'switch', group: 'credit', tab: 'general', defaultValue: 'true' },
    { name: 'initial_credits_amount', title: 'Credits amount', type: 'number', placeholder: '150', group: 'credit', tab: 'general', defaultValue: '150' },
    { name: 'initial_credits_valid_days', title: 'Valid days', type: 'number', placeholder: '0', group: 'credit', tab: 'general', defaultValue: '0' },
    { name: 'initial_credits_description', title: 'Description', type: 'text', placeholder: 'Welcome bonus', group: 'credit', tab: 'general' },

    // ─── Auth / Email ────────────────────────────────────────────────
    { name: 'email_auth_enabled', title: 'Enable email auth', type: 'switch', group: 'email_auth', tab: 'auth', defaultValue: 'true' },
    { name: 'email_verification_enabled', title: 'Require email verification on sign up', type: 'switch', group: 'email_auth', tab: 'auth', defaultValue: 'false' },
    { name: 'invite_code_required', title: 'Require invite code on sign up', type: 'switch', group: 'email_auth', tab: 'auth', defaultValue: 'false' },

    // ─── Auth / Google ───────────────────────────────────────────────
    { name: 'google_auth_enabled', title: 'Enable Google auth', type: 'switch', group: 'google_auth', tab: 'auth' },
    { name: 'google_client_id', title: 'Client ID', type: 'text', placeholder: 'xxx.apps.googleusercontent.com', group: 'google_auth', tab: 'auth' },
    { name: 'google_client_secret', title: 'Client Secret', type: 'password', placeholder: 'GOCSPX-xxx', group: 'google_auth', tab: 'auth' },

    // ─── Auth / GitHub ───────────────────────────────────────────────
    { name: 'github_auth_enabled', title: 'Enable GitHub auth', type: 'switch', group: 'github_auth', tab: 'auth' },
    { name: 'github_client_id', title: 'Client ID', type: 'text', placeholder: 'Ov23xxx', group: 'github_auth', tab: 'auth' },
    { name: 'github_client_secret', title: 'Client Secret', type: 'password', placeholder: 'xxx', group: 'github_auth', tab: 'auth' },

    // ─── Payment / Basic ─────────────────────────────────────────────
    { name: 'select_payment_enabled', title: 'Show payment method selector', type: 'switch', group: 'basic_payment', tab: 'payment' },
    {
      name: 'default_payment_provider', title: 'Default provider', type: 'select',
      options: [
        { label: 'Stripe', value: 'stripe' },
        { label: 'Creem', value: 'creem' },
        { label: 'PayPal', value: 'paypal' },
        { label: 'Alipay', value: 'alipay' },
        { label: 'WeChat Pay', value: 'wechat' },
      ],
      group: 'basic_payment', tab: 'payment',
    },

    // ─── Payment / Stripe ────────────────────────────────────────────
    { name: 'stripe_enabled', title: 'Enable Stripe', type: 'switch', group: 'stripe', tab: 'payment' },
    { name: 'stripe_publishable_key', title: 'Publishable Key', type: 'text', placeholder: 'pk_xxx', group: 'stripe', tab: 'payment' },
    { name: 'stripe_api_key', title: 'Secret Key', type: 'password', placeholder: 'sk_xxx', group: 'stripe', tab: 'payment' },
    { name: 'stripe_webhook_secret', title: 'Webhook Secret', type: 'password', placeholder: 'whsec_xxx', group: 'stripe', tab: 'payment' },

    // ─── Payment / Creem ─────────────────────────────────────────────
    { name: 'creem_enabled', title: 'Enable Creem', type: 'switch', group: 'creem', tab: 'payment' },
    {
      name: 'creem_environment', title: 'Environment', type: 'select',
      options: [
        { label: 'Sandbox', value: 'sandbox' },
        { label: 'Production', value: 'production' },
      ],
      group: 'creem', tab: 'payment', defaultValue: 'sandbox',
    },
    { name: 'creem_api_key', title: 'API Key', type: 'password', placeholder: 'creem_xxx', group: 'creem', tab: 'payment' },
    { name: 'creem_signing_secret', title: 'Signing Secret', type: 'password', placeholder: 'whsec_xxx', group: 'creem', tab: 'payment' },
    { name: 'creem_test_amount', title: 'Test amount (cents)', type: 'number', placeholder: '留空使用实际金额，填 1 则支付 $0.01', group: 'creem', tab: 'payment' },

    // ─── Payment / PayPal ────────────────────────────────────────────
    { name: 'paypal_enabled', title: 'Enable PayPal', type: 'switch', group: 'paypal', tab: 'payment' },
    { name: 'paypal_client_id', title: 'Client ID', type: 'text', placeholder: 'xxx', group: 'paypal', tab: 'payment' },
    { name: 'paypal_client_secret', title: 'Client Secret', type: 'password', placeholder: 'xxx', group: 'paypal', tab: 'payment' },
    { name: 'paypal_webhook_id', title: 'Webhook ID', type: 'text', placeholder: 'xxx', group: 'paypal', tab: 'payment' },
    {
      name: 'paypal_environment', title: 'Environment', type: 'select',
      options: [
        { label: 'Sandbox', value: 'sandbox' },
        { label: 'Live', value: 'live' },
      ],
      group: 'paypal', tab: 'payment',
    },
    { name: 'paypal_test_amount', title: 'Test amount (cents)', type: 'number', placeholder: '留空使用实际金额，填 1 则支付 $0.01', group: 'paypal', tab: 'payment' },

    // ─── Payment / Alipay ─────────────────────────────────────────────
    { name: 'alipay_enabled', title: 'Enable Alipay', type: 'switch', group: 'alipay', tab: 'payment' },
    { name: 'alipay_app_id', title: 'App ID', type: 'text', placeholder: '2021xxx', group: 'alipay', tab: 'payment' },
    { name: 'alipay_private_key', title: 'Private Key (RSA2)', type: 'textarea', placeholder: 'MIIEvQIBADANBgkq...', group: 'alipay', tab: 'payment' },
    { name: 'alipay_public_key', title: 'Alipay Public Key', type: 'textarea', placeholder: 'MIIBIjANBgkq...', group: 'alipay', tab: 'payment' },
    { name: 'alipay_notify_url', title: 'Notify URL (Webhook)', type: 'text', placeholder: 'https://lyricvideomaker.app/api/payment/notify/alipay', group: 'alipay', tab: 'payment' },
    { name: 'alipay_test_amount', title: 'Test amount (分)', type: 'number', placeholder: '留空使用实际金额，填 1 则支付 ¥0.01', group: 'alipay', tab: 'payment' },

    // ─── Payment / WeChat Pay ───────────────────────────────────────
    { name: 'wechat_enabled', title: 'Enable WeChat Pay', type: 'switch', group: 'wechat', tab: 'payment' },
    { name: 'wechat_app_id', title: 'AppID', type: 'text', placeholder: 'wx1234567890', group: 'wechat', tab: 'payment' },
    { name: 'wechat_mch_id', title: 'Merchant ID (商户号)', type: 'text', placeholder: '1900000001', group: 'wechat', tab: 'payment' },
    { name: 'wechat_api_v3_key', title: 'APIv3 Key (32位密钥)', type: 'password', placeholder: '32 chars', group: 'wechat', tab: 'payment' },
    { name: 'wechat_private_key', title: 'Merchant Private Key (PEM)', type: 'textarea', placeholder: 'MIIEvgIBADANBgkq...', group: 'wechat', tab: 'payment' },
    { name: 'wechat_serial_no', title: 'Certificate Serial No', type: 'text', placeholder: 'xxx', group: 'wechat', tab: 'payment' },
    { name: 'wechat_notify_url', title: 'Notify URL (Webhook)', type: 'text', placeholder: 'https://lyricvideomaker.app/api/payment/notify/wechat', group: 'wechat', tab: 'payment' },
    { name: 'wechat_test_amount', title: 'Test amount (分)', type: 'number', placeholder: '留空使用实际金额，填 1 则支付 ¥0.01', group: 'wechat', tab: 'payment' },

    // ─── Email / Resend ──────────────────────────────────────────────
    { name: 'resend_api_key', title: 'API Key', type: 'password', placeholder: 're_xxx', group: 'resend', tab: 'email' },
    { name: 'resend_email_from', title: 'From Address', type: 'text', placeholder: 'hello@example.com', group: 'resend', tab: 'email' },

    // ─── Storage / R2 ────────────────────────────────────────────────
    { name: 'storage_endpoint', title: 'Endpoint', type: 'text', placeholder: 'https://xxx.r2.cloudflarestorage.com', group: 'r2', tab: 'storage' },
    { name: 'storage_region', title: 'Region', type: 'text', placeholder: 'auto', group: 'r2', tab: 'storage' },
    { name: 'storage_access_key', title: 'Access Key', type: 'password', placeholder: 'xxx', group: 'r2', tab: 'storage' },
    { name: 'storage_secret_key', title: 'Secret Key', type: 'password', placeholder: 'xxx', group: 'r2', tab: 'storage' },
    { name: 'storage_bucket', title: 'Bucket', type: 'text', placeholder: 'my-bucket', group: 'r2', tab: 'storage' },
    { name: 'storage_public_domain', title: 'Public Domain', type: 'text', placeholder: 'https://cdn.example.com', group: 'r2', tab: 'storage' },

    // ─── AI / Replicate ──────────────────────────────────────────────
    { name: 'replicate_api_token', title: 'API Token', type: 'password', placeholder: 'r8_xxx', group: 'replicate', tab: 'ai' },

    // ─── AI / Kie ────────────────────────────────────────────────────
    { name: 'kie_api_key', title: 'API Key', type: 'password', placeholder: 'kie_xxx', group: 'kie', tab: 'ai' },
    { name: 'kie_chat_endpoint', title: 'Chat Endpoint', type: 'text', placeholder: 'https://api.kie.ai/gemini-2.5-flash/v1/chat/completions', group: 'kie', tab: 'ai' },
    { name: 'kie_chat_model', title: 'Chat Model', type: 'text', placeholder: 'gemini-2.5-flash', group: 'kie', tab: 'ai' },
    { name: 'kie_claude_endpoint', title: 'Claude Endpoint', type: 'text', placeholder: 'https://api.kie.ai/claude/v1/messages', group: 'kie', tab: 'ai' },
    { name: 'kie_claude_model', title: 'Claude Model', type: 'text', placeholder: 'Claude model name', group: 'kie', tab: 'ai' },
    { name: 'kie_codex_endpoint', title: 'Codex Endpoint', type: 'text', placeholder: 'https://api.kie.ai/codex/v1/responses', group: 'kie', tab: 'ai' },
    { name: 'kie_codex_model', title: 'Codex Model', type: 'text', placeholder: 'gpt-5-5', group: 'kie', tab: 'ai' },
    { name: 'kie_image_model', title: 'Image Model', type: 'text', placeholder: 'z-image', group: 'kie', tab: 'ai' },
    { name: 'kie_character_image_model', title: 'Character Image Model', type: 'text', placeholder: 'nano-banana-2', group: 'kie', tab: 'ai' },

    // ─── AI / WaveSpeed ──────────────────────────────────────────────
    { name: 'wavespeed_api_key', title: 'API Key', type: 'password', placeholder: 'ws_xxx', group: 'wavespeed', tab: 'ai' },
    { name: 'wavespeed_base_url', title: 'Base URL', type: 'text', placeholder: 'https://api.wavespeed.ai/api/v3', group: 'wavespeed', tab: 'ai' },
    { name: 'wavespeed_image_model', title: 'Image Model', type: 'text', placeholder: 'openai/gpt-image-2/text-to-image', group: 'wavespeed', tab: 'ai' },
    { name: 'wavespeed_image_quality', title: 'Image Quality', type: 'text', placeholder: 'medium', group: 'wavespeed', tab: 'ai' },
    {
      name: 'lyric_video_image_provider', title: 'Lyric Video Image Provider', type: 'select',
      options: [
        { label: 'Kie', value: 'kie' },
        { label: 'WaveSpeed', value: 'wavespeed' },
      ],
      group: 'wavespeed', tab: 'ai', defaultValue: 'kie',
    },

    // ─── AI / ElevenLabs ─────────────────────────────────────────────
    { name: 'elevenlabs_api_key', title: 'API Key', type: 'password', placeholder: 'sk_xxx', group: 'elevenlabs', tab: 'ai' },
    { name: 'elevenlabs_stt_model', title: 'Speech to Text Model', type: 'text', placeholder: 'scribe_v2', group: 'elevenlabs', tab: 'ai' },

    // ─── AI / Groq ───────────────────────────────────────────────────
    { name: 'groq_api_key', title: 'API Key', type: 'password', placeholder: 'gsk_xxx', group: 'groq', tab: 'ai' },
    { name: 'groq_base_url', title: 'Base URL', type: 'text', placeholder: 'https://api.groq.com/openai/v1', group: 'groq', tab: 'ai' },
    { name: 'groq_transcribe_model', title: 'Transcribe Model', type: 'text', placeholder: 'whisper-large-v3', group: 'groq', tab: 'ai' },

    // ─── AI / Gemini ─────────────────────────────────────────────────
    { name: 'gemini_api_key', title: 'API Key', type: 'password', placeholder: 'xxx', group: 'gemini', tab: 'ai' },

    // ─── AI / Fal ────────────────────────────────────────────────────
    { name: 'fal_api_key', title: 'API Key', type: 'password', placeholder: 'xxx', group: 'fal', tab: 'ai' },

    // ─── Analytics / Google Analytics ────────────────────────────────
    { name: 'google_analytics_id', title: 'Google Analytics ID', type: 'text', placeholder: 'G-XXXXXXXXXX', group: 'google_analytics', tab: 'analytics' },

    // ─── Analytics / Clarity ─────────────────────────────────────────
    { name: 'clarity_id', title: 'Clarity ID', type: 'text', placeholder: 'xxxxxxxxxx', group: 'clarity', tab: 'analytics' },
    { name: 'clarity_api_token', title: 'Data Export API Token', type: 'password', placeholder: 'Bearer token from Clarity Data Export', group: 'clarity', tab: 'analytics' },

    // ─── Analytics / Plausible ───────────────────────────────────────
    { name: 'plausible_domain', title: 'Plausible Domain', type: 'text', placeholder: 'lyricvideomaker.app', group: 'plausible', tab: 'analytics' },
    { name: 'plausible_src', title: 'Plausible Script Src', type: 'text', placeholder: 'https://plausible.example.com/js/script.js', group: 'plausible', tab: 'analytics' },
  ];
}
