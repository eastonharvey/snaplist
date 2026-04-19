import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { eq, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { listings } from '@/lib/db/schema'
import { formatPrice } from '@/lib/format'
import { deleteListing, updateListingStatus } from '@/app/actions/listings'

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  sold: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  archived: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const userListings = await db
    .select({
      id: listings.id,
      title: listings.title,
      price: listings.price,
      status: listings.status,
      city: listings.city,
      state: listings.state,
      createdAt: listings.createdAt,
    })
    .from(listings)
    .where(eq(listings.clerkUserId, userId))
    .orderBy(desc(listings.createdAt))

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold">My listings</h1>

      {userListings.length === 0 ? (
        <p className="text-zinc-500">
          No listings yet.{' '}
          <Link href="/listings/new" className="underline hover:text-zinc-900 dark:hover:text-zinc-100">
            Post your first listing
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {userListings.map((listing) => (
            <li key={listing.id} className="flex items-start justify-between gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="min-w-0">
                <Link
                  href={`/listings/${listing.id}`}
                  className="line-clamp-1 font-medium hover:underline"
                >
                  {listing.title}
                </Link>
                <p className="mt-0.5 text-sm text-zinc-500">
                  {formatPrice(listing.price)}{listing.city && listing.state && ` · ${listing.city}, ${listing.state}`}
                </p>
              </div>

              <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusStyles[listing.status ?? 'active']}`}>
                  {listing.status}
                </span>

                <Link
                  href={`/listings/${listing.id}/edit`}
                  className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium transition-colors hover:border-zinc-500 dark:border-zinc-700"
                >
                  Edit
                </Link>

                {listing.status !== 'active' && (
                  <form action={updateListingStatus}>
                    <input type="hidden" name="listingId" value={listing.id} />
                    <input type="hidden" name="status" value="active" />
                    <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium transition-colors hover:border-zinc-500 dark:border-zinc-700">
                      Reactivate
                    </button>
                  </form>
                )}

                {listing.status === 'active' && (
                  <form action={updateListingStatus}>
                    <input type="hidden" name="listingId" value={listing.id} />
                    <input type="hidden" name="status" value="sold" />
                    <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium transition-colors hover:border-zinc-500 dark:border-zinc-700">
                      Mark sold
                    </button>
                  </form>
                )}

                <form action={deleteListing}>
                  <input type="hidden" name="listingId" value={listing.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:border-red-400 dark:border-red-900 dark:text-red-400"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
