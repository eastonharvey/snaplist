import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq, asc } from 'drizzle-orm'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { listings, categories, images } from '@/lib/db/schema'
import { formatPrice } from '@/lib/format'
import { deleteListing, updateListingStatus } from '@/app/actions/listings'
import { startThread } from '@/app/actions/messages'
import { toggleFavorite, getFavoriteListingIds } from '@/app/actions/favorites'
import { submitReview, getSellerReviews } from '@/app/actions/reviews'
import ReportListing from '@/app/_components/report-listing'

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const listingId = parseInt(id, 10)
  if (isNaN(listingId)) notFound()

  const { userId } = await auth()

  const [[result], listingImages] = await Promise.all([
    db
      .select({
        id: listings.id,
        title: listings.title,
        description: listings.description,
        price: listings.price,
        city: listings.city,
        state: listings.state,
        status: listings.status,
        clerkUserId: listings.clerkUserId,
        createdAt: listings.createdAt,
        categoryName: categories.name,
      })
      .from(listings)
      .leftJoin(categories, eq(listings.categoryId, categories.id))
      .where(eq(listings.id, listingId)),
    db
      .select({ id: images.id, url: images.url })
      .from(images)
      .where(eq(images.listingId, listingId))
      .orderBy(asc(images.order)),
  ])

  if (!result) notFound()

  const isOwner = userId === result.clerkUserId

  const [favoriteIds, existingReviews] = await Promise.all([
    getFavoriteListingIds(),
    getSellerReviews(result.clerkUserId),
  ])
  const isFavorited = favoriteIds.includes(listingId)
  const viewerAlreadyReviewed = userId
    ? existingReviews.some(r => r.reviewerClerkUserId === userId && r.listingId === listingId)
    : false

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      {listingImages.length > 0 && (
        <div className="mb-8">
          <div className="relative mb-2 aspect-video overflow-hidden rounded-xl">
            <Image src={listingImages[0].url} alt={result.title} fill className="object-cover" priority />
          </div>
          {listingImages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {listingImages.slice(1).map((img) => (
                <div key={img.id} className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg">
                  <Image src={img.url} alt="" fill className="object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mb-2 text-sm text-zinc-500">
        {result.categoryName ?? 'Uncategorised'}
        {(result.city && result.state) && ` · ${result.city}, ${result.state}`}
        {' · '}
        <Link href={`/sellers/${result.clerkUserId}`} className="underline hover:text-zinc-900 dark:hover:text-zinc-100">
          View seller
        </Link>
      </div>

      <h1 className="mb-4 text-3xl font-semibold">{result.title}</h1>
      <div className="mb-6 flex items-center gap-4">
        <p className="text-2xl font-bold">{formatPrice(result.price)}</p>
        {userId && !isOwner && (
          <form action={toggleFavorite}>
            <input type="hidden" name="listingId" value={result.id} />
            <button
              type="submit"
              aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
              className="text-2xl leading-none text-rose-500 transition-opacity hover:opacity-70"
            >
              {isFavorited ? '♥' : '♡'}
            </button>
          </form>
        )}
      </div>

      <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{result.description}</p>

      {result.status !== 'active' && (
        <p className="mt-6 rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium capitalize text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          This listing is {result.status}
        </p>
      )}

      {userId && !isOwner && result.status === 'active' && (
        <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-medium">Contact seller</h2>
          <form action={startThread} className="flex flex-col gap-3">
            <input type="hidden" name="listingId" value={result.id} />
            <textarea
              name="body"
              required
              rows={3}
              placeholder="Hi, is this still available?"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="submit"
              className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Send message
            </button>
          </form>
        </div>
      )}

      {!userId && result.status === 'active' && (
        <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <Link
            href="/sign-in"
            className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Sign in to contact the seller
          </Link>
        </div>
      )}

      {isOwner && (
        <div className="mt-8 flex flex-wrap gap-2 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <Link
            href={`/listings/${result.id}/edit`}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:border-zinc-500 dark:border-zinc-700"
          >
            Edit
          </Link>

          {result.status === 'active' && (
            <form action={updateListingStatus}>
              <input type="hidden" name="listingId" value={result.id} />
              <input type="hidden" name="status" value="sold" />
              <button type="submit" className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:border-zinc-500 dark:border-zinc-700">
                Mark as sold
              </button>
            </form>
          )}

          {result.status === 'active' && (
            <form action={updateListingStatus}>
              <input type="hidden" name="listingId" value={result.id} />
              <input type="hidden" name="status" value="archived" />
              <button type="submit" className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:border-zinc-500 dark:border-zinc-700">
                Archive
              </button>
            </form>
          )}

          {result.status !== 'active' && (
            <form action={updateListingStatus}>
              <input type="hidden" name="listingId" value={result.id} />
              <input type="hidden" name="status" value="active" />
              <button type="submit" className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:border-zinc-500 dark:border-zinc-700">
                Reactivate
              </button>
            </form>
          )}

          <form action={deleteListing}>
            <input type="hidden" name="listingId" value={result.id} />
            <button type="submit" className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:border-red-400 dark:border-red-900 dark:text-red-400">
              Delete listing
            </button>
          </form>
        </div>
      )}

      {userId && !isOwner && (
        <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <ReportListing listingId={result.id} />
        </div>
      )}

      {userId && !isOwner && result.status === 'sold' && !viewerAlreadyReviewed && (
        <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-medium">Leave a review for this seller</h2>
          <form action={submitReview} className="flex flex-col gap-3">
            <input type="hidden" name="listingId" value={result.id} />
            <div>
              <label htmlFor="review-rating" className="mb-1 block text-sm">Rating</label>
              <select
                id="review-rating"
                name="rating"
                required
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">Select rating</option>
                {[5, 4, 3, 2, 1].map(n => (
                  <option key={n} value={n}>{'★'.repeat(n)} {n}/5</option>
                ))}
              </select>
            </div>
            <textarea
              name="body"
              rows={3}
              placeholder="Share your experience with this seller..."
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="submit"
              className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Submit review
            </button>
          </form>
        </div>
      )}
    </main>
  )
}
