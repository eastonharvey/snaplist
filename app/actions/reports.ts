'use server'

import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { reports } from '@/lib/db/schema'

const VALID_REASONS = ['spam', 'prohibited', 'misleading', 'other'] as const
type ReportReason = typeof VALID_REASONS[number]

export async function reportListing(formData: FormData) {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const listingId = parseInt(formData.get('listingId') as string, 10)
  const reason = formData.get('reason') as string
  const details = (formData.get('details') as string | null)?.trim() || null

  if (!VALID_REASONS.includes(reason as ReportReason)) {
    throw new Error('Invalid reason')
  }

  await db
    .insert(reports)
    .values({ listingId, reporterClerkUserId: userId, reason: reason as ReportReason, details })
    .onConflictDoNothing()
}
