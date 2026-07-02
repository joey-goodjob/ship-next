/**
 * PostgreSQL schema definitions.
 *
 * This is the PostgreSQL dialect of the database schema.
 * To use: set DATABASE_PROVIDER=postgres in .env.local,
 * then copy this file's content into schema.ts.
 */

import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

const table = pgTable;

// ─── Auth ────────────────────────────────────────────────────────────────────

export const user = table(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    utmSource: text('utm_source').notNull().default(''),
    ip: text('ip').notNull().default(''),
    locale: text('locale').notNull().default(''),
  },
  (table) => [
    index('idx_user_name').on(table.name),
    index('idx_user_created_at').on(table.createdAt),
  ]
);

export const session = table(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
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
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_account_user_id').on(table.userId),
    index('idx_account_provider_account').on(table.providerId, table.accountId),
  ]
);

export const verification = table(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_verification_identifier').on(table.identifier),
  ]
);

// ─── Content ─────────────────────────────────────────────────────────────────

export const config = table('config', {
  name: text('name').unique().notNull(),
  value: text('value'),
});

export const taxonomy = table(
  'taxonomy',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    slug: text('slug').unique().notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    image: text('image'),
    icon: text('icon'),
    status: text('status').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at'),
    sort: integer('sort').default(0).notNull(),
  },
  (table) => [
    index('idx_taxonomy_type_status').on(table.type, table.status),
  ]
);

export const post = table(
  'post',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    slug: text('slug').unique().notNull(),
    type: text('type').notNull(),
    title: text('title'),
    description: text('description'),
    image: text('image'),
    content: text('content'),
    categories: text('categories'),
    tags: text('tags'),
    authorName: text('author_name'),
    authorImage: text('author_image'),
    status: text('status').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at'),
    sort: integer('sort').default(0).notNull(),
  },
  (table) => [
    index('idx_post_type_status').on(table.type, table.status),
  ]
);

// ─── Business ────────────────────────────────────────────────────────────────

