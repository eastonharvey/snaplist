# AI Photo Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When creating a new listing, sellers upload photos and click "Analyze Photos" — Gemini 2.0 Flash identifies the item and pre-fills title, description, price, category, and condition inline.

**Architecture:** A `POST /api/analyze` route handler (Clerk-authenticated) receives images as multipart, calls `lib/ai/analyze.ts` (Gemini 2.0 Flash), and returns structured JSON. The new listing form uses a two-step UI: Step 1 shows only photo upload; Step 2 reveals all form fields pre-populated with AI badges. ZIP is auto-populated from `userSettings` and saved back on every successful post.

**Tech Stack:** Next.js 16, `@google/generative-ai`, Drizzle ORM (PostgreSQL), Clerk, Vitest

---

## File Map

| File | Action |
|---|---|
| `lib/db/schema.ts` | Add `conditionEnum`, `condition` column to `listings`, add `userSettings` table |
| `lib/ai/pricing.ts` | Create — `getPriceSuggestion()` stub |
| `lib/ai/analyze.ts` | Create — `analyzeListing()` Gemini call |
| `lib/ai/analyze.test.ts` | Create — unit tests for `analyzeListing` |
| `lib/ai/pricing.test.ts` | Create — unit tests for `getPriceSuggestion` |
| `app/api/analyze/route.ts` | Create — POST handler |
| `app/api/analyze/route.test.ts` | Create — unit tests for route |
| `app/actions/settings.ts` | Create — `getUserSettings()` server action |
| `app/actions/listings.ts` | Modify — add `condition` field + ZIP upsert to `createListing` and `updateListing` |
| `app/listings/new/page.tsx` | Modify — fetch `defaultZip` + category slugs, pass to form |
| `app/listings/new/listing-form.tsx` | Rewrite — two-step flow, controlled inputs, AI badges |
| `app/listings/[id]/edit/edit-form.tsx` | Modify — add `condition` dropdown |

---

## Task 1: Schema — conditionEnum + condition + userSettings

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Add conditionEnum, condition column, and userSettings table to schema**

Replace the contents of `lib/db/schema.ts` with:

```typescript
import { boolean, doublePrecision, integer, pgEnum, pgTable, serial, text, timestamp, unique } from 'drizzle-orm/pg-core'

export const listingStatusEnum = pgEnum('listing_status', ['active', 'sold', 'archived'])

export const conditionEnum = pgEnum('condition', ['new', 'like_new', 'good', 'fair'])

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const listings = pgTable('listings', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  price: integer('price').notNull(), // stored as cents; 1000 = $10.00
  zip: text('zip'),
  city: text('city'),
  state: text('state'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  status: listingStatusEnum('status').default('active'),
  condition: conditionEnum('condition'),
  clerkUserId: text('clerk_user_id').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const images = pgTable('images', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id').references(() => listings.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  order: integer('order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
})

// One thread per (buyer, listing) pair — enforced by unique constraint
export const threads = pgTable('threads', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id').references(() => listings.id, { onDelete: 'cascade' }).notNull(),
  buyerClerkUserId: text('buyer_clerk_user_id').notNull(),
  sellerClerkUserId: text('seller_clerk_user_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => [unique().on(t.listingId, t.buyerClerkUserId)])

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  threadId: integer('thread_id').references(() => threads.id, { onDelete: 'cascade' }).notNull(),
  senderClerkUserId: text('sender_clerk_user_id').notNull(),
  body: text('body').notNull(),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

// One API key per user — cycled in place (upsert on clerkUserId)
export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  keyHash: text('key_hash').notNull().unique(),      // SHA-256 for fast request validation
  keyEncrypted: text('key_encrypted').notNull(),     // AES-256-GCM for display
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// One row per user — upserted on every listing post
export const userSettings = pgTable('user_settings', {
  id: serial('id').primaryKey(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  zip: text('zip'),
  updatedAt: timestamp('updated_at').defaultNow(),
})
```

- [ ] **Step 2: Generate the migration**

```bash
npx drizzle-kit generate
```

