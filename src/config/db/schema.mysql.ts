/**
 * MySQL schema definitions.
 *
 * This is the MySQL dialect of the database schema.
 * To use: set DATABASE_PROVIDER=mysql in .env.local,
 * then copy this file's content into schema.ts.
 */

import {
  boolean,
  index,
  int,
  longtext,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/mysql-core';

const table = mysqlTable;

const varchar191 = (name: string) => varchar(name, { length: 191 });

// ─── Auth ────────────────────────────────────────────────────────────────────

export const user = table(
  'user',
  {
    id: varchar191('id').primaryKey(),
    name: varchar191('name').notNull(),
    email: varchar191('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    utmSource: varchar('utm_source', { length: 100 }).notNull().default(''),
    ip: varchar('ip', { length: 45 }).notNull().default(''),
    locale: varchar('locale', { length: 20 }).notNull().default(''),
  },
  (table) => [
    index('idx_user_name').on(table.name),
    index('idx_user_created_at').on(table.createdAt),
  ]
);

export const session = table(
  'session',
  {
    id: varchar191('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: varchar191('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('idx_session_user_expires').on(table.userId, table.expiresAt),
  ]
);

export const account = table(
  'account',
  {
    id: varchar191('id').primaryKey(),
    accountId: varchar191('account_id').notNull(),
    providerId: varchar('provider_id', { length: 50 }).notNull(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: varchar('scope', { length: 255 }),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index('idx_account_user_id').on(table.userId),
    index('idx_account_provider_account').on(table.providerId, table.accountId),
  ]
);

export const verification = table(
  'verification',
  {
    id: varchar191('id').primaryKey(),
    identifier: varchar191('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index('idx_verification_identifier').on(table.identifier),
  ]
);

// ─── Content ─────────────────────────────────────────────────────────────────

export const config = table('config', {
  name: varchar191('name').unique().notNull(),
  value: text('value'),
});

export const taxonomy = table(
  'taxonomy',
  {
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentId: varchar191('parent_id'),
    slug: varchar191('slug').unique().notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    image: text('image'),
    icon: varchar191('icon'),
    status: varchar('status', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    sort: int('sort').default(0).notNull(),
  },
  (table) => [
    index('idx_taxonomy_type_status').on(table.type, table.status),
  ]
);

export const post = table(
  'post',
  {
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentId: varchar191('parent_id'),
    slug: varchar191('slug').unique().notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }),
    description: text('description'),
    image: text('image'),
    content: longtext('content'),
    categories: text('categories'),
    tags: text('tags'),
    authorName: varchar191('author_name'),
    authorImage: text('author_image'),
    status: varchar('status', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    sort: int('sort').default(0).notNull(),
  },
  (table) => [
    index('idx_post_type_status').on(table.type, table.status),
  ]
);

// ─── Business ────────────────────────────────────────────────────────────────

export const order = table(
  'order',
  {
    id: varchar191('id').primaryKey(),
    orderNo: varchar191('order_no').unique().notNull(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userEmail: varchar191('user_email'),
    status: varchar('status', { length: 50 }).notNull(),
    amount: int('amount').notNull(),
    currency: varchar('currency', { length: 10 }).notNull(),
    productId: varchar191('product_id'),
    paymentType: varchar('payment_type', { length: 50 }),
    paymentInterval: varchar('payment_interval', { length: 50 }),
    paymentProvider: varchar('payment_provider', { length: 50 }).notNull(),
    paymentSessionId: varchar191('payment_session_id'),
    checkoutInfo: text('checkout_info').notNull(),
    checkoutResult: text('checkout_result'),
    paymentResult: text('payment_result'),
    discountCode: varchar191('discount_code'),
    discountAmount: int('discount_amount'),
    discountCurrency: varchar('discount_currency', { length: 10 }),
    paymentEmail: varchar191('payment_email'),
    paymentAmount: int('payment_amount'),
    paymentCurrency: varchar('payment_currency', { length: 10 }),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    description: text('description'),
    productName: varchar('product_name', { length: 255 }),
    subscriptionId: varchar191('subscription_id'),
    subscriptionResult: text('subscription_result'),
    checkoutUrl: text('checkout_url'),
    callbackUrl: text('callback_url'),
    creditsAmount: int('credits_amount'),
    creditsValidDays: int('credits_valid_days'),
    planName: varchar191('plan_name'),
    paymentProductId: varchar191('payment_product_id'),
    invoiceId: varchar191('invoice_id'),
    invoiceUrl: text('invoice_url'),
    subscriptionNo: varchar191('subscription_no'),
    transactionId: varchar191('transaction_id'),
    paymentUserName: varchar191('payment_user_name'),
    paymentUserId: varchar191('payment_user_id'),
  },
  (table) => [
    index('idx_order_user_status_payment_type').on(
      table.userId,
      table.status,
      table.paymentType
    ),
    index('idx_order_transaction_provider').on(
      table.transactionId,
      table.paymentProvider
    ),
    index('idx_order_created_at').on(table.createdAt),
  ]
);

export const subscription = table(
  'subscription',
  {
    id: varchar191('id').primaryKey(),
    subscriptionNo: varchar191('subscription_no').unique().notNull(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userEmail: varchar191('user_email'),
    status: varchar('status', { length: 50 }).notNull(),
    paymentProvider: varchar('payment_provider', { length: 50 }).notNull(),
    subscriptionId: varchar191('subscription_id').notNull(),
    subscriptionResult: text('subscription_result'),
    productId: varchar191('product_id'),
    description: text('description'),
    amount: int('amount'),
    currency: varchar('currency', { length: 10 }),
    interval: varchar('interval', { length: 50 }),
    intervalCount: int('interval_count'),
    trialPeriodDays: int('trial_period_days'),
    currentPeriodStart: timestamp('current_period_start'),
    currentPeriodEnd: timestamp('current_period_end'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    planName: varchar191('plan_name'),
    billingUrl: text('billing_url'),
    productName: varchar('product_name', { length: 255 }),
    creditsAmount: int('credits_amount'),
    creditsValidDays: int('credits_valid_days'),
    paymentProductId: varchar191('payment_product_id'),
    paymentUserId: varchar191('payment_user_id'),
    canceledAt: timestamp('canceled_at'),
    canceledEndAt: timestamp('canceled_end_at'),
    canceledReason: text('canceled_reason'),
    canceledReasonType: varchar('canceled_reason_type', { length: 50 }),
  },
  (table) => [
    index('idx_subscription_user_status_interval').on(
      table.userId,
      table.status,
      table.interval
    ),
    index('idx_subscription_provider_id').on(
      table.subscriptionId,
      table.paymentProvider
    ),
    index('idx_subscription_created_at').on(table.createdAt),
  ]
);

export const credit = table(
  'credit',
  {
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userEmail: varchar191('user_email'),
    orderNo: varchar191('order_no'),
    subscriptionNo: varchar191('subscription_no'),
    transactionNo: varchar191('transaction_no').unique().notNull(),
    transactionType: varchar('transaction_type', { length: 50 }).notNull(),
    transactionScene: varchar('transaction_scene', { length: 50 }),
    credits: int('credits').notNull(),
    remainingCredits: int('remaining_credits').notNull().default(0),
    description: text('description'),
    expiresAt: timestamp('expires_at'),
    status: varchar('status', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    consumedDetail: text('consumed_detail'),
    metadata: text('metadata'),
  },
  (table) => [
    index('idx_credit_consume_fifo').on(
      table.userId,
      table.status,
      table.transactionType,
      table.remainingCredits,
      table.expiresAt
    ),
    index('idx_credit_order_no').on(table.orderNo),
    index('idx_credit_subscription_no').on(table.subscriptionNo),
  ]
);

export const apikey = table(
  'apikey',
  {
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    key: varchar191('key').notNull(),
    title: varchar191('title').notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_apikey_user_status').on(table.userId, table.status),
    index('idx_apikey_key_status').on(table.key, table.status),
  ]
);

export const trafficEvent = table(
  'traffic_event',
  {
    id: varchar191('id').primaryKey(),
    eventType: varchar('event_type', { length: 50 }).notNull(),
    visitorId: varchar191('visitor_id').notNull(),
    sessionId: varchar191('session_id').notNull(),
    pathname: text('pathname').notNull(),
    normalizedPath: varchar('normalized_path', { length: 500 }).notNull(),
    pageTitle: varchar('page_title', { length: 200 }),
    referrer: text('referrer'),
    referrerHost: varchar('referrer_host', { length: 255 }).notNull().default(''),
    sourceChannel: varchar('source_channel', { length: 120 }).notNull().default('direct'),
    sourceDetail: varchar('source_detail', { length: 120 }).notNull().default('direct'),
    country: varchar('country', { length: 8 }).notNull().default(''),
    region: varchar('region', { length: 120 }).notNull().default(''),
    city: varchar('city', { length: 120 }).notNull().default(''),
    ipHash: varchar('ip_hash', { length: 24 }).notNull().default(''),
    userAgent: text('user_agent').notNull(),
    locale: varchar('locale', { length: 24 }).notNull().default(''),
    utmSource: varchar('utm_source', { length: 120 }).notNull().default(''),
    utmMedium: varchar('utm_medium', { length: 120 }).notNull().default(''),
    utmCampaign: varchar('utm_campaign', { length: 160 }).notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_traffic_event_created_at').on(table.createdAt),
    index('idx_traffic_event_type_created_at').on(
      table.eventType,
      table.createdAt
    ),
    index('idx_traffic_event_visitor_created_at').on(
      table.visitorId,
      table.createdAt
    ),
    index('idx_traffic_event_path_created_at').on(
      table.normalizedPath,
      table.createdAt
    ),
    index('idx_traffic_event_source_created_at').on(
      table.sourceChannel,
      table.createdAt
    ),
    index('idx_traffic_event_country_region_created_at').on(
      table.country,
      table.region,
      table.createdAt
    ),
  ]
);

// ─── RBAC ────────────────────────────────────────────────────────────────────

export const role = table(
  'role',
  {
    id: varchar191('id').primaryKey(),
    name: varchar191('name').notNull().unique(),
    title: varchar191('title').notNull(),
    description: text('description'),
    status: varchar('status', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    sort: int('sort').default(0).notNull(),
  },
  (table) => [
    index('idx_role_status').on(table.status),
  ]
);

export const permission = table(
  'permission',
  {
    id: varchar191('id').primaryKey(),
    code: varchar191('code').notNull().unique(),
    resource: varchar('resource', { length: 50 }).notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    title: varchar191('title').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index('idx_permission_resource_action').on(table.resource, table.action),
  ]
);

export const rolePermission = table(
  'role_permission',
  {
    id: varchar191('id').primaryKey(),
    roleId: varchar191('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    permissionId: varchar191('permission_id')
      .notNull()
      .references(() => permission.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_role_permission_role_permission').on(
      table.roleId,
      table.permissionId
    ),
  ]
);

export const userRole = table(
  'user_role',
  {
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    roleId: varchar191('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    expiresAt: timestamp('expires_at'),
  },
  (table) => [
    index('idx_user_role_user_expires').on(table.userId, table.expiresAt),
  ]
);

// ─── AI ──────────────────────────────────────────────────────────────────────

export const aiTask = table(
  'ai_task',
  {
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    mediaType: varchar('media_type', { length: 50 }).notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    model: varchar191('model').notNull(),
    prompt: longtext('prompt').notNull(),
    options: longtext('options'),
    status: varchar('status', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    taskId: varchar191('task_id'),
    taskInfo: longtext('task_info'),
    taskResult: longtext('task_result'),
    costCredits: int('cost_credits').notNull().default(0),
    scene: varchar('scene', { length: 100 }).notNull().default(''),
    creditId: varchar191('credit_id'),
  },
  (table) => [
    index('idx_ai_task_user_media_type').on(table.userId, table.mediaType),
    index('idx_ai_task_media_type_status').on(table.mediaType, table.status),
  ]
);

export const chat = table(
  'chat',
  {
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    model: varchar191('model').notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull().default(''),
    parts: longtext('parts').notNull(),
    metadata: longtext('metadata'),
    content: longtext('content'),
  },
  (table) => [index('idx_chat_user_status').on(table.userId, table.status)]
);

export const chatMessage = table(
  'chat_message',
  {
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    chatId: varchar191('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    role: varchar('role', { length: 50 }).notNull(),
    parts: longtext('parts').notNull(),
    metadata: longtext('metadata'),
    model: varchar191('model').notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
  },
  (table) => [
    index('idx_chat_message_chat_id').on(table.chatId, table.status),
    index('idx_chat_message_user_id').on(table.userId, table.status),
  ]
);

// ─── Types ───────────────────────────────────────────────────────────────────

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;
export type Verification = typeof verification.$inferSelect;
export type Config = typeof config.$inferSelect;
export type Taxonomy = typeof taxonomy.$inferSelect;
export type NewTaxonomy = typeof taxonomy.$inferInsert;
export type Post = typeof post.$inferSelect;
export type NewPost = typeof post.$inferInsert;
export type Order = typeof order.$inferSelect;
export type NewOrder = typeof order.$inferInsert;
export type Subscription = typeof subscription.$inferSelect;
export type NewSubscription = typeof subscription.$inferInsert;
export type Credit = typeof credit.$inferSelect;
export type NewCredit = typeof credit.$inferInsert;
export type Apikey = typeof apikey.$inferSelect;
export type NewApikey = typeof apikey.$inferInsert;
export type Role = typeof role.$inferSelect;
export type NewRole = typeof role.$inferInsert;
export type Permission = typeof permission.$inferSelect;
export type RolePermission = typeof rolePermission.$inferSelect;
export type UserRole = typeof userRole.$inferSelect;
export type AiTask = typeof aiTask.$inferSelect;
export type NewAiTask = typeof aiTask.$inferInsert;
export type Chat = typeof chat.$inferSelect;
export type NewChat = typeof chat.$inferInsert;
export type ChatMessage = typeof chatMessage.$inferSelect;
export type NewChatMessage = typeof chatMessage.$inferInsert;

// ─── Custom tables ───────────────────────────────────────────────────────────
// Add your own tables below this line.

// ─── Lyric Video Projects ───────────────────────────────────────────────────

export const lyricVideoProject = table(
  'lyric_video_project',
  {
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: varchar191('title').notNull(),
    status: varchar191('status').notNull().default('draft'),
    audioUrl: text('audio_url'),
    audioStorageKey: varchar191('audio_storage_key'),
    originalAudioUrl: text('original_audio_url'),
    originalAudioStorageKey: varchar191('original_audio_storage_key'),
    audioFilename: varchar191('audio_filename'),
    audioDurationMs: int('audio_duration_ms').notNull().default(0),
    audioMimeType: varchar191('audio_mime_type'),
    audioSizeBytes: int('audio_size_bytes').notNull().default(0),
    audioChecksum: varchar191('audio_checksum'),
    trimStartMs: int('trim_start_ms').notNull().default(0),
    trimEndMs: int('trim_end_ms').notNull().default(0),
    processedAudioUrl: text('processed_audio_url'),
    processedAudioStorageKey: varchar191('processed_audio_storage_key'),
    transcriptionRaw: longtext('transcription_raw'),
    pipelineStage: varchar191('pipeline_stage').notNull().default('draft'),
    pipelineError: text('pipeline_error'),
    activeRunId: varchar191('active_run_id'),
    generationStatus: varchar191('generation_status').notNull().default('idle'),
    generationProgress: int('generation_progress').notNull().default(0),
    lastGeneratedAt: timestamp('last_generated_at'),
    language: varchar191('language').notNull().default('auto'),
    storyPrompt: longtext('story_prompt').notNull(),
    palette: varchar191('palette').notNull().default('cinematic'),
    artStyle: varchar191('art_style').notNull().default('realistic'),
    customStyle: varchar191('custom_style').notNull().default(''),
    aspectRatio: varchar191('aspect_ratio').notNull().default('16:9'),
    resolution: varchar191('resolution').notNull().default('1080p'),
    lyricsStatus: varchar191('lyrics_status').notNull().default('empty'),
    scenesStatus: varchar191('scenes_status').notNull().default('empty'),
    renderStatus: varchar191('render_status').notNull().default('empty'),
    renderUrl: text('render_url'),
    renderTaskId: varchar191('render_task_id'),
    previewConfig: longtext('preview_config'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    index('idx_lyric_video_project_user').on(t.userId, t.createdAt),
    index('idx_lyric_video_project_status').on(t.status),
  ]
);

export const lyricVideoGenerationRun = table(
  'lyric_video_generation_run',
  {
    id: varchar191('id').primaryKey(),
    projectId: varchar191('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: varchar191('status').notNull().default('queued'),
    currentStage: varchar191('current_stage').notNull().default('asr_words'),
    progressPercent: int('progress_percent').notNull().default(0),
    totalSteps: int('total_steps').notNull().default(0),
    completedSteps: int('completed_steps').notNull().default(0),
    failedSteps: int('failed_steps').notNull().default(0),
    idempotencyKey: varchar191('idempotency_key'),
    requestHash: varchar191('request_hash'),
    inputSnapshot: longtext('input_snapshot'),
    outputSnapshot: longtext('output_snapshot'),
    errorCode: varchar191('error_code'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    canceledAt: timestamp('canceled_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('idx_lyric_video_run_project').on(t.projectId, t.createdAt),
    index('idx_lyric_video_run_user_status').on(t.userId, t.status),
    index('idx_lyric_video_run_idempotency').on(t.projectId, t.idempotencyKey),
  ]
);

export const lyricVideoGenerationStep = table(
  'lyric_video_generation_step',
  {
    id: varchar191('id').primaryKey(),
    runId: varchar191('run_id')
      .notNull()
      .references(() => lyricVideoGenerationRun.id, { onDelete: 'cascade' }),
    projectId: varchar191('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    stage: varchar191('stage').notNull(),
    status: varchar191('status').notNull().default('queued'),
    sort: int('sort').notNull().default(0),
    progressPercent: int('progress_percent').notNull().default(0),
    attemptCount: int('attempt_count').notNull().default(0),
    maxAttempts: int('max_attempts').notNull().default(3),
    provider: varchar191('provider'),
    model: varchar191('model'),
    providerTaskId: varchar191('provider_task_id'),
    inputJson: longtext('input_json'),
    outputJson: longtext('output_json'),
    errorCode: varchar191('error_code'),
    errorMessage: text('error_message'),
    lockedAt: timestamp('locked_at'),
    lockedBy: varchar191('locked_by'),
    nextRetryAt: timestamp('next_retry_at'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('idx_lyric_video_step_run').on(t.runId, t.sort),
    index('idx_lyric_video_step_stage_status').on(t.stage, t.status),
    index('idx_lyric_video_step_retry').on(t.status, t.nextRetryAt),
  ]
);

export const lyricVideoLine = table(
  'lyric_video_line',
  {
    id: varchar191('id').primaryKey(),
    projectId: varchar191('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sort: int('sort').notNull().default(0),
    startMs: int('start_ms').notNull().default(0),
    endMs: int('end_ms').notNull().default(0),
    text: text('text').notNull(),
    runId: varchar191('run_id').references(() => lyricVideoGenerationRun.id, { onDelete: 'set null' }),
    source: varchar191('source').notNull().default('manual'),
    wordStartIndex: int('word_start_index'),
    wordEndIndex: int('word_end_index'),
    confidence: int('confidence'),
    editedAt: timestamp('edited_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('idx_lyric_video_line_project').on(t.projectId, t.sort),
    index('idx_lyric_video_line_user').on(t.userId),
  ]
);

export const lyricVideoWord = table(
  'lyric_video_word',
  {
    id: varchar191('id').primaryKey(),
    projectId: varchar191('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    runId: varchar191('run_id').references(() => lyricVideoGenerationRun.id, { onDelete: 'set null' }),
    lineId: varchar191('line_id').references(() => lyricVideoLine.id, { onDelete: 'set null' }),
    sceneId: varchar191('scene_id'),
    sort: int('sort').notNull().default(0),
    word: varchar191('word').notNull(),
    startMs: int('start_ms').notNull().default(0),
    endMs: int('end_ms').notNull().default(0),
    confidence: int('confidence'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('idx_lyric_video_word_project').on(t.projectId, t.sort),
    index('idx_lyric_video_word_line').on(t.lineId, t.sort),
    index('idx_lyric_video_word_run').on(t.runId),
  ]
);

export const lyricVideoScene = table(
  'lyric_video_scene',
  {
    id: varchar191('id').primaryKey(),
    projectId: varchar191('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sort: int('sort').notNull().default(0),
    startMs: int('start_ms').notNull().default(0),
    endMs: int('end_ms').notNull().default(0),
    runId: varchar191('run_id').references(() => lyricVideoGenerationRun.id, { onDelete: 'set null' }),
    text: text('text'),
    prompt: longtext('prompt').notNull(),
    negativePrompt: longtext('negative_prompt'),
    linkedLineIds: text('linked_line_ids'),
    castIds: text('cast_ids'),
    styleOverrides: longtext('style_overrides'),
    timelineConfig: longtext('timeline_config'),
    motionPrompt: longtext('motion_prompt').notNull(),
    imageUrl: text('image_url'),
    imageTaskId: varchar191('image_task_id'),
    providerTaskId: varchar191('provider_task_id'),
    videoUrl: text('video_url'),
    videoTaskId: varchar191('video_task_id'),
    videoProviderTaskId: varchar191('video_provider_task_id'),
    videoStatus: varchar191('video_status').notNull().default('empty'),
    videoModel: varchar191('video_model'),
    videoPromptSnapshot: longtext('video_prompt_snapshot'),
    videoGenerationParams: longtext('video_generation_params'),
    videoCompletedAt: timestamp('video_completed_at'),
    videoError: text('video_error'),
    generationParams: longtext('generation_params'),
    attemptCount: int('attempt_count').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at'),
    nextRetryAt: timestamp('next_retry_at'),
    completedAt: timestamp('completed_at'),
    failureCode: varchar191('failure_code'),
    imageModel: varchar191('image_model'),
    imageSeed: varchar191('image_seed'),
    imagePromptSnapshot: longtext('image_prompt_snapshot'),
    error: text('error'),
    status: varchar191('status').notNull().default('draft'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('idx_lyric_video_scene_project').on(t.projectId, t.sort),
    index('idx_lyric_video_scene_status').on(t.status),
  ]
);

export const lyricVideoSceneImageCandidate = table(
  'lyric_video_scene_image_candidate',
  {
    id: varchar191('id').primaryKey(),
    projectId: varchar191('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    sceneId: varchar191('scene_id')
      .notNull()
      .references(() => lyricVideoScene.id, { onDelete: 'cascade' }),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    imageUrl: text('image_url').notNull(),
    status: varchar('status', { length: 32 }).notNull().default('success'),
    imageTaskId: varchar191('image_task_id'),
    providerTaskId: varchar191('provider_task_id'),
    imageModel: varchar191('image_model'),
    promptSnapshot: longtext('prompt_snapshot'),
    generationParams: longtext('generation_params'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index('idx_lyric_video_scene_image_candidate_scene').on(t.sceneId, t.createdAt),
    index('idx_lyric_video_scene_image_candidate_project').on(t.projectId, t.createdAt),
  ]
);

export const lyricVideoSceneVideoCandidate = table(
  'lyric_video_scene_video_candidate',
  {
    id: varchar191('id').primaryKey(),
    projectId: varchar191('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    sceneId: varchar191('scene_id')
      .notNull()
      .references(() => lyricVideoScene.id, { onDelete: 'cascade' }),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    videoUrl: text('video_url').notNull(),
    status: varchar('status', { length: 32 }).notNull().default('success'),
    videoTaskId: varchar191('video_task_id'),
    providerTaskId: varchar191('provider_task_id'),
    videoModel: varchar191('video_model'),
    promptSnapshot: longtext('prompt_snapshot'),
    sourceImageUrl: text('source_image_url'),
    generationParams: longtext('generation_params'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index('idx_lyric_video_scene_video_candidate_scene').on(t.sceneId, t.createdAt),
    index('idx_lyric_video_scene_video_candidate_project').on(t.projectId, t.createdAt),
  ]
);

export const lyricVideoCastMember = table(
  'lyric_video_cast_member',
  {
    id: varchar191('id').primaryKey(),
    projectId: varchar191('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: varchar191('name').notNull(),
    role: varchar191('role').notNull().default(''),
    description: text('description').notNull(),
    promptFragment: longtext('prompt_fragment').notNull(),
    referenceImageUrl: text('reference_image_url'),
    imageTaskId: varchar191('image_task_id'),
    providerTaskId: varchar191('provider_task_id'),
    imageModel: varchar191('image_model'),
    imagePromptSnapshot: longtext('image_prompt_snapshot'),
    generationParams: longtext('generation_params'),
    completedAt: timestamp('completed_at'),
    failureCode: varchar191('failure_code'),
    error: text('error'),
    status: varchar191('status').notNull().default('active'),
    sort: int('sort').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    index('idx_lyric_video_cast_project').on(t.projectId, t.sort),
    index('idx_lyric_video_cast_user').on(t.userId, t.status),
  ]
);

export const lyricVideoExport = table(
  'lyric_video_export',
  {
    id: varchar191('id').primaryKey(),
    projectId: varchar191('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: varchar191('status').notNull().default('pending'),
    format: varchar191('format').notNull().default('mp4'),
    resolution: varchar191('resolution').notNull().default('1080p'),
    aspectRatio: varchar191('aspect_ratio').notNull().default('16:9'),
    videoUrl: text('video_url'),
    storageKey: varchar191('storage_key'),
    taskId: varchar191('task_id'),
    error: text('error'),
    settings: longtext('settings'),
    costCredits: int('cost_credits').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('idx_lyric_video_export_project').on(t.projectId, t.createdAt),
    index('idx_lyric_video_export_user').on(t.userId, t.status),
  ]
);

export const lyricVideoMediaJob = table(
  'lyric_video_media_job',
  {
    id: varchar191('id').primaryKey(),
    kind: varchar191('kind').notNull(),
    status: varchar191('status').notNull().default('queued'),
    projectId: varchar191('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    exportId: varchar191('export_id').references(() => lyricVideoExport.id, { onDelete: 'cascade' }),
    runId: varchar191('run_id').references(() => lyricVideoGenerationRun.id, { onDelete: 'set null' }),
    stepId: varchar191('step_id').references(() => lyricVideoGenerationStep.id, { onDelete: 'set null' }),
    inputJson: longtext('input_json'),
    outputJson: longtext('output_json'),
    error: text('error'),
    lockedAt: timestamp('locked_at'),
    lockedBy: varchar191('locked_by'),
    attemptCount: int('attempt_count').notNull().default(0),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('idx_lyric_video_media_job_status').on(t.kind, t.status, t.createdAt),
    index('idx_lyric_video_media_job_project').on(t.projectId, t.createdAt),
    index('idx_lyric_video_media_job_export').on(t.exportId),
  ]
);

export type LyricVideoProject = typeof lyricVideoProject.$inferSelect;
export type NewLyricVideoProject = typeof lyricVideoProject.$inferInsert;
export type LyricVideoGenerationRun = typeof lyricVideoGenerationRun.$inferSelect;
export type NewLyricVideoGenerationRun = typeof lyricVideoGenerationRun.$inferInsert;
export type LyricVideoGenerationStep = typeof lyricVideoGenerationStep.$inferSelect;
export type NewLyricVideoGenerationStep = typeof lyricVideoGenerationStep.$inferInsert;
export type LyricVideoLine = typeof lyricVideoLine.$inferSelect;
export type NewLyricVideoLine = typeof lyricVideoLine.$inferInsert;
export type LyricVideoWord = typeof lyricVideoWord.$inferSelect;
export type NewLyricVideoWord = typeof lyricVideoWord.$inferInsert;
export type LyricVideoScene = typeof lyricVideoScene.$inferSelect;
export type NewLyricVideoScene = typeof lyricVideoScene.$inferInsert;
export type LyricVideoSceneImageCandidate = typeof lyricVideoSceneImageCandidate.$inferSelect;
export type NewLyricVideoSceneImageCandidate = typeof lyricVideoSceneImageCandidate.$inferInsert;
export type LyricVideoSceneVideoCandidate = typeof lyricVideoSceneVideoCandidate.$inferSelect;
export type NewLyricVideoSceneVideoCandidate = typeof lyricVideoSceneVideoCandidate.$inferInsert;
export type LyricVideoCastMember = typeof lyricVideoCastMember.$inferSelect;
export type NewLyricVideoCastMember = typeof lyricVideoCastMember.$inferInsert;
export type LyricVideoExport = typeof lyricVideoExport.$inferSelect;
export type NewLyricVideoExport = typeof lyricVideoExport.$inferInsert;
export type LyricVideoMediaJob = typeof lyricVideoMediaJob.$inferSelect;
export type NewLyricVideoMediaJob = typeof lyricVideoMediaJob.$inferInsert;