export const order = table(
  'order',
  {
    id: text('id').primaryKey(),
    orderNo: text('order_no').unique().notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userEmail: text('user_email'),
    status: text('status').notNull(),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull(),
    productId: text('product_id'),
    paymentType: text('payment_type'),
    paymentInterval: text('payment_interval'),
    paymentProvider: text('payment_provider').notNull(),
    paymentSessionId: text('payment_session_id'),
    checkoutInfo: text('checkout_info').notNull(),
    checkoutResult: text('checkout_result'),
    paymentResult: text('payment_result'),
    discountCode: text('discount_code'),
    discountAmount: integer('discount_amount'),
    discountCurrency: text('discount_currency'),
    paymentEmail: text('payment_email'),
    paymentAmount: integer('payment_amount'),
    paymentCurrency: text('payment_currency'),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at'),
    description: text('description'),
    productName: text('product_name'),
    subscriptionId: text('subscription_id'),
    subscriptionResult: text('subscription_result'),
    checkoutUrl: text('checkout_url'),
    callbackUrl: text('callback_url'),
    creditsAmount: integer('credits_amount'),
    creditsValidDays: integer('credits_valid_days'),
    planName: text('plan_name'),
    paymentProductId: text('payment_product_id'),
    invoiceId: text('invoice_id'),
    invoiceUrl: text('invoice_url'),
    subscriptionNo: text('subscription_no'),
    transactionId: text('transaction_id'),
    paymentUserName: text('payment_user_name'),
    paymentUserId: text('payment_user_id'),
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
    id: text('id').primaryKey(),
    subscriptionNo: text('subscription_no').unique().notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userEmail: text('user_email'),
    status: text('status').notNull(),
    paymentProvider: text('payment_provider').notNull(),
    subscriptionId: text('subscription_id').notNull(),
    subscriptionResult: text('subscription_result'),
    productId: text('product_id'),
    description: text('description'),
    amount: integer('amount'),
    currency: text('currency'),
    interval: text('interval'),
    intervalCount: integer('interval_count'),
    trialPeriodDays: integer('trial_period_days'),
    currentPeriodStart: timestamp('current_period_start'),
    currentPeriodEnd: timestamp('current_period_end'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at'),
    planName: text('plan_name'),
    billingUrl: text('billing_url'),
    productName: text('product_name'),
    creditsAmount: integer('credits_amount'),
    creditsValidDays: integer('credits_valid_days'),
    paymentProductId: text('payment_product_id'),
    paymentUserId: text('payment_user_id'),
    canceledAt: timestamp('canceled_at'),
    canceledEndAt: timestamp('canceled_end_at'),
    canceledReason: text('canceled_reason'),
    canceledReasonType: text('canceled_reason_type'),
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
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userEmail: text('user_email'),
    orderNo: text('order_no'),
    subscriptionNo: text('subscription_no'),
    transactionNo: text('transaction_no').unique().notNull(),
    transactionType: text('transaction_type').notNull(),
    transactionScene: text('transaction_scene'),
    credits: integer('credits').notNull(),
    remainingCredits: integer('remaining_credits').notNull().default(0),
    description: text('description'),
    expiresAt: timestamp('expires_at'),
    status: text('status').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
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
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
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
    id: text('id').primaryKey(),
    eventType: text('event_type').notNull(),
    visitorId: text('visitor_id').notNull(),
    sessionId: text('session_id').notNull(),
    pathname: text('pathname').notNull(),
    normalizedPath: text('normalized_path').notNull(),
    pageTitle: text('page_title'),
    referrer: text('referrer'),
    referrerHost: text('referrer_host').notNull().default(''),
    sourceChannel: text('source_channel').notNull().default('direct'),
    sourceDetail: text('source_detail').notNull().default('direct'),
    country: text('country').notNull().default(''),
    region: text('region').notNull().default(''),
    city: text('city').notNull().default(''),
    ipHash: text('ip_hash').notNull().default(''),
    userAgent: text('user_agent').notNull().default(''),
    locale: text('locale').notNull().default(''),
    utmSource: text('utm_source').notNull().default(''),
    utmMedium: text('utm_medium').notNull().default(''),
    utmCampaign: text('utm_campaign').notNull().default(''),
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

export const bugProblemEvent = table(
  'bug_problem_event',
  {
    id: text('id').primaryKey(),
    eventType: text('event_type').notNull(),
    severity: text('severity').notNull().default('info'),
    source: text('source').notNull().default('client'),
    flow: text('flow').notNull().default('unknown'),
    action: text('action').notNull().default('unknown'),
    pathname: text('pathname').notNull().default('/'),
    pageTitle: text('page_title'),
    message: text('message'),
    stack: text('stack'),
    component: text('component'),
    apiPath: text('api_path'),
    method: text('method'),
    statusCode: integer('status_code'),
    projectId: text('project_id'),
    runId: text('run_id'),
    visitorId: text('visitor_id').notNull().default(''),
    sessionId: text('session_id').notNull().default(''),
    userId: text('user_id').notNull().default(''),
    userAgent: text('user_agent').notNull().default(''),
    ipHash: text('ip_hash').notNull().default(''),
    locale: text('locale').notNull().default(''),
    metadataJson: text('metadata_json'),
    isTest: boolean('is_test').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_bug_problem_event_created_at').on(table.createdAt),
    index('idx_bug_problem_event_type_created').on(table.eventType, table.createdAt),
    index('idx_bug_problem_event_flow_created').on(table.flow, table.createdAt),
    index('idx_bug_problem_event_path_created').on(table.pathname, table.createdAt),
    index('idx_bug_problem_event_user_created').on(table.userId, table.createdAt),
  ]
);

// ─── RBAC ────────────────────────────────────────────────────────────────────

export const role = table(
  'role',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    sort: integer('sort').default(0).notNull(),
  },
  (table) => [
    index('idx_role_status').on(table.status),
  ]
);

export const permission = table(
  'permission',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    resource: text('resource').notNull(),
    action: text('action').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_permission_resource_action').on(table.resource, table.action),
  ]
);

export const rolePermission = table(
  'role_permission',
  {
    id: text('id').primaryKey(),
    roleId: text('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    permissionId: text('permission_id')
      .notNull()
      .references(() => permission.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
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
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
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
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    mediaType: text('media_type').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    prompt: text('prompt').notNull(),
    options: text('options'),
    status: text('status').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at'),
    taskId: text('task_id'),
    taskInfo: text('task_info'),
    taskResult: text('task_result'),
    costCredits: integer('cost_credits').notNull().default(0),
    scene: text('scene').notNull().default(''),
    creditId: text('credit_id'),
  },
  (table) => [
    index('idx_ai_task_user_media_type').on(table.userId, table.mediaType),
    index('idx_ai_task_media_type_status').on(table.mediaType, table.status),
  ]
);

export const chat = table(
  'chat',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    model: text('model').notNull(),
    provider: text('provider').notNull(),
    title: text('title').notNull().default(''),
    parts: text('parts').notNull(),
    metadata: text('metadata'),
    content: text('content'),
  },
  (table) => [index('idx_chat_user_status').on(table.userId, table.status)]
);

export const chatMessage = table(
  'chat_message',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    chatId: text('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    role: text('role').notNull(),
    parts: text('parts').notNull(),
    metadata: text('metadata'),
    model: text('model').notNull(),
    provider: text('provider').notNull(),
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

// ─── Invite Codes ────────────────────────────────────────────────────────────

export const inviteCode = table(
  'invite_code',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    maxUses: integer('max_uses').notNull().default(1),
    usedCount: integer('used_count').notNull().default(0),
    trialDays: integer('trial_days').notNull().default(15),
    note: text('note').default(''),
    createdBy: text('created_by').references(() => user.id),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_invite_code_code').on(t.code)]
);

export const userInvite = table(
  'user_invite',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    inviteCodeId: text('invite_code_id')
      .notNull()
      .references(() => inviteCode.id),
    activatedAt: timestamp('activated_at').defaultNow().notNull(),
    trialEndsAt: timestamp('trial_ends_at').notNull(),
  },
  (t) => [
    index('idx_user_invite_user').on(t.userId),
    index('idx_user_invite_code').on(t.inviteCodeId),
  ]
);

export type InviteCode = typeof inviteCode.$inferSelect;
export type NewInviteCode = typeof inviteCode.$inferInsert;
export type UserInvite = typeof userInvite.$inferSelect;
export type NewUserInvite = typeof userInvite.$inferInsert;

// ─── Lyric Video Projects ───────────────────────────────────────────────────

export const lyricVideoProject = table(
  'lyric_video_project',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    status: text('status').notNull().default('draft'),
    audioUrl: text('audio_url'),
    audioStorageKey: text('audio_storage_key'),
    originalAudioUrl: text('original_audio_url'),
    originalAudioStorageKey: text('original_audio_storage_key'),
    audioFilename: text('audio_filename'),
    audioDurationMs: integer('audio_duration_ms').notNull().default(0),
    audioMimeType: text('audio_mime_type'),
    audioSizeBytes: integer('audio_size_bytes').notNull().default(0),
    audioChecksum: text('audio_checksum'),
    trimStartMs: integer('trim_start_ms').notNull().default(0),
    trimEndMs: integer('trim_end_ms').notNull().default(0),
    processedAudioUrl: text('processed_audio_url'),
    processedAudioStorageKey: text('processed_audio_storage_key'),
    transcriptionRaw: text('transcription_raw'),
    pipelineStage: text('pipeline_stage').notNull().default('draft'),
    pipelineError: text('pipeline_error'),
    activeRunId: text('active_run_id'),
    generationStatus: text('generation_status').notNull().default('idle'),
    generationProgress: integer('generation_progress').notNull().default(0),
    lastGeneratedAt: timestamp('last_generated_at'),
    language: text('language').notNull().default('auto'),
    storyPrompt: text('story_prompt').notNull().default(''),
    palette: text('palette').notNull().default('cinematic'),
    artStyle: text('art_style').notNull().default('realistic'),
    customStyle: text('custom_style').notNull().default(''),
    aspectRatio: text('aspect_ratio').notNull().default('16:9'),
    resolution: text('resolution').notNull().default('1080p'),
    lyricsStatus: text('lyrics_status').notNull().default('empty'),
    scenesStatus: text('scenes_status').notNull().default('empty'),
    renderStatus: text('render_status').notNull().default('empty'),
    renderUrl: text('render_url'),
    renderTaskId: text('render_task_id'),
    previewConfig: text('preview_config'),
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
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('queued'),
    currentStage: text('current_stage').notNull().default('asr_words'),
    progressPercent: integer('progress_percent').notNull().default(0),
    totalSteps: integer('total_steps').notNull().default(0),
    completedSteps: integer('completed_steps').notNull().default(0),
    failedSteps: integer('failed_steps').notNull().default(0),
    idempotencyKey: text('idempotency_key'),
    requestHash: text('request_hash'),
    inputSnapshot: text('input_snapshot'),
    outputSnapshot: text('output_snapshot'),
    errorCode: text('error_code'),
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
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => lyricVideoGenerationRun.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull(),
    status: text('status').notNull().default('queued'),
    sort: integer('sort').notNull().default(0),
    progressPercent: integer('progress_percent').notNull().default(0),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    provider: text('provider'),
    model: text('model'),
    providerTaskId: text('provider_task_id'),
    inputJson: text('input_json'),
    outputJson: text('output_json'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    lockedAt: timestamp('locked_at'),
    lockedBy: text('locked_by'),
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
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sort: integer('sort').notNull().default(0),
    startMs: integer('start_ms').notNull().default(0),
    endMs: integer('end_ms').notNull().default(0),
    text: text('text').notNull(),
    runId: text('run_id').references(() => lyricVideoGenerationRun.id, { onDelete: 'set null' }),
    source: text('source').notNull().default('manual'),
    wordStartIndex: integer('word_start_index'),
    wordEndIndex: integer('word_end_index'),
    confidence: integer('confidence'),
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
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    runId: text('run_id').references(() => lyricVideoGenerationRun.id, { onDelete: 'set null' }),
    lineId: text('line_id').references(() => lyricVideoLine.id, { onDelete: 'set null' }),
    sceneId: text('scene_id'),
    sort: integer('sort').notNull().default(0),
    word: text('word').notNull(),
    startMs: integer('start_ms').notNull().default(0),
    endMs: integer('end_ms').notNull().default(0),
    confidence: integer('confidence'),
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
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sort: integer('sort').notNull().default(0),
    startMs: integer('start_ms').notNull().default(0),
    endMs: integer('end_ms').notNull().default(0),
    runId: text('run_id').references(() => lyricVideoGenerationRun.id, { onDelete: 'set null' }),
    text: text('text').notNull().default(''),
    prompt: text('prompt').notNull(),
    negativePrompt: text('negative_prompt').notNull().default(''),
    linkedLineIds: text('linked_line_ids'),
    castIds: text('cast_ids'),
    styleOverrides: text('style_overrides'),
    timelineConfig: text('timeline_config'),
    motionPrompt: text('motion_prompt').notNull().default(''),
    imageUrl: text('image_url'),
    imageTaskId: text('image_task_id'),
    providerTaskId: text('provider_task_id'),
    videoUrl: text('video_url'),
    videoTaskId: text('video_task_id'),
    videoProviderTaskId: text('video_provider_task_id'),
    videoStatus: text('video_status').notNull().default('empty'),
    videoModel: text('video_model'),
    videoPromptSnapshot: text('video_prompt_snapshot'),
    videoGenerationParams: text('video_generation_params'),
    videoCompletedAt: timestamp('video_completed_at'),
    videoError: text('video_error'),
    generationParams: text('generation_params'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at'),
    nextRetryAt: timestamp('next_retry_at'),
    completedAt: timestamp('completed_at'),
    failureCode: text('failure_code'),
    imageModel: text('image_model'),
    imageSeed: text('image_seed'),
    imagePromptSnapshot: text('image_prompt_snapshot'),
    error: text('error'),
    status: text('status').notNull().default('draft'),
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
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    sceneId: text('scene_id')
      .notNull()
      .references(() => lyricVideoScene.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    imageUrl: text('image_url').notNull(),
    status: text('status').notNull().default('success'),
    imageTaskId: text('image_task_id'),
    providerTaskId: text('provider_task_id'),
    imageModel: text('image_model'),
    promptSnapshot: text('prompt_snapshot'),
    generationParams: text('generation_params'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('idx_lyric_video_scene_image_candidate_scene').on(t.sceneId, t.createdAt),
    index('idx_lyric_video_scene_image_candidate_project').on(t.projectId, t.createdAt),
  ]
);

export const lyricVideoSceneVideoCandidate = table(
  'lyric_video_scene_video_candidate',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    sceneId: text('scene_id')
      .notNull()
      .references(() => lyricVideoScene.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    videoUrl: text('video_url').notNull(),
    status: text('status').notNull().default('success'),
    videoTaskId: text('video_task_id'),
    providerTaskId: text('provider_task_id'),
    videoModel: text('video_model'),
    promptSnapshot: text('prompt_snapshot'),
    sourceImageUrl: text('source_image_url'),
    generationParams: text('generation_params'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('idx_lyric_video_scene_video_candidate_scene').on(t.sceneId, t.createdAt),
    index('idx_lyric_video_scene_video_candidate_project').on(t.projectId, t.createdAt),
  ]
);

export const lyricVideoCastMember = table(
  'lyric_video_cast_member',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role').notNull().default(''),
    description: text('description').notNull().default(''),
    promptFragment: text('prompt_fragment').notNull().default(''),
    referenceImageUrl: text('reference_image_url'),
    imageTaskId: text('image_task_id'),
    providerTaskId: text('provider_task_id'),
    imageModel: text('image_model'),
    imagePromptSnapshot: text('image_prompt_snapshot'),
    generationParams: text('generation_params'),
    completedAt: timestamp('completed_at'),
    failureCode: text('failure_code'),
    error: text('error'),
    status: text('status').notNull().default('active'),
    sort: integer('sort').notNull().default(0),
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
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    format: text('format').notNull().default('mp4'),
    resolution: text('resolution').notNull().default('1080p'),
    aspectRatio: text('aspect_ratio').notNull().default('16:9'),
    videoUrl: text('video_url'),
    storageKey: text('storage_key'),
    taskId: text('task_id'),
    error: text('error'),
    settings: text('settings'),
    costCredits: integer('cost_credits').notNull().default(0),
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
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('queued'),
    projectId: text('project_id')
      .notNull()
      .references(() => lyricVideoProject.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    exportId: text('export_id').references(() => lyricVideoExport.id, { onDelete: 'cascade' }),
    runId: text('run_id').references(() => lyricVideoGenerationRun.id, { onDelete: 'set null' }),
    stepId: text('step_id').references(() => lyricVideoGenerationStep.id, { onDelete: 'set null' }),
    inputJson: text('input_json'),
    outputJson: text('output_json'),
    error: text('error'),
    lockedAt: timestamp('locked_at'),
    lockedBy: text('locked_by'),
    attemptCount: integer('attempt_count').notNull().default(0),
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
export type BugProblemEvent = typeof bugProblemEvent.$inferSelect;
export type NewBugProblemEvent = typeof bugProblemEvent.$inferInsert;
