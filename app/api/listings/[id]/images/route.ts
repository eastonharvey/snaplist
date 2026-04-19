import { asc, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { images, listings } from '@/lib/db/schema'
import { withApi, ok, apiError, corsHeaders } from '@/lib/api'
import { supabase, BUCKET } from '@/lib/supabase/storage'

type Params = Promise<{ id: string }>

export async function POST(req: Request, { params }: { params: Params }) {
  return withApi(req, async ({ userId }) => {
    const { id: idStr } = await params
    const listingId = parseInt(idStr, 10)
    if (isNaN(listingId)) return apiError(404, 'Listing not found', 'NOT_FOUND')

    // Verify listing exists and user owns it
    const [listing] = await db
      .select({ clerkUserId: listings.clerkUserId })
      .from(listings)
      .where(eq(listings.id, listingId))

    if (!listing) return apiError(404, 'Listing not found', 'NOT_FOUND')
    if (listing.clerkUserId !== userId) return apiError(403, 'Forbidden', 'FORBIDDEN')

    // Parse multipart body
    const formData = await req.formData().catch(() => null)
    const file = formData?.get('image')
    if (!file || !(file instanceof File) || file.size === 0) {
      return apiError(422, 'image field is required', 'VALIDATION_ERROR')
    }

    // Determine next order index
    const [latest] = await db
      .select({ order: images.order })
      .from(images)
      .where(eq(images.listingId, listingId))
      .orderBy(desc(images.order))
      .limit(1)
    const order = (latest?.order ?? -1) + 1

    // Upload to Supabase
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
    const path = `${listingId}/${Date.now()}.${ext}`
    const buffer = await file.arrayBuffer()
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type })
    if (error) return apiError(500, 'Image upload failed', 'UPLOAD_ERROR')

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)

    // Insert image row
    const [image] = await db
      .insert(images)
      .values({ listingId, url: urlData.publicUrl, order })
      .returning({ id: images.id, url: images.url, order: images.order })

    return ok(image, {})
  })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