Expected: a new file appears in `drizzle/` with `ALTER TABLE listings ADD COLUMN condition ...` and `CREATE TABLE user_settings ...`

- [ ] **Step 3: Apply the migration**

```bash
npx drizzle-kit migrate
```

Expected: `All migrations applied successfully`

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat: add condition field and userSettings table to schema"
```

---

## Task 2: Pricing abstraction stub

**Files:**
- Create: `lib/ai/pricing.ts`
- Create: `lib/ai/pricing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/ai/pricing.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getPriceSuggestion } from './pricing'

describe('getPriceSuggestion', () => {
  it('returns the aiPrice passed to it', async () => {
    const result = await getPriceSuggestion('MacBook Pro', 'Austin, TX', 74900)
    expect(result).toBe(74900)
  })

  it('works with zero price', async () => {
    const result = await getPriceSuggestion('Unknown item', '', 0)
    expect(result).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- lib/ai/pricing.test.ts
```

Expected: FAIL — `Cannot find module './pricing'`

- [ ] **Step 3: Implement pricing stub**

Create `lib/ai/pricing.ts`:

```typescript
/**
 * Returns a price suggestion in cents.
 * Today this is a pass-through of the AI-suggested price.
 * Swap the implementation here to integrate market data (eBay, PriceCharting, etc.)
 * without changing any callers.
 */
export async function getPriceSuggestion(
  _item: string,
  _location: string,
  aiPrice: number,
): Promise<number> {
  return aiPrice
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- lib/ai/pricing.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/ai/pricing.ts lib/ai/pricing.test.ts
git commit -m "feat: add pricing abstraction stub"
```

---

## Task 3: Install Gemini SDK + implement analyzeListing

**Files:**
- Create: `lib/ai/analyze.ts`
- Create: `lib/ai/analyze.test.ts`

- [ ] **Step 1: Install the SDK and add the env var**

```bash
npm install @google/generative-ai
```

Add to `.env.local`:
```
GOOGLE_AI_API_KEY=
```

- [ ] **Step 2: Write the failing tests**

Create `lib/ai/analyze.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
}))

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: mocks.generateContent,
    }),
  })),
}))

