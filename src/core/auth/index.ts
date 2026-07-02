import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getUuid } from '@/lib/hash';

import { db } from '@/core/db';
import { envConfigs } from '@/config';
import { getAllConfigs } from '@/modules/config/service';
import { grantForNewUser } from '@/modules/credits/service';
import { ResendProvider } from '@/core/email/resend';
import { VerifyEmail } from '@/core/email/templates/verify-email';
import * as schema from '@/config/db/schema';
import { buildUserAttributionFromContext } from '@/lib/user-attribution';

const recentVerificationEmailSentAt = new Map<string, number>();
const VERIFICATION_EMAIL_MIN_INTERVAL_MS = 60_000;
const VERIFICATION_DATE_FIELDS = ['expiresAt', 'createdAt', 'updatedAt'] as const;

function normalizeAuthDate(value: unknown, fieldName: string) {
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) return value;
    throw new TypeError(`Invalid auth ${fieldName} date`);
  }

  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }

  throw new TypeError(`Invalid auth ${fieldName} date`);
}

function normalizeVerificationDateFields<T extends Record<string, unknown>>(data: T): T {
  let next: Record<string, unknown> | null = null;

  for (const field of VERIFICATION_DATE_FIELDS) {
    if (data[field] === undefined || data[field] === null) continue;
    next ??= { ...data };
    next[field] = normalizeAuthDate(data[field], field);
  }

  return (next ?? data) as T;
}

function getDatabaseProvider(provider: string): 'sqlite' | 'pg' | 'mysql' {
  switch (provider) {
    case 'sqlite':
    case 'turso':
    case 'd1':
      return 'sqlite';
    case 'postgresql':
    case 'postgres':
      return 'pg';
    case 'mysql':
      return 'mysql';
    default:
      throw new Error(`Unsupported database provider for auth: ${provider}`);
  }
}

function normalizeVerificationAdapterData(params: any, dataKey: 'data' | 'update') {
  if (params.model !== 'verification') return params;
  const data = params[dataKey];
  if (!data || typeof data !== 'object') return params;

  return {
    ...params,
    [dataKey]: normalizeVerificationDateFields(data),
  };
}

function wrapVerificationDateAdapter<T extends Record<string, any>>(adapter: T): T {
  const wrapped: Record<string, any> = {
    ...adapter,
    create: (params: any) => adapter.create(normalizeVerificationAdapterData(params, 'data')),
    update: (params: any) => adapter.update(normalizeVerificationAdapterData(params, 'update')),
    updateMany: (params: any) => adapter.updateMany(normalizeVerificationAdapterData(params, 'update')),
  };

  if (adapter.transaction) {
    wrapped.transaction = (callback: any) =>
      adapter.transaction((transactionAdapter: Record<string, any>) =>
        callback(wrapVerificationDateAdapter(transactionAdapter))
      );
  }

  return wrapped as T;
}

function createAuthDatabaseAdapter(): NonNullable<BetterAuthOptions['database']> {
  const adapterFactory = drizzleAdapter(db(), {
    provider: getDatabaseProvider(envConfigs.database_provider),
    schema,
  });

  return ((options: BetterAuthOptions) => wrapVerificationDateAdapter(adapterFactory(options))) as NonNullable<
    BetterAuthOptions['database']
  >;
}

let authInstance: any;
let socialConfigsLoaded = false;
let emailEnabledLoaded = true;
let emailVerificationEnabledLoaded = false;

function getSocialProviders(configs: Record<string, string>) {
  const providers: Record<string, any> = {};

  if (configs.google_client_id && configs.google_client_secret) {
    providers.google = {
      clientId: configs.google_client_id,
      clientSecret: configs.google_client_secret,
    };
  }

  if (configs.github_client_id && configs.github_client_secret) {
    providers.github = {
      clientId: configs.github_client_id,
      clientSecret: configs.github_client_secret,
    };
  }

  return providers;
}

