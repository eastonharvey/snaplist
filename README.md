# 📸 Snaplist

A local classifieds marketplace built with Next.js 16. Post items for sale, browse listings near you, message sellers, and integrate with the public REST API. AI-powered listing creation lets you snap a photo and have the title, description, price, and category filled in automatically.

**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Clerk · Drizzle ORM · PostgreSQL · Supabase Storage · Gemini AI · Resend

---

## ✨ Features

- 🗂️ **Categorized listings** with full-text search
- 📍 **Zip-based radius search** — find items within X miles of your location
- 🤖 **AI listing analysis** — upload photos, get title/description/price/condition auto-filled via Gemini
- 💬 **Buyer–seller messaging** with email notifications
- ⭐ **Favorites**, reviews, and listing reports
- 🔑 **Public REST API** with Bearer token auth and rate limiting
- 📄 **Interactive API docs** at `/api-docs`

---

## 🚀 Getting started

### Prerequisites

- Node.js 20+
- A PostgreSQL database (local or hosted — [Supabase](https://supabase.com) works great and provides storage too)
- Accounts for: [Clerk](https://clerk.com) · [Supabase](https://supabase.com) · [Google AI Studio](https://aistudio.google.com) · [Resend](https://resend.com) (optional)

### 1. Clone and install

```bash
git clone https://github.com/your-org/snaplist.git
cd snaplist
npm install
```

### 2. Configure environment variables

Copy the example below into `.env.local` and fill in each value:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/snaplist

# Clerk (https://clerk.com → create app → API Keys)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Supabase (https://supabase.com → project → Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# API key encryption — generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Must be exactly 64 hex characters.
API_KEY_ENCRYPTION_SECRET=<64-hex-chars>

# AI listing analysis (https://aistudio.google.com → Get API key)
GOOGLE_AI_API_KEY=AIza...

# Email notifications via Resend (optional — skip to disable emails)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=notifications@yourdomain.com

# Used in email links
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### 3. Set up Supabase Storage

In your Supabase project, create a **public** storage bucket named `listings`. The app will upload listing images there.

### 4. Run database migrations and seed

```bash
npx drizzle-kit generate   # generate SQL from schema
npx drizzle-kit migrate    # apply migrations
npx tsx lib/db/seed.ts     # seed default categories
```

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in via Clerk to post your first listing.

---

## 🔑 Using the REST API

Snaplist exposes a public REST API for external integrators. You need an API key to use it.

### Get your API key

Sign in to the app and go to **Settings → API Key**. Generate a key — it will look like `sk_<64 hex chars>`. Store it somewhere safe; it's only shown once.

### Authentication

Pass your key as a Bearer token on every request:

```
Authorization: Bearer sk_your_key_here
```

### Rate limit

60 requests per minute per IP. Exceeding this returns `429`.

---

### Endpoints

#### 📋 List categories

```bash
curl https://your-app.com/api/categories \
  -H "Authorization: Bearer sk_your_key_here"
```

```json
{
  "data": [
    { "id": 1, "name": "Electronics", "slug": "electronics" },
    { "id": 2, "name": "Vehicles",    "slug": "vehicles" }
  ],
  "meta": {}
}
```

---

#### 🔍 Search listings

```bash
curl "https://your-app.com/api/listings?q=bike&zip=78701&radius=25&page=1" \
  -H "Authorization: Bearer sk_your_key_here"
```

| Parameter  | Type    | Default  | Description |
|------------|---------|----------|-------------|
| `q`        | string  | —        | Keyword search across title and description |
| `category` | string  | —        | Category slug (e.g. `electronics`) |
| `zip`      | string  | —        | US zip code — center of radius search |
| `radius`   | number  | `25`     | Miles from zip (1–500) |
| `status`   | string  | `active` | `active`, `sold`, or `archived` |
| `page`     | integer | `1`      | Page number |
| `pageSize` | integer | `20`     | Results per page (max 100) |

```json
{
  "data": [
    {
      "id": 42,
      "title": "Trek FX 3 Disc – 2022",
      "description": "Barely ridden commuter bike, all original parts.",
      "price": 64900,
      "city": "Austin",
      "state": "TX",
      "zip": "78701",
      "status": "active",
      "categoryName": "Sports",
      "createdAt": "2025-03-15T18:00:00.000Z"
    }
  ],
  "meta": { "total": 1, "page": 1, "pageSize": 20, "totalPages": 1 }
}
```

> 💡 `price` is always in **cents** — divide by 100 for display ($649.00 in the example above).

---

#### 🏷️ Get a single listing

```bash
curl https://your-app.com/api/listings/42 \
  -H "Authorization: Bearer sk_your_key_here"
```

Returns a full listing object with `lat`, `lng`, `updatedAt`, and an `images` array (each with `id`, `url`, `order`).

---

#### ➕ Create a listing

```bash
curl -X POST https://your-app.com/api/listings \
  -H "Authorization: Bearer sk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Trek FX 3 Disc – 2022",
    "description": "Barely ridden commuter bike.",
    "price": 649.00,
    "zip": "78701",
    "categoryId": 6
  }'
```

> 💡 Send `price` in **dollars** (e.g. `649.00`) — the API converts to cents internally.

---

#### 🖼️ Upload an image to a listing

```bash
curl -X POST https://your-app.com/api/listings/42/images \
  -H "Authorization: Bearer sk_your_key_here" \
  -F "image=@/path/to/photo.jpg"
```

You must own the listing. Returns `{ data: { id, url, order } }`.

---

### 📖 Interactive API docs

A Swagger UI is available at **`/api-docs`** while the app is running. The underlying OpenAPI spec lives at `public/openapi.yaml`.

---

## 🧪 Running tests

```bash
npm test                                          # run all tests once
npm run test:watch                                # watch mode
npx vitest run app/actions/listings.test.ts       # single file
```

## 🛠️ Other commands

```bash
npm run build             # production build
npm run lint              # ESLint
npx drizzle-kit generate  # generate migrations after schema changes
npx drizzle-kit migrate   # apply pending migrations
npx tsx lib/db/seed.ts    # seed categories
```

---

## 🤝 Contributing

Pull requests are welcome! Please open an issue first to discuss significant changes.

1. Fork the repo and create a feature branch
2. Make your changes with tests where applicable
3. Run `npm test` and `npm run lint` before opening a PR

---

## 📄 License

MIT
