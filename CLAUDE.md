# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Running a single test

```bash
npx vitest run path/to/file.test.ts
npx vitest run --reporter=verbose  # show individual test names
```

## Required environment variables

```
DATABASE_URL                  # postgres connection string
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
API_KEY_ENCRYPTION_SECRET     # exactly 64 hex chars (32-byte AES-256 key)
GOOGLE_AI_API_KEY             # Gemini API key for listing analysis
RESEND_API_KEY                # email notifications (blank = emails silently skip)
RESEND_FROM_EMAIL             # sender address, defaults to notifications@snaplist.app
NEXT_PUBLIC_BASE_URL          # canonical origin, used in email links
```

## Architecture: two API surfaces

**Server Actions** (`app/actions/`) — used by the Next.js UI, authenticated via Clerk session cookies. They call `auth()` from `@clerk/nextjs/server`, throw on failure, then call `revalidatePath`/`redirect`. These are not reachable from outside the browser session.

**REST routes** (`app/api/`) — external API for third-party integrators, authenticated with `Authorization: Bearer <key>`. All routes go through `withApi()` in `lib/api.ts`, which enforces a sliding-window rate limit (60 req/min per IP, in-memory — resets on server restart) and resolves the API key via SHA-256 hash lookup. Response helpers `ok()` and `apiError()` attach CORS headers. The OpenAPI spec is at `public/openapi.yaml` and served via `/api-docs`.

The exception is `app/api/analyze/route.ts`, which is Clerk-authenticated (not API-key) because it's called directly from the new-listing form.

## Data conventions

- **Price is stored in cents** (`integer`) everywhere in the DB and API layer. Convert with `Math.round(dollars * 100)` on write; divide by 100 for display. `lib/format.ts` has the display formatter.
- **Geo**: zip codes are resolved to `city`, `state`, `lat`, `lng` at write time via `lib/geo.ts` using the `zipcodes` package. Radius search uses a Haversine SQL expression (`haversineWhere` in `lib/geo.ts`) — no PostGIS dependency.
- **User identity**: Clerk user IDs (`clerk_user_id`) are the FK used throughout the schema. There is no separate `users` table.

## API key lifecycle

Keys are generated with `crypto.randomBytes` (prefix `sk_`). Two representations are stored in `api_keys`:
- `key_hash` — SHA-256, used for fast request validation on every API call
- `key_encrypted` — AES-256-GCM, used only to re-display the key to the owner in settings

`API_KEY_ENCRYPTION_SECRET` must be exactly 64 hex characters. One key per user — regenerating cycles the key in place (upsert).

## AI listing analysis

`POST /api/analyze` accepts multipart form data (`images[]` + optional `zip`). It calls `lib/ai/analyze.ts` (Gemini 2.5 Flash Lite) to extract title, description, condition, category, and a base price, then calls `lib/ai/pricing.ts` to refine the price suggestion. Used exclusively from the new-listing form to pre-fill fields from photos.
