export const envConfigs: Record<string, string> = {
  // App
  app_url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  app_name: process.env.NEXT_PUBLIC_APP_NAME ?? 'ShipAny Next',
  app_description: process.env.NEXT_PUBLIC_APP_DESCRIPTION ?? 'Ship your SaaS faster',
  app_logo: process.env.NEXT_PUBLIC_APP_LOGO ?? '/logo.png',

  // Database
  database_url: process.env.DATABASE_URL ?? '',
  database_auth_token: process.env.DATABASE_AUTH_TOKEN ?? '',
  database_provider: process.env.DATABASE_PROVIDER ?? 'sqlite',
  db_schema: process.env.DB_SCHEMA ?? 'public',
  db_singleton_enabled: process.env.DB_SINGLETON_ENABLED ?? 'false',
  db_max_connections: process.env.DB_MAX_CONNECTIONS ?? '1',

  // Auth
  auth_url: process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '',
  auth_secret: process.env.AUTH_SECRET ?? '',

  // Payment - Stripe
  stripe_secret_key: process.env.STRIPE_SECRET_KEY ?? '',
  stripe_publishable_key: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
  stripe_signing_secret: process.env.STRIPE_SIGNING_SECRET ?? '',

  // Payment - PayPal
  paypal_client_id: process.env.PAYPAL_CLIENT_ID ?? '',
  paypal_client_secret: process.env.PAYPAL_CLIENT_SECRET ?? '',
  paypal_webhook_id: process.env.PAYPAL_WEBHOOK_ID ?? '',
  paypal_environment: process.env.PAYPAL_ENVIRONMENT ?? 'sandbox',

  // Payment - Alipay
  alipay_app_id: process.env.ALIPAY_APP_ID ?? '',
  alipay_private_key: process.env.ALIPAY_PRIVATE_KEY ?? '',
  alipay_public_key: process.env.ALIPAY_PUBLIC_KEY ?? '',
  alipay_notify_url: process.env.ALIPAY_NOTIFY_URL ?? '',

  // Payment - WeChat Pay
  wechat_app_id: process.env.WECHAT_APP_ID ?? '',
  wechat_mch_id: process.env.WECHAT_MCH_ID ?? '',
  wechat_api_v3_key: process.env.WECHAT_API_V3_KEY ?? '',
  wechat_private_key: process.env.WECHAT_PRIVATE_KEY ?? '',
  wechat_serial_no: process.env.WECHAT_SERIAL_NO ?? '',
  wechat_notify_url: process.env.WECHAT_NOTIFY_URL ?? '',

  // Email - Resend
  resend_api_key: process.env.RESEND_API_KEY ?? '',
  resend_email_from: process.env.RESEND_EMAIL_FROM ?? '',

  // Storage - S3/R2
  storage_endpoint: process.env.STORAGE_ENDPOINT ?? '',
  storage_region: process.env.STORAGE_REGION ?? 'auto',
  storage_access_key: process.env.STORAGE_ACCESS_KEY ?? '',
  storage_secret_key: process.env.STORAGE_SECRET_KEY ?? '',
  storage_bucket: process.env.STORAGE_BUCKET ?? '',
  storage_public_domain: process.env.STORAGE_PUBLIC_DOMAIN ?? '',
  inline_image_max_kb: process.env.INLINE_IMAGE_MAX_KB ?? '2048',

  // AI
  replicate_api_token: process.env.REPLICATE_API_TOKEN ?? '',
  kie_api_key: process.env.KIE_API_KEY ?? '',
  kie_chat_endpoint:
    process.env.KIE_CHAT_ENDPOINT ??
    'https://api.kie.ai/gemini-2.5-flash/v1/chat/completions',
  kie_chat_model: process.env.KIE_CHAT_MODEL ?? 'gemini-2.5-flash',
  kie_claude_endpoint:
    process.env.KIE_CLAUDE_ENDPOINT ??
    'https://api.kie.ai/claude/v1/messages',
  kie_claude_model: process.env.KIE_CLAUDE_MODEL ?? '',
  kie_codex_endpoint:
    process.env.KIE_CODEX_ENDPOINT ??
    'https://api.kie.ai/codex/v1/responses',
  kie_codex_model: process.env.KIE_CODEX_MODEL ?? 'gpt-5-5',
  kie_image_model: process.env.KIE_IMAGE_MODEL ?? 'z-image',
  kie_character_image_model: process.env.KIE_CHARACTER_IMAGE_MODEL ?? 'nano-banana-2',
  wavespeed_api_key: process.env.WAVESPEED_API_KEY ?? '',
  wavespeed_base_url:
    process.env.WAVESPEED_BASE_URL ??
    'https://api.wavespeed.ai/api/v3',
  wavespeed_image_model:
    process.env.WAVESPEED_IMAGE_MODEL ??
    'openai/gpt-image-2/text-to-image',
  wavespeed_image_quality: process.env.WAVESPEED_IMAGE_QUALITY ?? 'medium',
  lyric_video_image_provider: process.env.LYRIC_VIDEO_IMAGE_PROVIDER ?? 'kie',
  groq_api_key: process.env.GROQ_API_KEY ?? '',
  groq_base_url: process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
  groq_transcribe_model: process.env.GROQ_TRANSCRIBE_MODEL ?? 'whisper-large-v3',
  elevenlabs_api_key: process.env.ELEVENLABS_API_KEY ?? '',
  elevenlabs_stt_model: process.env.ELEVENLABS_STT_MODEL ?? 'scribe_v2',
  ffmpeg_path: process.env.FFMPEG_PATH ?? '/Users/joey/project/7_ffmpeg/bin/ffmpeg',

  // Locale
  locale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'en',
};
