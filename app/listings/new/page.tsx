import { db } from '@/lib/db'
import { categories } from '@/lib/db/schema'
import { getUserSettings } from '@/app/actions/settings'
import ListingForm from './listing-form'

export default async function NewListingPage() {
  const [allCategories, settings] = await Promise.all([
    db.select({ id: categories.id, name: categories.name, slug: categories.slug }).from(categories),
    getUserSettings(),
  ])

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold">Post a listing</h1>
      <ListingForm categories={allCategories} defaultZip={settings.zip ?? ''} />
    </main>
  )
}
