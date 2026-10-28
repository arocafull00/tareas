import { defineConfig } from 'drizzle-kit';

process.loadEnvFile?.('.env.local');

export default defineConfig({
  schema: './db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
