/**
 * Grant credits to a user by email.
 *
 * Usage:
 *   pnpm credits:grant
 *   pnpm credits:grant --email=user@example.com --credits=5000
 *   pnpm credits:grant --email=user@example.com --credits=5000 --expires-days=365 --description="Manual grant"
 */

import { and, eq, gt, isNull, or, sum } from 'drizzle-orm';

import * as schema from '../src/config/db/schema';
import { getSnowId, getUuid } from '../src/lib/hash';

const DEFAULT_EMAIL = 'joey805251176@gmail.com';
const DEFAULT_CREDITS = 5000;

async function createScriptDb() {
  const provider = process.env.DATABASE_PROVIDER || 'sqlite';
  const url = process.env.DATABASE_URL || 'file:data/local.db';

  if (provider === 'postgres' || provider === 'postgresql') {
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const postgres = (await import('postgres')).default;
    const client = postgres(url, { prepare: false, max: 1, idle_timeout: 10 });
    return { db: drizzle({ client }) as any, close: () => client.end() };
  }

  if (provider === 'mysql') {
    const { drizzle } = await import('drizzle-orm/mysql2');
    const mysql = await import('mysql2/promise');
    const connection = await mysql.createConnection(url);
    return { db: drizzle({ client: connection }) as any, close: () => connection.end() };
  }

  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const client = createClient({ url });
  return { db: drizzle({ client }) as any, close: () => client.close() };
}

function getArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function calculateExpiresAt(expiresDays?: number) {
  if (!expiresDays || expiresDays <= 0) return null;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresDays);
  return expiresAt;
}

async function getBalance(db: any, userId: string) {
  const now = new Date();
  const [result] = await db
    .select({ total: sum(schema.credit.remainingCredits) })
    .from(schema.credit)
    .where(
      and(
        eq(schema.credit.userId, userId),
        eq(schema.credit.transactionType, 'grant'),
        eq(schema.credit.status, 'active'),
        gt(schema.credit.remainingCredits, 0),
        or(isNull(schema.credit.expiresAt), gt(schema.credit.expiresAt, now))
      )
    );

  return Number.parseInt(result?.total || '0', 10);
}

async function grantCredits() {
  const email = getArg('email') || DEFAULT_EMAIL;
  const credits = Number.parseInt(getArg('credits') || String(DEFAULT_CREDITS), 10);
  const expiresDaysArg = getArg('expires-days');
  const expiresDays = expiresDaysArg ? Number.parseInt(expiresDaysArg, 10) : undefined;
  const description = getArg('description') || 'Manual credit grant';

  if (!email.includes('@')) {
    throw new Error(`Invalid email: ${email}`);
  }

  if (!Number.isFinite(credits) || credits <= 0) {
    throw new Error(`Invalid credits amount: ${credits}`);
  }

  if (expiresDaysArg && (!Number.isFinite(expiresDays) || expiresDays! <= 0)) {
    throw new Error(`Invalid expires-days: ${expiresDaysArg}`);
  }

  const { db, close } = await createScriptDb();

  try {
    const [foundUser] = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
    if (!foundUser) {
      throw new Error(`User not found: ${email}`);
    }

    const beforeBalance = await getBalance(db, foundUser.id);
    const expiresAt = calculateExpiresAt(expiresDays);
    const newCredit: typeof schema.credit.$inferInsert = {
      id: getUuid(),
      userId: foundUser.id,
      userEmail: foundUser.email,
      transactionNo: getSnowId(),
      transactionType: 'grant',
      transactionScene: 'gift',
      credits,
      remainingCredits: credits,
      status: 'active',
      description,
      orderNo: '',
      subscriptionNo: '',
      expiresAt,
    };

    await db.insert(schema.credit).values(newCredit);

    const afterBalance = await getBalance(db, foundUser.id);

    console.log(`User: ${foundUser.name || foundUser.email} (${foundUser.email})`);
    console.log(`Granted: ${credits.toLocaleString()} credits`);
    console.log(`Transaction: ${newCredit.transactionNo}`);
    console.log(`Expires: ${expiresAt ? expiresAt.toISOString() : 'never'}`);
    console.log(`Balance: ${beforeBalance.toLocaleString()} -> ${afterBalance.toLocaleString()}`);
  } finally {
    await close();
  }
}

grantCredits().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
