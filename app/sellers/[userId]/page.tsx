import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { clerkClient } from '@clerk/nextjs/server'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { listings, images } from '@/lib/db/schema'
import { formatPrice } from '@/lib/format'
import { getSellerReviews } from '@/app/actions/reviews'

export default async function SellerPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId: sellerId } = await params

  let user: { firstName: string | null; lastName: string | null; imageUrl: string } | null = null
  try {
    const client = await clerkClient()
    user = await client.users.getUser(sellerId)
  } catch {
    notFound()
  }

  const [sellerListings, sellerReviews] = await Promise.all([
    db
      .select()
      .from(listings)
      .where(eq(listings.clerkUserId, sellerId))
      .orderBy(desc(listings.createdAt)),
    getSellerReviews(sellerId),
  ])

  const coverMap = new Map<number, string>()
  if (sellerListings.length > 0) {
    const covers = await db
      .select({ listingId: images.listingId, url: images.url })
      .from(images)
      .where(and(inArray(images.listingId, sellerListings.map(l => l.id)), eq(images.order, 0)))
    covers.forEach(c => { if (c.listingId) coverMap.set(c.listingId, c.url) })
  }

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Seller'

  const avgRating = sellerReviews.length > 0
    ? (sellerReviews.reduce((sum, r) => sum + r.rating, 0) / sellerReviews.length).toFixed(1)
    : null

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={user.imageUrl} alt={displayName} className="h-16 w-16 rounded-full object-cover" />
        <div>
          <h1 className="text-2xl font-semibold">{displayName}</h1>
          <p className="text-sm text-zinc-500">
            {sellerListings.length} listing{sellerListings.length !== 1 ? 's' : ''}
            {avgRating && ` · ★ ${avgRating} (${sellerReviews.length} review${sellerReviews.length !== 1 ? 's' : ''})`}
          </p>
        </div>
      </div>

      {sellerListings.length === 0 ? (
        <p className="mb-10 text-zinc-500">No listings yet.</p>
      ) : (
        <ul className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {sellerListings.map((listing) => {
            const cover = coverMap.get(listing.id)
            return (
              <li key={listing.id}>
                <Link
                  href={`/listings/${listing.id}`}
                  className="flex flex-col gap-2 rounded-xl border border-zinc-200 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                >
                  {cover ? (
                    <div className="relative aspect-video overflow-hidden rounded-t-xl">
                      <Image src={cover} alt={listing.title} fill className="object-cover" />
                    </div>
                  ) : (
                    <div className="aspect-video rounded-t-xl bg-zinc-100 dark:bg-zinc-800" />
                  )}
                  <div className="flex flex-col gap-1 p-3 pt-2">
                    <span className="line-clamp-2 text-sm font-medium leading-snug">{listing.title}</span>
                    <span className="font-semibold">{formatPrice(listing.price)}</span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">
          Reviews{sellerReviews.length > 0 ? ` (${sellerReviews.length})` : ''}
        </h2>
        {sellerReviews.length === 0 ? (
          <p className="text-sm text-zinc-500">No reviews yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {sellerReviews.map((review) => (
              <li key={review.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-amber-500">
                    {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {review.createdAt ? new Date(review.createdAt).toLocaleDateString() : ''}
                  </span>
                </div>
                {review.body && (
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">{review.body}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
