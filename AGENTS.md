<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Clerk (auth) · Drizzle ORM · Supabase (storage) · Vitest

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm test           # vitest run (one-shot)
npm run test:watch # vitest watch mode
npm run lint       # eslint
npx drizzle-kit generate  # generate migrations
npx drizzle-kit migrate   # apply migrations
```

## Architecture

```
app/               # Next.js App Router
  _components/     # shared UI components
  actions/         # Server Actions
  api/             # Route handlers
  listings/        # listings routes
  categories/      # category routes
  messages/        # messaging routes
  dashboard/       # dashboard routes
  settings/        # settings routes
lib/
  db/
    schema.ts      # Drizzle schema (source of truth)
    index.ts       # db client
    seed.ts        # seed data
    storage.ts     # Supabase storage helpers
  supabase/        # Supabase client setup
  api.ts / geo.ts / format.ts  # utility modules
public/
  openapi.yaml     # OpenAPI spec (served via /api-docs)
```

## Gotchas

- `drizzle-kit` doesn't load `.env.local` automatically — `drizzle.config.ts` calls `process.loadEnvFile('.env.local')` manually
- Tailwind v4 uses `@tailwindcss/postcss` — no `tailwind.config.js`; configure via CSS
- Server Actions body limit is 20MB (set in `next.config.ts`)
- Images allowed only from `*.supabase.co` (configured in `next.config.ts`)
- Tests use Vitest with `tsconfigPaths` — not Jest; `environment: 'node'`
