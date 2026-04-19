import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { listings, categories, images } from '@/lib/db/schema'
import { formatPrice } from '@/lib/format'
import { getFavoriteListingIds } from '@/app/actions/favorites'

export default async function FavoritesPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const ids = await getFavoriteListingIds()

  if (ids.length === 0) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="mb-6 text-2xl font-semibold">Favorites</h1>
        <p className="text-zinc-500">No favorites yet. Save listings by clicking the ♡ button.</p>
      </main>
    )
  }

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
    .where(and(inArray(listings.id, ids), eq(listings.status, 'active')))

  const coverMap = new Map<number, string>()
  if (results.length > 0) {
    const covers = await db
      .select({ listingId: images.listingId, url: images.url })
      .from(images)
      .where(and(inArray(images.listingId, results.map(r => r.id)), eq(images.order, 0)))
    covers.forEach(c => { if (c.listingId) coverMap.set(c.listingId, c.url) })
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Favorites</h1>
      {results.length === 0 ? (
        <p className="text-zinc-500">Your favorited listings are no longer active.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((item) => {
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
      )}
    </main>
  )
}
