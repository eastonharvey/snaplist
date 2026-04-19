import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { categories, images, listings } from '@/lib/db/schema'
import { withApi, ok, apiError, corsHeaders } from '@/lib/api'

type Params = Promise<{ id: string }>

export async function GET(req: Request, { params }: { params: Params }) {
  return withApi(req, async () => {
    const { id: idStr } = await params
    const id = parseInt(idStr, 10)
    if (isNaN(id)) return apiError(404, 'Listing not found', 'NOT_FOUND')

    const [[listing], listingImages] = await Promise.all([
      db
        .select({
          id: listings.id,
          title: listings.title,
          description: listings.description,
          price: listings.price,
          zip: listings.zip,
          city: listings.city,
          state: listings.state,
          lat: listings.lat,
          lng: listings.lng,
          status: listings.status,
          clerkUserId: listings.clerkUserId,
          categoryId: listings.categoryId,
          createdAt: listings.createdAt,
          updatedAt: listings.updatedAt,
          categoryName: categories.name,
        })
        .from(listings)
        .leftJoin(categories, eq(listings.categoryId, categories.id))
        .where(eq(listings.id, id)),
      db
        .select({ id: images.id, url: images.url, order: images.order })
        .from(images)
        .where(eq(images.listingId, id))
        .orderBy(asc(images.order)),
    ])

    if (!listing) return apiError(404, 'Listing not found', 'NOT_FOUND')

    return ok({ ...listing, images: listingImages })
  })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
