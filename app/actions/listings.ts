'use server'

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { eq, inArray, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { listings, images, userSettings } from '@/lib/db/schema'
import { supabase, BUCKET } from '@/lib/supabase/storage'
import { lookupZip } from '@/lib/geo'

// ─── helpers ────────────────────────────────────────────────────────────────

function storagePathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = url.indexOf(marker)
  return idx !== -1 ? url.substring(idx + marker.length) : null
}

async function deleteStorageImages(urls: string[]) {
  const paths = urls.map(storagePathFromUrl).filter((p): p is string => p !== null)
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths)
}

async function uploadFiles(files: File[], listingId: number, startOrder: number) {
  return Promise.all(
    files.map(async (file, i) => {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
      const path = `${listingId}/${Date.now()}-${i}.${ext}`
      const buffer = await file.arrayBuffer()
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: file.type })
      if (error) throw new Error(`Upload failed: ${error.message}`)
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
      return { url: data.publicUrl, order: startOrder + i }
    })
  )
}

async function assertOwner(listingId: number, userId: string) {
  const [listing] = await db
    .select({ clerkUserId: listings.clerkUserId })
    .from(listings)
    .where(eq(listings.id, listingId))
  if (!listing || listing.clerkUserId !== userId) throw new Error('Forbidden')
}

// ─── create ──────────────────────────────────────────────────────────────────

export async function createListing(formData: FormData) {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const priceStr = formData.get('price') as string
  const zipRaw = (formData.get('zip') as string | null)?.trim() ?? ''
  const categoryIdStr = formData.get('categoryId') as string

  const price = Math.round(parseFloat(priceStr) * 100) // dollars → cents
  const categoryId = categoryIdStr ? parseInt(categoryIdStr, 10) : null
  const geo = zipRaw ? lookupZip(zipRaw) : null
  const conditionRaw = formData.get('condition') as string | null
  const condition = (conditionRaw || null) as 'new' | 'like_new' | 'good' | 'fair' | null

  const [listing] = await db
    .insert(listings)
    .values({
      title,
      description,
      price,
      zip: geo ? zipRaw : null,
      city: geo?.city ?? null,
      state: geo?.state ?? null,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      clerkUserId: userId,
      categoryId,
      condition,
    })
    .returning({ id: listings.id })

  const files = (formData.getAll('images') as File[]).filter(f => f.size > 0)
  if (files.length > 0) {
    const uploaded = await uploadFiles(files, listing.id, 0)
    await db.insert(images).values(
      uploaded.map(({ url, order }) => ({ listingId: listing.id, url, order }))
    )
  }

  // Save ZIP for future auto-population — non-blocking
  if (zipRaw) {
    db.insert(userSettings)
      .values({ clerkUserId: userId, zip: zipRaw })
      .onConflictDoUpdate({
        target: userSettings.clerkUserId,
        set: { zip: zipRaw, updatedAt: new Date() },
      })
      .catch(() => { /* zip save failure is non-blocking */ })
  }

  revalidatePath('/')
  redirect(`/listings/${listing.id}`)
}

// ─── update ──────────────────────────────────────────────────────────────────

export async function updateListing(formData: FormData) {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const listingId = parseInt(formData.get('listingId') as string, 10)
  await assertOwner(listingId, userId)

  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const price = Math.round(parseFloat(formData.get('price') as string) * 100)
  const zipRaw = (formData.get('zip') as string | null)?.trim() ?? ''
  const categoryIdStr = formData.get('categoryId') as string
  const categoryId = categoryIdStr ? parseInt(categoryIdStr, 10) : null
  const geo = zipRaw ? lookupZip(zipRaw) : null
  const conditionRaw = formData.get('condition') as string | null
  const condition = (conditionRaw || null) as 'new' | 'like_new' | 'good' | 'fair' | null

  await db
    .update(listings)
    .set({
      title,
      description,
      price,
      zip: geo ? zipRaw : null,
      city: geo?.city ?? null,
      state: geo?.state ?? null,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      categoryId,
      condition,
      updatedAt: new Date(),
    })
    .where(eq(listings.id, listingId))

  // Save ZIP for future auto-population — non-blocking
  if (zipRaw) {
    db.insert(userSettings)
      .values({ clerkUserId: userId, zip: zipRaw })
      .onConflictDoUpdate({
        target: userSettings.clerkUserId,
        set: { zip: zipRaw, updatedAt: new Date() },
      })
      .catch(() => { /* zip save failure is non-blocking */ })
  }

  // Delete removed images
  const deleteIds = (formData.getAll('deleteImageId') as string[])
    .map(Number)
    .filter(Boolean)

  if (deleteIds.length > 0) {
    const toDelete = await db
      .select({ url: images.url })
      .from(images)
      .where(inArray(images.id, deleteIds))
    await deleteStorageImages(toDelete.map(i => i.url))
    await db.delete(images).where(inArray(images.id, deleteIds))
  }

  // Upload new images
  const newFiles = (formData.getAll('images') as File[]).filter(f => f.size > 0)
  if (newFiles.length > 0) {
    const [latest] = await db
      .select({ order: images.order })
      .from(images)
      .where(eq(images.listingId, listingId))
      .orderBy(desc(images.order))
      .limit(1)
    const startOrder = (latest?.order ?? -1) + 1
    const uploaded = await uploadFiles(newFiles, listingId, startOrder)
    await db.insert(images).values(
      uploaded.map(({ url, order }) => ({ listingId, url, order }))
    )
  }

  revalidatePath(`/listings/${listingId}`)
  revalidatePath('/')
  redirect(`/listings/${listingId}`)
}

// ─── status ───────────────────────────────────────────────────────────────────

export async function updateListingStatus(formData: FormData) {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const listingId = parseInt(formData.get('listingId') as string, 10)
  const status = formData.get('status') as 'active' | 'sold' | 'archived'
  await assertOwner(listingId, userId)

  await db
    .update(listings)
    .set({ status, updatedAt: new Date() })
    .where(eq(listings.id, listingId))

  revalidatePath(`/listings/${listingId}`)
  revalidatePath('/dashboard')
}

// ─── delete ───────────────────────────────────────────────────────────────────

export async function deleteListing(formData: FormData) {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const listingId = parseInt(formData.get('listingId') as string, 10)
  await assertOwner(listingId, userId)

  const listingImages = await db
    .select({ url: images.url })
    .from(images)
    .where(eq(images.listingId, listingId))

  await deleteStorageImages(listingImages.map(i => i.url))

  // Cascade in schema deletes images rows automatically
  await db.delete(listings).where(eq(listings.id, listingId))

  revalidatePath('/')
  redirect('/dashboard')
}
