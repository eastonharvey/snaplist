import { notFound, redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { eq, asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { listings, categories, images } from '@/lib/db/schema'
import EditForm from './edit-form'

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const listingId = parseInt(id, 10)
  if (isNaN(listingId)) notFound()

  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const [[listing], allCategories, listingImages] = await Promise.all([
    db
      .select({
        id: listings.id,
        title: listings.title,
        description: listings.description,
        price: listings.price,
        zip: listings.zip,
        categoryId: listings.categoryId,
        condition: listings.condition,
        clerkUserId: listings.clerkUserId,
      })
      .from(listings)
      .where(eq(listings.id, listingId)),
    db.select({ id: categories.id, name: categories.name }).from(categories),
    db
      .select({ id: images.id, url: images.url })
      .from(images)
      .where(eq(images.listingId, listingId))
      .orderBy(asc(images.order)),
  ])

  if (!listing) notFound()
  if (listing.clerkUserId !== userId) notFound()

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold">Edit listing</h1>
      <EditForm
        listing={{ ...listing, price: listing.price / 100, zip: listing.zip, condition: listing.condition ?? null }}
        categories={allCategories}
        existingImages={listingImages}
      />
    </main>
  )
}
