'use server'

import { auth } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { userSettings } from '@/lib/db/schema'

export async function getUserSettings(): Promise<{ zip: string | null; notificationsEnabled: boolean }> {
  const { userId } = await auth()
  if (!userId) return { zip: null, notificationsEnabled: true }

  const [row] = await db
    .select({ zip: userSettings.zip, notificationsEnabled: userSettings.notificationsEnabled })
    .from(userSettings)
    .where(eq(userSettings.clerkUserId, userId))

  return {
    zip: row?.zip ?? null,
    notificationsEnabled: row?.notificationsEnabled ?? true,
  }
}

export async function updateUserSettings(formData: FormData) {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const zip = (formData.get('zip') as string | null)?.trim() || null
  const notificationsEnabled = formData.get('notificationsEnabled') === 'on'

  await db
    .insert(userSettings)
    .values({ clerkUserId: userId, zip, notificationsEnabled })
    .onConflictDoUpdate({
      target: userSettings.clerkUserId,
      set: { zip, notificationsEnabled, updatedAt: new Date() },
    })

  revalidatePath('/settings')
}