export function getAuth(configs?: Record<string, string>) {
  // Rebuild if social configs just became available
  if (configs && !socialConfigsLoaded) {
    const social = getSocialProviders(configs);
    if (Object.keys(social).length > 0) {
      authInstance = null;
      socialConfigsLoaded = true;
    }
  }

  // Rebuild if the email-auth flag changed
  if (configs) {
    const nextEmailEnabled = configs.email_auth_enabled !== 'false';
    if (nextEmailEnabled !== emailEnabledLoaded) {
      authInstance = null;
      emailEnabledLoaded = nextEmailEnabled;
    }
  }

  // Rebuild if the email-verification flag changed
  if (configs) {
    const nextVerificationEnabled =
      configs.email_verification_enabled === 'true' &&
      !!configs.resend_api_key &&
      !!configs.resend_email_from;
    if (nextVerificationEnabled !== emailVerificationEnabledLoaded) {
      authInstance = null;
      emailVerificationEnabledLoaded = nextVerificationEnabled;
    }
  }

  if (authInstance) return authInstance;

  const socialProviders = configs ? getSocialProviders(configs) : {};
  const emailAndPasswordEnabled = configs ? configs.email_auth_enabled !== 'false' : true;
  const emailVerificationEnabled = configs
    ? configs.email_verification_enabled === 'true' &&
      !!configs.resend_api_key &&
      !!configs.resend_email_from
    : false;

  authInstance = betterAuth({
    appName: envConfigs.app_name,
    baseURL: envConfigs.auth_url || envConfigs.app_url,
    secret: envConfigs.auth_secret,
    trustedOrigins: (request) => {
      const origins: string[] = [];
      if (envConfigs.app_url) origins.push(envConfigs.app_url);
      try {
        const origin = request?.headers?.get?.('origin');
        if (origin && new URL(origin).hostname === 'localhost') origins.push(origin);
      } catch {}
      return origins;
    },
    database: createAuthDatabaseAdapter(),
    socialProviders,
    user: {
      additionalFields: {
        utmSource: { type: 'string', input: false, required: false, defaultValue: '' },
        ip: { type: 'string', input: false, required: false, defaultValue: '' },
        locale: { type: 'string', input: false, required: false, defaultValue: '' },
      },
    },
    advanced: {
      database: { generateId: () => getUuid() },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            try {
              const attribution = buildUserAttributionFromContext({
                ctx,
                appUrl: envConfigs.app_url,
                fallbackLocale: envConfigs.locale,
              });

              return {
                data: {
                  ...user,
                  utmSource: user.utmSource || attribution.utmSource,
                  ip: user.ip || attribution.ip,
                  locale: user.locale || attribution.locale,
                },
              };
            } catch {
              return { data: user };
            }
          },
          after: async (user) => {
            try {
              const all = await getAllConfigs();
              await grantForNewUser({
                userId: user.id,
                userEmail: user.email,
                configs: all,
              });
            } catch (error) {
              console.error('[auth] grantForNewUser failed:', error);
            }
          },
        },
      },
      verification: {
        create: {
          before: async (verification) => ({
            data: normalizeVerificationDateFields(verification),
          }),
        },
      },
    },
    emailAndPassword: {
      enabled: emailAndPasswordEnabled,
      requireEmailVerification: emailVerificationEnabled,
      autoSignIn: !emailVerificationEnabled,
      sendResetPassword: async ({ user, url }) => {
        const all = await getAllConfigs();
        const apiKey = all.resend_api_key;
        const from = all.resend_email_from;
        if (!apiKey || !from) {
          console.error('[auth] sendResetPassword: Resend is not configured (resend_api_key / resend_email_from)');
          return;
        }
        const appName = all.app_name || envConfigs.app_name;
        const provider = new ResendProvider({ apiKey, defaultFrom: from });
        const greeting = user.name ? `Hi ${user.name},` : 'Hi,';
        const result = await provider.sendEmail({
          to: user.email,
          subject: `Reset your ${appName} password`,
          text: `${greeting}\n\nYou recently requested to reset your password for ${appName}. Use the link below to choose a new one:\n\n${url}\n\nThis link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.`,
          html: `<p>${greeting}</p>
<p>You recently requested to reset your password for <strong>${appName}</strong>. Click the link below to choose a new one:</p>
<p><a href="${url}">Reset your password</a></p>
<p>This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>`,
        });
        if (!result.success) {
          console.error('[auth] sendResetPassword failed:', result.error);
        }
      },
    },
    ...(emailVerificationEnabled
      ? {
          emailVerification: {
            sendOnSignUp: false,
            sendOnSignIn: false,
            autoSignInAfterVerification: true,
            expiresIn: 60 * 60 * 24,
            sendVerificationEmail: async ({ user, url }: { user: any; url: string; token: string }) => {
              try {
                const key = String(user?.email || '').toLowerCase();
                const now = Date.now();
                const last = recentVerificationEmailSentAt.get(key) || 0;
                if (key && now - last < VERIFICATION_EMAIL_MIN_INTERVAL_MS) {
                  return;
                }
                if (key) {
                  recentVerificationEmailSentAt.set(key, now);
                }

                const all = await getAllConfigs();
                const apiKey = all.resend_api_key;
                const from = all.resend_email_from;
                if (!apiKey || !from) {
                  console.error('[auth] sendVerificationEmail: Resend is not configured (resend_api_key / resend_email_from)');
                  return;
                }
                const appName = all.app_name || envConfigs.app_name;
                const configuredLogo = all.app_logo || '/logo.png';
                const logo = configuredLogo === '/logo.png' ? '/logo-email.png' : configuredLogo;
                const logoUrl = logo.startsWith('http')
                  ? logo
                  : logo
                  ? `${envConfigs.app_url || ''}${logo.startsWith('/') ? '' : '/'}${logo}`
                  : undefined;
                const provider = new ResendProvider({ apiKey, defaultFrom: from });
                const result = await provider.sendEmail({
                  to: user.email,
                  subject: `Verify your email - ${appName}`,
                  react: VerifyEmail({ appName, logoUrl, url }),
                });
                if (!result.success) {
                  console.error('[auth] sendVerificationEmail failed:', result.error);
                }
              } catch (e) {
                console.error('[auth] sendVerificationEmail error:', e);
              }
            },
          },
        }
      : {}),
    logger: { disabled: true },
  } satisfies BetterAuthOptions);

  return authInstance;
}
