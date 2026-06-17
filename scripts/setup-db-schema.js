const fs = require('node:fs');
const path = require('node:path');

const args = new Set(process.argv.slice(2));
const schemaDir = path.join(__dirname, '..', 'src', 'config', 'db');
const target = path.join(schemaDir, 'schema.ts');

function normalizeProvider(provider) {
  switch (provider) {
    case 'sqlite':
    case 'turso':
    case 'd1':
      return 'sqlite';
    case 'postgres':
    case 'postgresql':
      return 'postgres';
    case 'mysql':
      return 'mysql';
    default:
      throw new Error(`Unsupported DATABASE_PROVIDER for schema setup: ${provider}`);
  }
}

if (args.has('--if-missing') && fs.existsSync(target)) {
  console.log('Schema already exists at src/config/db/schema.ts');
  process.exit(0);
}

const provider = normalizeProvider(process.env.DATABASE_PROVIDER || 'sqlite');
const source = path.join(schemaDir, `schema.${provider}.ts`);

fs.copyFileSync(source, target);
console.log(`Schema set to ${provider}`);
