'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { and, eq, or, desc, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { threads, messages, listings, userSettings } from '@/lib/db/schema'
import { sendNewMessageEmail } from '@/lib/email'

// ─── helpers ─────────────────────────────────────────────────────────────────

async function assertParticipant(threadId: number, userId: string) {
  const [thread] = await db
    .select({ buyerClerkUserId: threads.buyerClerkUserId, sellerClerkUserId: threads.sellerClerkUserId })
    .from(threads)
    .where(eq(threads.id, threadId))
  if (!thread || (thread.buyerClerkUserId !== userId && thread.sellerClerkUserId !== userId)) {
    throw new Error('Forbidden')
  }
  return thread
}

// ─── email notification helper ───────────────────────────────────────────────

async function sendEmailNotification({
  threadId,
  senderId,
  messageBody,
}: {
  threadId: number
  senderId: string
  messageBody: string
}) {
  const [thread] = await db
    .select({
      buyerClerkUserId: threads.buyerClerkUserId,
      sellerClerkUserId: threads.sellerClerkUserId,
      listingTitle: listings.title,
      listingId: threads.listingId,
    })
    .from(threads)
    .innerJoin(listings, eq(threads.listingId, listings.id))
    .where(eq(threads.id, threadId))

  if (!thread) return

  const recipientId = thread.buyerClerkUserId === senderId
    ? thread.sellerClerkUserId
    : thread.buyerClerkUserId

  // Check recipient has notifications enabled
  const [recipientSettings] = await db
    .select({ notificationsEnabled: userSettings.notificationsEnabled })
    .from(userSettings)
    .where(eq(userSettings.clerkUserId, recipientId))

  if (recipientSettings?.notificationsEnabled === false) return

  const client = await clerkClient()
  const [recipient, sender] = await Promise.all([
    client.users.getUser(recipientId),
    client.users.getUser(senderId),
  ])

  const recipientEmail = recipient.emailAddresses[0]?.emailAddress
  if (!recipientEmail) return

  const senderName = [sender.firstName, sender.lastName].filter(Boolean).join(' ') || 'Someone'

  await sendNewMessageEmail({
    toEmail: recipientEmail,
    senderName,
    listingTitle: thread.listingTitle,
    listingId: thread.listingId,
    messagePreview: messageBody.slice(0, 200),
  })
}

// ─── startThread ─────────────────────────────────────────────────────────────

export async function startThread(formData: FormData) {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const listingId = parseInt(formData.get('listingId') as string, 10)
  const body = (formData.get('body') as string).trim()
  if (!body) throw new Error('Message cannot be empty')

  const [listing] = await db
    .select({ clerkUserId: listings.clerkUserId, status: listings.status })
    .from(listings)
    .where(eq(listings.id, listingId))

  if (!listing) throw new Error('Listing not found')
  if (listing.clerkUserId === userId) throw new Error('Cannot message yourself')
  if (listing.status !== 'active') throw new Error('Listing is not active')

  // Find existing thread or create a new one
  const existing = await db
    .select({ id: threads.id })
    .from(threads)
    .where(and(eq(threads.listingId, listingId), eq(threads.buyerClerkUserId, userId)))

  let threadId: number
  if (existing.length > 0) {
    threadId = existing[0].id
  } else {
    const [created] = await db
      .insert(threads)
      .values({ listingId, buyerClerkUserId: userId, sellerClerkUserId: listing.clerkUserId })
      .returning({ id: threads.id })
    threadId = created.id
  }

  await db.insert(messages).values({ threadId, senderClerkUserId: userId, body })
  await db.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, threadId))

  revalidatePath('/messages')
  redirect(`/messages/${threadId}`)
}

// ─── sendMessage ──────────────────────────────────────────────────────────────

export async function sendMessage(formData: FormData) {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const threadId = parseInt(formData.get('threadId') as string, 10)
  const body = (formData.get('body') as string).trim()
  if (!body) throw new Error('Message cannot be empty')

  await assertParticipant(threadId, userId)

  await db.insert(messages).values({ threadId, senderClerkUserId: userId, body })
  await db.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, threadId))

  // Fire-and-forget email notification — don't block the response
  sendEmailNotification({ threadId, senderId: userId, messageBody: body }).catch(
    err => console.error('[email] notification failed:', err)
  )

  revalidatePath(`/messages/${threadId}`)
  redirect(`/messages/${threadId}`)
}

// ─── markThreadRead ───────────────────────────────────────────────────────────

export async function markThreadRead(threadId: number, userId: string) {
  await db
    .update(messages)
    .set({ isRead: true })
    .where(
      and(
        eq(messages.threadId, threadId),
        eq(messages.isRead, false),
        // Only mark messages sent by the other person as read
        sql`${messages.senderClerkUserId} != ${userId}`
      )
    )
}

// ─── data helpers (called from server components) ────────────────────────────

export async function getUnreadCount(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(threads, eq(messages.threadId, threads.id))
    .where(
      and(
        eq(messages.isRead, false),
        sql`${messages.senderClerkUserId} != ${userId}`,
        or(
          eq(threads.buyerClerkUserId, userId),
          eq(threads.sellerClerkUserId, userId)
        )
      )
    )
  return rows[0]?.count ?? 0
}

export async function getThreads(userId: string) {
  return db
    .select({
      id: threads.id,
      listingId: threads.listingId,
      listingTitle: listings.title,
      buyerClerkUserId: threads.buyerClerkUserId,
      sellerClerkUserId: threads.sellerClerkUserId,
      updatedAt: threads.updatedAt,
      unreadCount: sql<number>`
        count(case when ${messages.isRead} = false
          and ${messages.senderClerkUserId} != ${userId} then 1 end)::int
      `,
    })
    .from(threads)
    .innerJoin(listings, eq(threads.listingId, listings.id))
    .leftJoin(messages, eq(messages.threadId, threads.id))
    .where(or(eq(threads.buyerClerkUserId, userId), eq(threads.sellerClerkUserId, userId)))
    .groupBy(threads.id, listings.id)
    .orderBy(desc(threads.updatedAt))
}

export async function getThreadWithMessages(threadId: number, userId: string) {
  const [thread] = await db
    .select({
      id: threads.id,
      listingId: threads.listingId,
      listingTitle: listings.title,
      buyerClerkUserId: threads.buyerClerkUserId,
      sellerClerkUserId: threads.sellerClerkUserId,
    })
    .from(threads)
    .innerJoin(listings, eq(threads.listingId, listings.id))
    .where(eq(threads.id, threadId))

  if (!thread || (thread.buyerClerkUserId !== userId && thread.sellerClerkUserId !== userId)) {
    return null
  }

  const threadMessages = await db
    .select({
      id: messages.id,
      senderClerkUserId: messages.senderClerkUserId,
      body: messages.body,
      isRead: messages.isRead,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(desc(messages.createdAt))

  return { thread, messages: threadMessages.reverse() }
}
