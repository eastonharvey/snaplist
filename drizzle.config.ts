import type { Config } from 'drizzle-kit'

// CLIs don't load .env.local automatically — Next.js does, but drizzle-kit doesn't
try { process.loadEnvFile('.env.local') } catch {}

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
