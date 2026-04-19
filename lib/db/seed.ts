// Run with: npx tsx lib/db/seed.ts
try { process.loadEnvFile('.env.local') } catch {}

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { categories } from './schema'

const client = postgres(process.env.DATABASE_URL!)
const db = drizzle(client)

const CATEGORIES = [
  { name: 'Electronics',  slug: 'electronics' },
  { name: 'Vehicles',     slug: 'vehicles' },
  { name: 'Furniture',    slug: 'furniture' },
  { name: 'Clothing',     slug: 'clothing' },
  { name: 'Garden',       slug: 'garden' },
  { name: 'Sports',       slug: 'sports' },
  { name: 'Toys',         slug: 'toys' },
  { name: 'Books',        slug: 'books' },
  { name: 'Other',        slug: 'other' },
]

async function main() {
  await db.insert(categories).values(CATEGORIES).onConflictDoNothing()
  console.log(`Seeded ${CATEGORIES.length} categories.`)
  await client.end()
}

main()