import { analyzeListing } from './analyze'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeGeminiResponse(data: object) {
  return {
    response: {
      text: () => JSON.stringify(data),
    },
  }
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('analyzeListing', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.GOOGLE_AI_API_KEY = 'test-key'
  })

  it('returns structured listing data from Gemini response', async () => {
    mocks.generateContent.mockResolvedValue(
      makeGeminiResponse({
        title: 'Apple MacBook Pro 13" M1',
        description: 'Excellent condition laptop.',
        price: 749,
        categorySlug: 'electronics',
        condition: 'like_new',
      })
    )

    const result = await analyzeListing(
      ['base64imagedata'],
      'Austin, TX',
      ['electronics', 'clothing', 'furniture']
    )

    expect(result).toEqual({
      title: 'Apple MacBook Pro 13" M1',
      description: 'Excellent condition laptop.',
      price: 74900,  // converted to cents
      categorySlug: 'electronics',
      condition: 'like_new',
    })
  })

  it('converts price from dollars to cents', async () => {
    mocks.generateContent.mockResolvedValue(
      makeGeminiResponse({ title: 'Item', description: 'Desc', price: 10, categorySlug: 'other', condition: 'good' })
    )
    const result = await analyzeListing(['b64'], '', ['other'])
    expect(result.price).toBe(1000)
  })

  it('falls back to first category if Gemini returns unknown slug', async () => {
    mocks.generateContent.mockResolvedValue(
      makeGeminiResponse({ title: 'X', description: 'Y', price: 5, categorySlug: 'nonexistent', condition: 'fair' })
    )
    const result = await analyzeListing(['b64'], '', ['electronics', 'clothing'])
    expect(result.categorySlug).toBe('electronics')
  })

  it('falls back to "good" if Gemini returns invalid condition', async () => {
    mocks.generateContent.mockResolvedValue(
      makeGeminiResponse({ title: 'X', description: 'Y', price: 5, categorySlug: 'electronics', condition: 'excellent' })
    )
    const result = await analyzeListing(['b64'], '', ['electronics'])
    expect(result.condition).toBe('good')
  })

  it('throws when Gemini response is missing required fields', async () => {
    mocks.generateContent.mockResolvedValue(
      makeGeminiResponse({ title: 'Only title' })
    )
    await expect(analyzeListing(['b64'], '', ['electronics'])).rejects.toThrow(
      'Could not identify item'
    )
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test -- lib/ai/analyze.test.ts
```

Expected: FAIL — `Cannot find module './analyze'`

- [ ] **Step 4: Implement analyzeListing**

Create `lib/ai/analyze.ts`:

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'

export interface ListingAnalysis {
  title: string
  description: string
  price: number        // cents
  categorySlug: string // matched to provided categories list
  condition: 'new' | 'like_new' | 'good' | 'fair'
}

const VALID_CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const

export async function analyzeListing(
  images: string[],    // base64-encoded
  location: string,    // e.g. "Austin, TX" — used for price context
  categories: string[] // slugs from DB
): Promise<ListingAnalysis> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { responseMimeType: 'application/json' },
  })

  const prompt = `You are a marketplace listing assistant. Analyze the product photos and return a JSON object with exactly these fields:
- title: concise product title (e.g. "Apple MacBook Pro 13-inch M1 2021")
- description: 2-3 sentence marketplace description covering key features and visible condition
- price: suggested resale price in whole US dollars as an integer${location ? ` for the ${location} market` : ''}
- categorySlug: the best match from this list — ${categories.join(', ')}
- condition: one of new, like_new, good, fair — based on visible wear

Return only the JSON object.`

  const parts: object[] = [
    { text: prompt },
    ...images.map(data => ({ inlineData: { mimeType: 'image/jpeg', data } })),
  ]

  const result = await model.generateContent(parts)
  const text = result.response.text()
  const data = JSON.parse(text)

  if (!data.title || !data.description || !data.price || !data.categorySlug || !data.condition) {
    throw new Error('Could not identify item from the provided photos.')
  }

  return {
    title: String(data.title),
    description: String(data.description),
    price: Math.round(Number(data.price) * 100),
    categorySlug: categories.includes(data.categorySlug) ? data.categorySlug : (categories[0] ?? ''),
    condition: VALID_CONDITIONS.includes(data.condition) ? data.condition : 'good',
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- lib/ai/analyze.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/ai/analyze.ts lib/ai/analyze.test.ts package.json package-lock.json .env.local
git commit -m "feat: add Gemini 2.0 Flash image analysis"
```

---

## Task 4: POST /api/analyze route

**Files:**
- Create: `app/api/analyze/route.ts`
- Create: `app/api/analyze/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/api/analyze/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  analyzeListing: vi.fn(),
  getPriceSuggestion: vi.fn(),
  lookupZip: vi.fn(),
  dbSelect: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }))
vi.mock('@/lib/ai/analyze', () => ({ analyzeListing: mocks.analyzeListing }))
vi.mock('@/lib/ai/pricing', () => ({ getPriceSuggestion: mocks.getPriceSuggestion }))
vi.mock('@/lib/geo', () => ({ lookupZip: mocks.lookupZip }))
vi.mock('@/lib/db', () => ({ db: { select: mocks.dbSelect } }))

import { POST } from './route'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeSelectChain(result: unknown[]) {
  const p = Promise.resolve(result)
  const chain: Record<string, unknown> = { from: vi.fn() }
  chain.from = vi.fn().mockReturnValue({ ...p, from: chain.from })
  Object.assign(chain.from(), { then: p.then.bind(p), catch: p.catch.bind(p) })
  return chain
}

function makeRequest(fields: Record<string, string | Blob> = {}) {
  const formData = new FormData()
  // Default: one image file
  const imageBlob = new Blob(['fake-image-data'], { type: 'image/jpeg' })
  formData.append('images', fields.images ?? imageBlob, 'photo.jpg')
  if (fields.zip) formData.append('zip', fields.zip as string)
  return new Request('http://localhost/api/analyze', {
    method: 'POST',
    body: formData,
  })
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('POST /api/analyze', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ userId: 'user_123' })
    mocks.lookupZip.mockReturnValue({ city: 'Austin', state: 'TX', lat: 30.2, lng: -97.7 })
    mocks.dbSelect.mockReturnValue(makeSelectChain([{ slug: 'electronics' }, { slug: 'clothing' }]))
    mocks.analyzeListing.mockResolvedValue({
      title: 'MacBook Pro',
      description: 'Great laptop',
      price: 74900,
      categorySlug: 'electronics',
      condition: 'like_new',
    })
    mocks.getPriceSuggestion.mockResolvedValue(74900)
  })

  it('returns 401 when not authenticated', async () => {
    mocks.auth.mockResolvedValue({ userId: null })
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 400 when no images provided', async () => {
    const formData = new FormData()
    const req = new Request('http://localhost/api/analyze', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/image/i)
  })

  it('returns structured analysis on success', async () => {
    const res = await POST(makeRequest({ zip: '78701' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      title: 'MacBook Pro',
      description: 'Great laptop',
      price: 74900,
      categorySlug: 'electronics',
      condition: 'like_new',
    })
  })

  it('returns 422 when analysis throws', async () => {
    mocks.analyzeListing.mockRejectedValue(new Error('Could not identify item'))
    const res = await POST(makeRequest())
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('Could not identify item')
  })

  it('passes location string to analyzeListing when zip resolves', async () => {
    await POST(makeRequest({ zip: '78701' }))
    expect(mocks.analyzeListing).toHaveBeenCalledWith(
      expect.any(Array),
      'Austin, TX',
      expect.any(Array)
    )
  })

  it('passes empty location when zip is absent', async () => {
    await POST(makeRequest())
    expect(mocks.analyzeListing).toHaveBeenCalledWith(
      expect.any(Array),
      '',
      expect.any(Array)
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- app/api/analyze/route.test.ts
```

Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Implement the route**

Create `app/api/analyze/route.ts`:

```typescript
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { categories } from '@/lib/db/schema'
import { checkRateLimit } from '@/lib/api'
import { lookupZip } from '@/lib/geo'
import { analyzeListing } from '@/lib/ai/analyze'
import { getPriceSuggestion } from '@/lib/ai/pricing'

export async function POST(req: Request): Promise<Response> {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { userId } = await auth()
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const imageFiles = formData.getAll('images').filter(
    (f): f is File => f instanceof File && f.size > 0
  )

  if (imageFiles.length === 0) {
    return Response.json({ error: 'At least one image is required' }, { status: 400 })
  }

  for (const file of imageFiles) {
    if (!file.type.startsWith('image/')) {
      return Response.json({ error: 'All files must be images' }, { status: 400 })
    }
    if (file.size > 5 * 1024 * 1024) {
      return Response.json({ error: 'Images must be under 5MB each' }, { status: 400 })
    }
  }

  const zip = (formData.get('zip') as string | null)?.trim() ?? ''
  const geo = zip ? lookupZip(zip) : null
  const location = geo ? `${geo.city}, ${geo.state}` : ''

  const cats = await db.select({ slug: categories.slug }).from(categories)
  const categorySlugs = cats.map(c => c.slug)

  const images = await Promise.all(
    imageFiles.map(async f => {
      const buf = await f.arrayBuffer()
      return Buffer.from(buf).toString('base64')
    })
  )

  try {
    const analysis = await analyzeListing(images, location, categorySlugs)
    const price = await getPriceSuggestion(analysis.title, location, analysis.price)
    return Response.json({ ...analysis, price })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    return Response.json({ error: message }, { status: 422 })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- app/api/analyze/route.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/analyze/route.ts app/api/analyze/route.test.ts
git commit -m "feat: add POST /api/analyze route"
```

---

## Task 5: getUserSettings server action

**Files:**
- Create: `app/actions/settings.ts`

- [ ] **Step 1: Create the server action**

Create `app/actions/settings.ts`:

```typescript
'use server'

import { auth } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userSettings } from '@/lib/db/schema'

export async function getUserSettings(): Promise<{ zip: string | null }> {
  const { userId } = await auth()
  if (!userId) return { zip: null }

  const [row] = await db
    .select({ zip: userSettings.zip })
    .from(userSettings)
    .where(eq(userSettings.clerkUserId, userId))

  return { zip: row?.zip ?? null }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/actions/settings.ts
git commit -m "feat: add getUserSettings server action"
```

---

## Task 6: Update createListing and updateListing

**Files:**
- Modify: `app/actions/listings.ts`

- [ ] **Step 1: Update createListing — add condition + ZIP upsert**

In `app/actions/listings.ts`, replace the `createListing` function with:

```typescript
export async function createListing(formData: FormData) {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const priceStr = formData.get('price') as string
  const zipRaw = (formData.get('zip') as string | null)?.trim() ?? ''
  const categoryIdStr = formData.get('categoryId') as string
  const conditionRaw = formData.get('condition') as string | null

  const price = Math.round(parseFloat(priceStr) * 100)
  const categoryId = categoryIdStr ? parseInt(categoryIdStr, 10) : null
  const geo = zipRaw ? lookupZip(zipRaw) : null
  const condition = conditionRaw as 'new' | 'like_new' | 'good' | 'fair' | null

  const [listing] = await db
    .insert(listings)
    .values({
      title,
      description,
      price,
      zip: geo ? zipRaw : null,
      city: geo?.city ?? null,
      state: geo?.state ?? null,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      clerkUserId: userId,
      categoryId,
      condition,
    })
    .returning({ id: listings.id })

  const files = (formData.getAll('images') as File[]).filter(f => f.size > 0)
  if (files.length > 0) {
    const uploaded = await uploadFiles(files, listing.id, 0)
    await db.insert(images).values(
      uploaded.map(({ url, order }) => ({ listingId: listing.id, url, order }))
    )
  }

  // Save ZIP for future auto-population — non-blocking
  if (zipRaw) {
    try {
      await db
        .insert(userSettings)
        .values({ clerkUserId: userId, zip: zipRaw })
        .onConflictDoUpdate({
          target: userSettings.clerkUserId,
          set: { zip: zipRaw, updatedAt: new Date() },
        })
    } catch {
      // zip save failure is non-blocking
    }
  }

  revalidatePath('/')
  redirect(`/listings/${listing.id}`)
}
```

Also add `userSettings` to the imports at the top of the file:

```typescript
import { listings, images, userSettings } from '@/lib/db/schema'
```

- [ ] **Step 2: Update updateListing — add condition**

In `app/actions/listings.ts`, replace the `updateListing` function's db update call to include condition. Find this block:

```typescript
  await db
    .update(listings)
    .set({
      title,
      description,
      price,
      zip: geo ? zipRaw : null,
      city: geo?.city ?? null,
      state: geo?.state ?? null,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      categoryId,
      updatedAt: new Date(),
    })
    .where(eq(listings.id, listingId))
```

And add condition parsing before the db call and include it in the set:

```typescript
  const conditionRaw = formData.get('condition') as string | null
  const condition = conditionRaw as 'new' | 'like_new' | 'good' | 'fair' | null

  await db
    .update(listings)
    .set({
      title,
      description,
      price,
      zip: geo ? zipRaw : null,
      city: geo?.city ?? null,
      state: geo?.state ?? null,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      categoryId,
      condition,
      updatedAt: new Date(),
    })
    .where(eq(listings.id, listingId))
```

- [ ] **Step 3: Verify the build compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no TypeScript errors related to the listings action

- [ ] **Step 4: Commit**

```bash
git add app/actions/listings.ts
git commit -m "feat: persist condition and ZIP in listing actions"
```

---

## Task 7: Update new listing page to fetch defaultZip

**Files:**
- Modify: `app/listings/new/page.tsx`

- [ ] **Step 1: Update the page to fetch defaultZip and category slugs**

Replace `app/listings/new/page.tsx` with:

```typescript
import { db } from '@/lib/db'
import { categories } from '@/lib/db/schema'
import { getUserSettings } from '@/app/actions/settings'
import ListingForm from './listing-form'

export default async function NewListingPage() {
  const [allCategories, settings] = await Promise.all([
    db.select({ id: categories.id, name: categories.name, slug: categories.slug }).from(categories),
    getUserSettings(),
  ])

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold">Post a listing</h1>
      <ListingForm categories={allCategories} defaultZip={settings.zip ?? ''} />
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/listings/new/page.tsx
git commit -m "feat: pass defaultZip and category slugs to listing form"
```

---

## Task 8: Rewrite listing-form.tsx — two-step flow

**Files:**
- Modify: `app/listings/new/listing-form.tsx`

- [ ] **Step 1: Rewrite the listing form with the two-step AI flow**

Replace `app/listings/new/listing-form.tsx` with:

```typescript
'use client'

import { useState } from 'react'
import { createListing } from '@/app/actions/listings'
import ZipInput from '@/app/_components/zip-input'

const MAX_IMAGES = 10
const MAX_ANALYSES = 3

type Category = { id: number; name: string; slug: string }
type Step = 'upload' | 'form'

const CONDITIONS = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
] as const

const inputClass =
  'rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50'

function AiBadge() {
  return (
    <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
      ✦ AI
    </span>
  )
}

export default function ListingForm({
  categories,
  defaultZip,
}: {
  categories: Category[]
  defaultZip: string
}) {
  // ── photo state ──────────────────────────────────────────────────────────
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])

  // ── analysis state ───────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('upload')
  const [analysisCount, setAnalysisCount] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  // ── form field state (controlled, populated by AI) ───────────────────────
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [condition, setCondition] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [zip, setZip] = useState(defaultZip)
  const [aiFields, setAiFields] = useState<Set<string>>(new Set())

  // ── photo handlers ───────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? [])
    const slots = MAX_IMAGES - selectedFiles.length
    const toAdd = incoming.slice(0, slots)
    setSelectedFiles(prev => [...prev, ...toAdd])
    setPreviews(prev => [...prev, ...toAdd.map(f => URL.createObjectURL(f))])
    e.target.value = ''
  }

  function removeFile(index: number) {
    URL.revokeObjectURL(previews[index])
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    setPreviews(prev => prev.filter((_, i) => i !== index))
  }

  // ── analysis handler ─────────────────────────────────────────────────────
  async function handleAnalyze() {
    if (selectedFiles.length === 0 || analyzing || analysisCount >= MAX_ANALYSES) return

    setAnalyzing(true)
    setAnalyzeError(null)

    const fd = new FormData()
    selectedFiles.forEach(f => fd.append('images', f))
    if (zip) fd.append('zip', zip)

    const res = await fetch('/api/analyze', { method: 'POST', body: fd })
    const data = await res.json()

    setAnalysisCount(c => c + 1)
    setAnalyzing(false)

    if (data.error) {
      setAnalyzeError(data.error)
      setStep('form')
      return
    }

    const cat = categories.find(c => c.slug === data.categorySlug)
    setTitle(data.title ?? '')
    setDescription(data.description ?? '')
    setPrice(data.price ? (data.price / 100).toFixed(2) : '')
    setCondition(data.condition ?? '')
    setCategoryId(cat ? String(cat.id) : '')

    const filled = new Set(['title', 'description', 'price', 'condition'])
    if (cat) filled.add('categoryId')
    setAiFields(filled)
    setStep('form')
  }

  // ── submit handler ───────────────────────────────────────────────────────
  async function handleSubmit(formData: FormData) {
    selectedFiles.forEach(file => formData.append('images', file))
    await createListing(formData)
  }

  // ── render ────────────────────────────────────────────────────────────────
  const canAnalyze = selectedFiles.length > 0 && !analyzing && analysisCount < MAX_ANALYSES
  const analysisExhausted = analysisCount >= MAX_ANALYSES

  return (
    <div className="flex flex-col gap-6">
      {/* ── Step 1: photo upload ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            Photos {selectedFiles.length > 0 && `(${selectedFiles.length}/${MAX_IMAGES})`}
          </span>
          {step === 'form' && (
            <button
              type="button"
              onClick={() => { setStep('upload'); setAnalyzeError(null) }}
              className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400"
            >
              ← back to photos
            </button>
          )}
        </div>

        <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">Tip</span>
          Upload 2–3 photos for the most accurate AI identification
        </p>

        {previews.length > 0 && (
          <div className={`grid gap-2 ${step === 'form' ? 'grid-cols-6' : 'grid-cols-4'}`}>
            {previews.map((url, i) => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {selectedFiles.length < MAX_IMAGES && (
          <label className="flex h-20 cursor-pointer items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-700 dark:border-zinc-700 dark:hover:border-zinc-500">
            + Add photos
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
          </label>
        )}

        {step === 'upload' && (
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className="flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {analyzing ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Analyzing…
              </>
            ) : (
              <>✦ Analyze Photos</>
            )}
          </button>
        )}

        {step === 'form' && !analysisExhausted && (
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className="self-start text-xs text-indigo-600 underline hover:text-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-indigo-400"
          >
            ✦ Re-analyze
          </button>
        )}

        {analysisExhausted && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Maximum analysis attempts reached. Edit the fields manually.
          </p>
        )}
      </div>

      {/* ── Step 1 error / step 2 success banner ── */}
      {analyzeError && (
        <div className="flex items-center gap-2 rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
          <span>⚠️</span>
          <span>{analyzeError} Fill in the details manually.</span>
        </div>
      )}

      {step === 'form' && !analyzeError && aiFields.size > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-green-800 bg-green-950 px-4 py-3 text-sm text-green-300">
          <span>✦</span>
          <span>Item identified — review and edit the details below</span>
        </div>
      )}

      {/* ── Step 2: form fields ── */}
      {step === 'form' && (
        <form action={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-1.5 text-sm font-medium" htmlFor="title">
              Title {aiFields.has('title') && <AiBadge />}
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What are you selling?"
              className={`${inputClass} ${aiFields.has('title') ? 'border-indigo-500 dark:border-indigo-500' : ''}`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-1.5 text-sm font-medium" htmlFor="description">
              Description {aiFields.has('description') && <AiBadge />}
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={5}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the item — condition, size, colour, any defects…"
              className={`${inputClass} ${aiFields.has('description') ? 'border-indigo-500 dark:border-indigo-500' : ''}`}
            />
          </div>

          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <label className="flex items-center gap-1.5 text-sm font-medium" htmlFor="price">
                Price ($) {aiFields.has('price') && <AiBadge />}
              </label>
              <input
                id="price"
                name="price"
                type="number"
                required
                min="0"
                step="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0.00"
                className={`${inputClass} ${aiFields.has('price') ? 'border-indigo-500 dark:border-indigo-500' : ''}`}
              />
            </div>

            <div className="flex flex-1 flex-col gap-1">
              <label className="flex items-center gap-1.5 text-sm font-medium" htmlFor="condition">
                Condition {aiFields.has('condition') && <AiBadge />}
              </label>
              <select
                id="condition"
                name="condition"
                value={condition}
                onChange={e => setCondition(e.target.value)}
                className={`${inputClass} ${aiFields.has('condition') ? 'border-indigo-500 dark:border-indigo-500' : ''}`}
              >
                <option value="">— Select condition —</option>
                {CONDITIONS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <label className="flex items-center gap-1.5 text-sm font-medium" htmlFor="categoryId">
                Category {aiFields.has('categoryId') && <AiBadge />}
              </label>
              <select
                id="categoryId"
                name="categoryId"
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className={`${inputClass} ${aiFields.has('categoryId') ? 'border-indigo-500 dark:border-indigo-500' : ''}`}
              >
                <option value="">— Select a category —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-1 flex-col gap-1">
              <label className="flex items-center gap-1.5 text-sm font-medium">
                ZIP Code
                {zip && zip === defaultZip && (
                  <span className="rounded-full bg-teal-700 px-2 py-0.5 text-[10px] font-semibold text-white">
                    📍 auto
                  </span>
                )}
              </label>
              <ZipInput
                defaultValue={zip}
                onChange={setZip}
                inputClassName={`${inputClass} w-full`}
              />
            </div>
          </div>

          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Post listing
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Start the dev server and verify the two-step flow manually**

```bash
npm run dev
```

Navigate to `http://localhost:3000/listings/new`. Verify:
1. Only the photo upload section and "Analyze Photos" button are visible on load
2. The tip "Upload 2–3 photos…" is shown
3. Adding photos enables the "Analyze Photos" button
4. After clicking, the form fields appear (requires a valid `GOOGLE_AI_API_KEY` in `.env.local` for actual AI response, or test with a mocked network)

- [ ] **Step 3: Commit**

```bash
git add app/listings/new/listing-form.tsx
git commit -m "feat: two-step listing form with AI photo analysis"
```

---

## Task 9: Add condition to edit form

**Files:**
- Modify: `app/listings/[id]/edit/edit-form.tsx`
- Modify: `app/listings/[id]/edit/page.tsx` (to pass condition)

- [ ] **Step 1: Update the Listing type and edit form to include condition**

In `app/listings/[id]/edit/edit-form.tsx`, update the `Listing` type and add the condition field.

Replace the `Listing` type:

```typescript
type Listing = {
  id: number
  title: string
  description: string
  price: number  // dollars (already converted by server page)
  zip: string | null
  categoryId: number | null
  condition: string | null
}
```

After the price/zip row in the form JSX, add the condition field. Find this closing `</div>` of the price/zip row:

```tsx
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="categoryId">Category</label>
```

And insert the condition field between them:

```tsx
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="condition">Condition</label>
        <select id="condition" name="condition" defaultValue={listing.condition ?? ''} className={inputClass}>
          <option value="">— Select condition —</option>
          <option value="new">New</option>
          <option value="like_new">Like New</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="categoryId">Category</label>
```

- [ ] **Step 2: Update the edit page to pass condition**

In `app/listings/[id]/edit/page.tsx`, find where the listing is fetched and add `condition` to the select. Look for the `.select(...)` call on listings and add `condition: listings.condition`. Then pass it through to `EditForm`.

The exact change: wherever the page fetches `{ id, title, description, price, zip, categoryId }` from the listing, add `condition: listings.condition` and pass `condition: listing.condition` in the `EditForm` props.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no TypeScript errors

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add app/listings/[id]/edit/edit-form.tsx app/listings/[id]/edit/page.tsx
git commit -m "feat: add condition field to edit listing form"
```

---

## Self-Review Checklist

- [x] **Schema**: conditionEnum + condition column + userSettings table — Task 1
- [x] **Pricing abstraction**: getPriceSuggestion stub with hook comment — Task 2
- [x] **Gemini integration**: analyzeListing with validation, cents conversion, fallbacks — Task 3
- [x] **API route**: POST /api/analyze with Clerk auth, rate limiting, validation — Task 4
- [x] **getUserSettings**: server action for reading saved ZIP — Task 5
- [x] **createListing**: condition field + ZIP upsert (non-blocking) — Task 6
- [x] **updateListing**: condition field — Task 6
- [x] **New listing page**: passes defaultZip + category slugs — Task 7
- [x] **Two-step form**: photos-first, AI badges, 3 attempt limit, controlled inputs — Task 8
- [x] **Edit form**: condition dropdown — Task 9
- [x] **ZIP badge**: shows "auto" when pre-populated from saved settings — Task 8
- [x] **Error state**: reveals form with error message if analysis fails — Task 8
- [x] **Guidance text**: "Upload 2–3 photos" tip visible in Step 1 — Task 8
