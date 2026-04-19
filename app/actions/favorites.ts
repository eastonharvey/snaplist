'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { favorites } from '@/lib/db/schema'

export async function toggleFavorite(formData: FormData) {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const listingId = parseInt(formData.get('listingId') as string, 10)

  const [existing] = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(and(eq(favorites.clerkUserId, userId), eq(favorites.listingId, listingId)))

  if (existing) {
    await db.delete(favorites).where(eq(favorites.id, existing.id))
  } else {
    await db.insert(favorites).values({ clerkUserId: userId, listingId }).onConflictDoNothing()
  }

  revalidatePath(`/listings/${listingId}`)
  revalidatePath('/favorites')
}

export async function getFavoriteListingIds(): Promise<number[]> {
  const { userId } = await auth()
  if (!userId) return []

  const rows = await db
    .select({ listingId: favorites.listingId })
    .from(favorites)
    .where(eq(favorites.clerkUserId, userId))

  return rows.map(r => r.listingId)
}
