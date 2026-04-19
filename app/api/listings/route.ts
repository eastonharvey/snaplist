import { and, desc, eq, ilike, or, sql, SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { categories, listings } from '@/lib/db/schema'
import { withApi, ok, apiError, corsHeaders } from '@/lib/api'
import { haversineWhere, lookupZip } from '@/lib/geo'

export async function GET(req: Request) {
  return withApi(req, async () => {
    const { searchParams } = new URL(req.url)

    const q = searchParams.get('q')?.trim()
    const category = searchParams.get('category')
    const zip = searchParams.get('zip')
    const radius = searchParams.get('radius')
    const status = (searchParams.get('status') ?? 'active') as 'active' | 'sold' | 'archived'
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10) || 20))

    // ── Build WHERE conditions ──────────────────────────────────────────────
    const conditions: SQL[] = [eq(listings.status, status)]

    if (q) {
      const term = `%${q}%`
      conditions.push(or(ilike(listings.title, term), ilike(listings.description, term))!)
    }

    if (category) {
      const [cat] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, category))
      if (cat) conditions.push(eq(listings.categoryId, cat.id))
    }

    if (zip?.match(/^\d{5}$/)) {
      const geo = lookupZip(zip)
      if (geo) {
        const radiusMiles = Math.min(500, Math.max(1, parseFloat(radius ?? '25') || 25))
        conditions.push(haversineWhere(geo.lat, geo.lng, radiusMiles))
      }
    }

    const where = and(...conditions)

    // ── Count total ────────────────────────────────────────────────────────
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(listings)
      .where(where)

    // ── Paginated results ──────────────────────────────────────────────────
    const results = await db
      .select({
        id: listings.id,
        title: listings.title,
        description: listings.description,
        price: listings.price,
        zip: listings.zip,
        city: listings.city,
        state: listings.state,
        status: listings.status,
        createdAt: listings.createdAt,
        categoryName: categories.name,
      })
      .from(listings)
      .leftJoin(categories, eq(listings.categoryId, categories.id))
      .where(where)
      .orderBy(desc(listings.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return ok(results, {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  })
}

export async function POST(req: Request) {
  return withApi(req, async ({ userId }) => {
    const body = await req.json().catch(() => null)

    const title = body?.title?.trim()
    const description = body?.description?.trim()
    const priceRaw = body?.price
    const zip = body?.zip?.trim() ?? null
    const categoryId = body?.categoryId ? parseInt(body.categoryId, 10) : null

    if (!title) return apiError(422, 'title is required', 'VALIDATION_ERROR')
    if (!description) return apiError(422, 'description is required', 'VALIDATION_ERROR')
    if (priceRaw == null || isNaN(Number(priceRaw))) return apiError(422, 'price is required', 'VALIDATION_ERROR')

    const price = Math.round(Number(priceRaw) * 100)
    const geo = zip?.match(/^\d{5}$/) ? lookupZip(zip) : null

    const [listing] = await db
      .insert(listings)
      .values({
        title,
        description,
        price,
        zip: geo ? zip : null,
        city: geo?.city ?? null,
        state: geo?.state ?? null,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        clerkUserId: userId,
        categoryId,
      })
      .returning({ id: listings.id, title: listings.title, price: listings.price, status: listings.status, createdAt: listings.createdAt })

    return ok(listing, {})
  })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
