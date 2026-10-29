import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '../../.env', quiet: true });
config({ path: '../../.dev.vars', quiet: true });

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada');

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL },
});
