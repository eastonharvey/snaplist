import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

declare global {
  // eslint-disable-next-line no-var
  var _pgClient: ReturnType<typeof postgres> | undefined
}

// Reuse the client across hot reloads in dev to avoid exhausting the connection pool.
const client = globalThis._pgClient ?? postgres(process.env.DATABASE_URL!, { max: 1 })
if (process.env.NODE_ENV !== 'production') globalThis._pgClient = client

export const db = drizzle(client, { schema })
