# Auth & Database Setup — Design Spec

**Date:** 2026-04-15  
**Project:** snaplist  
**Status:** Approved

---

## Goal

Bootstrap the project with Clerk authentication and a Drizzle ORM + PostgreSQL data layer. The result: a running app where authenticated users can be identified server-side, and the schema is ready for listings, categories, and images.

---

## Files to Create or Modify

| File | Action |
|---|---|
| `package.json` | Add Clerk, Drizzle, and postgres.js deps |
| `proxy.ts` | Create — Clerk auth middleware (replaces deprecated `middleware.ts`) |
| `app/layout.tsx` | Modify — wrap root with `<ClerkProvider>` |
| `lib/db/schema.ts` | Create — Drizzle schema (three tables) |
| `lib/db/index.ts` | Create — Drizzle client instance |
| `drizzle.config.ts` | Create — drizzle-kit config for migrations |
| `.env.local` | Create — required env var template |

---

## Dependencies

```
dependencies:
  @clerk/nextjs
  drizzle-orm
  postgres

devDependencies:
  drizzle-kit
```

---

## proxy.ts

Export a `proxy` function (not `middleware` — that convention is deprecated in Next.js 16.2.3) using `clerkMiddleware` from `@clerk/nextjs/server`.

**Public routes** (no auth required):
- `/`
- `/sign-in` and `/sign-up` (and all sub-paths)
- `/_next/static`, `/_next/image`, `favicon.ico` (static assets)

All other routes require authentication. Unauthenticated requests redirect to `/sign-in`.

The file lives at the project root alongside `package.json`. It exports a named `proxy` function (not a default export) and a `config` object with a `matcher` array.

---

## ClerkProvider

Wrap `app/layout.tsx`'s root HTML with `<ClerkProvider>`. This enables all Clerk client-side hooks (`useUser`, `useAuth`, etc.) throughout the app.

---

## Database Schema

**Dialect:** PostgreSQL  
**Driver:** postgres.js  

### `categories`
| Column | Type | Notes |
|---|---|---|
| `id` | serial | PK |
| `name` | text | not null |
| `slug` | text | unique, not null |
| `createdAt` | timestamp | default now() |

### `listings`
| Column | Type | Notes |
|---|---|---|
| `id` | serial | PK |
| `title` | text | not null |
| `description` | text | not null |
| `price` | integer | cents (e.g. 1000 = $10.00) |
| `location` | text | not null |
| `status` | pgEnum | `active` \| `sold` \| `archived`, default `active` |
| `clerkUserId` | text | not null — Clerk user ID |
| `categoryId` | integer | FK → categories.id |
| `createdAt` | timestamp | default now() |
| `updatedAt` | timestamp | default now() |

### `images`
| Column | Type | Notes |
|---|---|---|
| `id` | serial | PK |
| `listingId` | integer | FK → listings.id, cascade delete |
| `url` | text | not null |
| `order` | integer | display order, default 0 |
| `createdAt` | timestamp | default now() |

**Price in cents:** avoids floating-point precision issues. The app layer formats display values.  
**pgEnum for status:** enforces valid values at the database level.  
**Cascade delete on images:** deleting a listing removes its images automatically.

---

## lib/db/index.ts

Exports a single Drizzle client instance, constructed from `DATABASE_URL`. Import this file wherever the app queries the database.

---

## drizzle.config.ts

Points drizzle-kit at `lib/db/schema.ts` and reads `DATABASE_URL` from the environment. Enables `npx drizzle-kit generate` and `npx drizzle-kit push`.

---

## Environment Variables

```
# .env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
DATABASE_URL=
```

All three are required at runtime. The app will not start without them.

---

## Out of Scope

- Clerk sign-in/sign-up route pages (`app/sign-in/[[...sign-in]]`) — use Clerk's hosted pages until needed
- Database migrations folder — drizzle-kit generates this on first run
- Seeding categories — done separately once the schema is applied
