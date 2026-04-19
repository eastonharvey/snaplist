import { asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { categories } from '@/lib/db/schema'
import { withApi, ok, corsHeaders } from '@/lib/api'

export async function GET(req: Request) {
  return withApi(req, async () => {
    const results = await db
      .select({ id: categories.id, name: categories.name, slug: categories.slug })
      .from(categories)
      .orderBy(asc(categories.name))

    return ok(results)
  })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
