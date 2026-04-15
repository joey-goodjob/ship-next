import { defineConfig } from 'drizzle-kit';
import { loadEnvFiles } from './src/lib/env';

loadEnvFiles();

const provider = process.env.DATABASE_PROVIDER || 'sqlite';

const dialectMap: Record<string, 'sqlite' | 'postgresql' | 'mysql'> = {
  sqlite: 'sqlite',
  postgres: 'postgresql',
  postgresql: 'postgresql',
  mysql: 'mysql',
};

export default defineConfig({
  schema: './src/config/db/schema.ts',
  out: './drizzle',
  dialect: dialectMap[provider] || 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'file:data/local.db',
  },
});
