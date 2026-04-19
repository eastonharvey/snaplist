import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { eq, desc, inArray, and, or, ilike, gte, lte, SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { listings, categories, images } from '@/lib/db/schema'
import { formatPrice } from '@/lib/format'
import { lookupZip, haversineWhere } from '@/lib/geo'
import SearchFilters from '@/app/_components/search-filters'
import Pagination from '@/app/_components/pagination'

type SearchParams = Promise<{ q?: string; category?: string; zip?: string; radius?: string; page?: string; minPrice?: string; maxPrice?: string; condition?: string }>

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const { q, category, zip, radius, page: pageParam, minPrice: minPriceRaw, maxPrice: maxPriceRaw, condition: conditionRaw } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10))
  const minPrice = minPriceRaw && isFinite(parseFloat(minPriceRaw)) && parseFloat(minPriceRaw) >= 0
    ? Math.round(parseFloat(minPriceRaw) * 100)
    : null
  const maxPrice = maxPriceRaw && isFinite(parseFloat(maxPriceRaw)) && parseFloat(maxPriceRaw) >= 0
    ? Math.round(parseFloat(maxPriceRaw) * 100)
    : null
  const VALID_CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const
  type Condition = typeof VALID_CONDITIONS[number]
  const condition = VALID_CONDITIONS.includes(conditionRaw as Condition) ? conditionRaw as Condition : null
  const PAGE_SIZE = 24
  const offset = (page - 1) * PAGE_SIZE

  // ── Build WHERE conditions ────────────────────────────────────────────────
  const conditions: SQL[] = [eq(listings.status, 'active')]

  if (q?.trim()) {
    const term = `%${q.trim()}%`
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

  if (minPrice !== null) conditions.push(gte(listings.price, minPrice))
  if (maxPrice !== null) conditions.push(lte(listings.price, maxPrice))
  if (condition) conditions.push(eq(listings.condition, condition))

  // ── Fetch listings ────────────────────────────────────────────────────────
  const results = await db
    .select({
      id: listings.id,
      title: listings.title,
      price: listings.price,
      city: listings.city,
      state: listings.state,
      createdAt: listings.createdAt,
      categoryName: categories.name,
    })
    .from(listings)
    .leftJoin(categories, eq(listings.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(desc(listings.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset(offset)

  const hasNextPage = results.length > PAGE_SIZE
  const visibleListings = hasNextPage ? results.slice(0, PAGE_SIZE) : results

  // ── Cover images ──────────────────────────────────────────────────────────
  const coverMap = new Map<number, string>()
  if (visibleListings.length > 0) {
    const covers = await db
      .select({ listingId: images.listingId, url: images.url })
      .from(images)
      .where(and(
        inArray(images.listingId, visibleListings.map(r => r.id)),
        eq(images.order, 0)
      ))
    covers.forEach(c => { if (c.listingId) coverMap.set(c.listingId, c.url) })
  }

  // ── Fetch categories for filter dropdown ─────────────────────────────────
  const allCategories = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)

  const isFiltered = !!(q || category || zip || minPrice !== null || maxPrice !== null || condition)

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Browse listings</h1>

      <SearchFilters categories={allCategories} />

      {visibleListings.length === 0 ? (
        <p className="text-zinc-500">
          {isFiltered ? 'No listings match your search.' : 'No listings yet. Be the first to post one.'}
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleListings.map((item) => {
              const cover = coverMap.get(item.id)
              return (
                <li key={item.id}>
                  <Link
                    href={`/listings/${item.id}`}
                    className="flex flex-col gap-2 rounded-xl border border-zinc-200 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                  >
                    {cover ? (
                      <div className="relative aspect-video overflow-hidden rounded-t-xl">
                        <Image src={cover} alt={item.title} fill className="object-cover" />
                      </div>
                    ) : (
                      <div className="aspect-video rounded-t-xl bg-zinc-100 dark:bg-zinc-800" />
                    )}
                    <div className="flex flex-col gap-1 p-4 pt-2">
                      <span className="line-clamp-2 font-medium leading-snug">{item.title}</span>
                      <span className="text-lg font-semibold">{formatPrice(item.price)}</span>
                      <div className="flex items-center gap-2 text-sm text-zinc-500">
                        {item.city && item.state && <span>{item.city}, {item.state}</span>}
                        {item.categoryName && (
                          <>
                            {(item.city && item.state) && <span>·</span>}
                            <span>{item.categoryName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
          <Suspense fallback={<div className="mt-10 h-9" />}>
            <Pagination page={page} hasNextPage={hasNextPage} />
          </Suspense>
        </>
      )}
    </main>
  )
}
