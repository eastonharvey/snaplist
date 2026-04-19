'use server'

import { auth } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { generateKey, hashKey, encryptKey, decryptKey } from '@/lib/apiKey'

export async function generateApiKey(): Promise<string> {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const key = generateKey()

  await db
    .insert(apiKeys)
    .values({
      clerkUserId: userId,
      keyHash: hashKey(key),
      keyEncrypted: encryptKey(key),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: apiKeys.clerkUserId,
      set: {
        keyHash: hashKey(key),
        keyEncrypted: encryptKey(key),
        updatedAt: new Date(),
      },
    })

  return key
}

export async function getMyApiKey(): Promise<string | null> {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const [row] = await db
    .select({ keyEncrypted: apiKeys.keyEncrypted })
    .from(apiKeys)
    .where(eq(apiKeys.clerkUserId, userId))

  return row ? decryptKey(row.keyEncrypted) : null
}
