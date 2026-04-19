import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { categories } from '@/lib/db/schema'
import { checkRateLimit } from '@/lib/api'
import { lookupZip } from '@/lib/geo'
import { analyzeListing } from '@/lib/ai/analyze'
import { getPriceSuggestion } from '@/lib/ai/pricing'

export async function POST(req: Request): Promise<Response> {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { userId } = await auth()
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const imageFiles = formData.getAll('images').filter(
    (f): f is File => f instanceof File && f.size > 0
  )

  if (imageFiles.length === 0) {
    return Response.json({ error: 'At least one image is required' }, { status: 400 })
  }

  if (imageFiles.length > 10) {
    return Response.json({ error: 'Maximum 10 images allowed' }, { status: 400 })
  }

  const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png'])
  for (const file of imageFiles) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return Response.json({ error: 'Images must be JPEG or PNG' }, { status: 400 })
    }
    if (file.size > 5 * 1024 * 1024) {
      return Response.json({ error: 'Images must be under 5MB each' }, { status: 400 })
    }
  }

  const zip = (formData.get('zip') as string | null)?.trim() ?? ''
  const geo = zip ? lookupZip(zip) : null
  const location = geo ? `${geo.city}, ${geo.state}` : ''

  const cats = await db.select({ slug: categories.slug }).from(categories)
  const categorySlugs = cats.map(c => c.slug)

  const images = await Promise.all(
    imageFiles.map(async f => {
      const buf = await f.arrayBuffer()
      return { data: Buffer.from(buf).toString('base64'), mimeType: f.type }
    })
  )

  try {
    const analysis = await analyzeListing(images, location, categorySlugs)
    const price = await getPriceSuggestion(analysis.title, location, analysis.price)
    return Response.json({ ...analysis, price })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    return Response.json({ error: message }, { status: 422 })
  }
}
