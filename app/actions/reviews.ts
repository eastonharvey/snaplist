'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { reviews, listings } from '@/lib/db/schema'

export async function submitReview(formData: FormData) {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const listingId = parseInt(formData.get('listingId') as string, 10)
  const rating = parseInt(formData.get('rating') as string, 10)
  const body = (formData.get('body') as string | null)?.trim() || null

  if (rating < 1 || rating > 5) throw new Error('Invalid rating — must be 1–5')

  const [listing] = await db
    .select({ clerkUserId: listings.clerkUserId })
    .from(listings)
    .where(eq(listings.id, listingId))

  if (!listing) throw new Error('Listing not found')
  if (listing.clerkUserId === userId) throw new Error('Cannot review your own listing')

  await db
    .insert(reviews)
    .values({ listingId, reviewerClerkUserId: userId, sellerClerkUserId: listing.clerkUserId, rating, body })
    .onConflictDoNothing()

  revalidatePath(`/sellers/${listing.clerkUserId}`)
}

export async function getSellerReviews(sellerClerkUserId: string) {
  return db
    .select()
    .from(reviews)
    .where(eq(reviews.sellerClerkUserId, sellerClerkUserId))
    .orderBy(desc(reviews.createdAt))
}
