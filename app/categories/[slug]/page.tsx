import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq, desc, inArray, and, SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { listings, categories, images } from '@/lib/db/schema'
import { formatPrice } from '@/lib/format'

type Params = Promise<{ slug: string }>

export default async function CategoryPage({ params }: { params: Params }) {
  const { slug } = await params

  const [category] = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.slug, slug))

  if (!category) notFound()

  const conditions: SQL[] = [
    eq(listings.status, 'active'),
    eq(listings.categoryId, category.id),
  ]

  const results = await db
    .select({
      id: listings.id,
      title: listings.title,
      price: listings.price,
      city: listings.city,
      state: listings.state,
      createdAt: listings.createdAt,
    })
    .from(listings)
    .where(and(...conditions))
    .orderBy(desc(listings.createdAt))

  const coverMap = new Map<number, string>()
  if (results.length > 0) {
    const covers = await db
      .select({ listingId: images.listingId, url: images.url })
      .from(images)
      .where(and(
        inArray(images.listingId, results.map(r => r.id)),
        eq(images.order, 0)
      ))
    covers.forEach(c => { if (c.listingId) coverMap.set(c.listingId, c.url) })
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          ← All listings
        </Link>
        <span className="text-zinc-300 dark:text-zinc-600">/</span>
        <h1 className="text-2xl font-semibold">{category.name}</h1>
      </div>

      {results.length === 0 ? (
        <p className="text-zinc-500">No active listings in this category.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((item) => {
            const cover = coverMap.get(item.id)
            return (
              <li key={item.id}>
                <Link
                  href={`/listings/${item.id}`}
                  className="flex flex-col gap-2 rounded-xl border border-zinc-200 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                >
                  {cover ? (
                    <div className="relative aspect-video overflow-hidden rounded-t-xl">
                      <Image src={cover} alt={item.title} fill className="object-cover" />
                    </div>
                  ) : (
                    <div className="aspect-video rounded-t-xl bg-zinc-100 dark:bg-zinc-800" />
                  )}
                  <div className="flex flex-col gap-1 p-4 pt-2">
                    <span className="line-clamp-2 font-medium leading-snug">{item.title}</span>
                    <span className="text-lg font-semibold">{formatPrice(item.price)}</span>
                    {item.city && item.state && (
                      <span className="text-sm text-zinc-500">{item.city}, {item.state}</span>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
