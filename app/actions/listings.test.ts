import { describe, expect, it, vi, beforeEach } from 'vitest'

// ─── hoisted mocks ────────────────────────────────────────────────────────────
// Must be defined before vi.mock() calls because those are hoisted to the top.

const mocks = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockSelect: vi.fn(),
  mockUpload: vi.fn(),
  mockGetPublicUrl: vi.fn(),
  mockStorageRemove: vi.fn(),
  mockLookupZip: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: {
    insert: mocks.mockInsert,
    update: mocks.mockUpdate,
    delete: mocks.mockDelete,
    select: mocks.mockSelect,
  },
}))
vi.mock('@/lib/supabase/storage', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: mocks.mockUpload,
        getPublicUrl: mocks.mockGetPublicUrl,
        remove: mocks.mockStorageRemove,
      })),
    },
  },
  BUCKET: 'listing-images',
}))
vi.mock('@/lib/geo', () => ({ lookupZip: mocks.mockLookupZip }))

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createListing, updateListing, updateListingStatus, deleteListing } from './listings'

// ─── chain helpers ────────────────────────────────────────────────────────────
// Drizzle query builders are chainable AND awaitable. These helpers replicate
// that shape so tests can control what each query resolves to.

function makeSelectChain(result: any[]) {
  const promise = Promise.resolve(result)
  const chain: any = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  }
  chain.from.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.orderBy.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  return chain
}

function makeUpdateChain() {
  const promise = Promise.resolve(undefined)
  const chain: any = {
    set: vi.fn(),
    where: vi.fn(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  }
  chain.set.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  return chain
}

function makeDeleteChain() {
  const promise = Promise.resolve(undefined)
  const chain: any = {
    where: vi.fn(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  }
  chain.where.mockReturnValue(chain)
  return chain
}

function makeInsertChain(returnVal: any[] = []) {
  const returningResult = Promise.resolve(returnVal)
  const conflictChain = Object.assign(Promise.resolve(undefined), {
    catch: (fn: any) => { void Promise.resolve(undefined).catch(fn); return conflictChain },
  })
  const valuesResult = Object.assign(Promise.resolve(undefined), {
    returning: vi.fn().mockReturnValue(returningResult),
    onConflictDoUpdate: vi.fn().mockReturnValue(conflictChain),
  })
  return { values: vi.fn().mockReturnValue(valuesResult) }
}

// ─── form data helpers ────────────────────────────────────────────────────────

function fd(fields: Record<string, string | string[]>, files: File[] = []): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) value.forEach(v => form.append(key, v))
    else form.append(key, value)
  }
  files.forEach(f => form.append('images', f))
  return form
}

const baseFields = {
  title: 'Vintage Chair',
  description: 'Great condition',
  price: '49.99',
  zip: '97201',
  categoryId: '2',
}

const geoResult = { city: 'Portland', state: 'OR', lat: 45.52, lng: -122.68 }

// ─── createListing ────────────────────────────────────────────────────────────

describe('createListing', () => {
  beforeEach(() => {
    vi.resetAllMocks() // also flushes any leftover mockReturnValueOnce queues
    vi.mocked(auth).mockResolvedValue({ userId: 'user_123' } as any)
    mocks.mockInsert.mockReturnValue(makeInsertChain([{ id: 42 }]))
    mocks.mockLookupZip.mockReturnValue(geoResult)
  })

  it('throws when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any)
    await expect(createListing(fd(baseFields))).rejects.toThrow('Unauthorized')
  })

  it('converts price from dollars to cents', async () => {
    await createListing(fd({ ...baseFields, price: '9.99' }))
    expect(mocks.mockInsert().values).toHaveBeenCalledWith(
      expect.objectContaining({ price: 999 })
    )
  })

  it('sets categoryId to null when empty', async () => {
    await createListing(fd({ ...baseFields, categoryId: '' }))
    expect(mocks.mockInsert().values).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: null })
    )
  })

  it('attaches the authenticated userId', async () => {
    await createListing(fd(baseFields))
    expect(mocks.mockInsert().values).toHaveBeenCalledWith(
      expect.objectContaining({ clerkUserId: 'user_123' })
    )
  })

  it('revalidates the home page', async () => {
    await createListing(fd(baseFields))
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })

  it('redirects to the new listing', async () => {
    await createListing(fd(baseFields))
    expect(redirect).toHaveBeenCalledWith('/listings/42')
  })

  it('does not insert images when no files attached', async () => {
    await createListing(fd(baseFields))
    // listing insert + userSettings ZIP upsert
    expect(mocks.mockInsert).toHaveBeenCalledTimes(2)
  })

  it('uploads files and inserts image rows', async () => {
    mocks.mockUpload.mockResolvedValue({ error: null })
    mocks.mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://x.supabase.co/img.jpg' } })
    mocks.mockInsert
      .mockReturnValueOnce(makeInsertChain([{ id: 42 }]))
      .mockReturnValueOnce(makeInsertChain())
      .mockReturnValueOnce(makeInsertChain()) // userSettings ZIP upsert

    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
    await createListing(fd(baseFields, [file]))

    expect(mocks.mockUpload).toHaveBeenCalledTimes(1)
    expect(mocks.mockInsert).toHaveBeenCalledTimes(3)
  })

  it('throws when a file upload fails', async () => {
    mocks.mockUpload.mockResolvedValue({ error: { message: 'bucket not found' } })
    mocks.mockInsert
      .mockReturnValueOnce(makeInsertChain([{ id: 42 }]))
      .mockReturnValueOnce(makeInsertChain())

    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
    await expect(createListing(fd(baseFields, [file]))).rejects.toThrow('bucket not found')
  })

  it('stores derived city, state, lat, lng from zip lookup', async () => {
    await createListing(fd(baseFields))
    expect(mocks.mockInsert().values).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Portland', state: 'OR', lat: 45.52, lng: -122.68 })
    )
  })

  it('stores null geo fields when zip is empty', async () => {
    await createListing(fd({ ...baseFields, zip: '' }))
    expect(mocks.mockInsert().values).toHaveBeenCalledWith(
      expect.objectContaining({ zip: null, city: null, state: null, lat: null, lng: null })
    )
  })

  it('stores null geo fields when zip is unrecognised', async () => {
    mocks.mockLookupZip.mockReturnValue(null)
    await createListing(fd({ ...baseFields, zip: '00000' }))
    expect(mocks.mockInsert().values).toHaveBeenCalledWith(
      expect.objectContaining({ zip: null, city: null, state: null })
    )
  })
})

// ─── updateListingStatus ──────────────────────────────────────────────────────

describe('updateListingStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ userId: 'user_123' } as any)
    // assertOwner select
    mocks.mockSelect.mockReturnValue(makeSelectChain([{ clerkUserId: 'user_123' }]))
    mocks.mockUpdate.mockReturnValue(makeUpdateChain())
  })

  it('throws when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any)
    await expect(updateListingStatus(fd({ listingId: '1', status: 'sold' }))).rejects.toThrow('Unauthorized')
  })

  it('throws when user does not own the listing', async () => {
    mocks.mockSelect.mockReturnValue(makeSelectChain([{ clerkUserId: 'other_user' }]))
    await expect(updateListingStatus(fd({ listingId: '1', status: 'sold' }))).rejects.toThrow('Forbidden')
  })

  it('throws when listing is not found', async () => {
    mocks.mockSelect.mockReturnValue(makeSelectChain([]))
    await expect(updateListingStatus(fd({ listingId: '99', status: 'sold' }))).rejects.toThrow('Forbidden')
  })

  it('updates status to sold', async () => {
    await updateListingStatus(fd({ listingId: '42', status: 'sold' }))
    expect(mocks.mockUpdate().set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sold' })
    )
  })

  it('revalidates the listing and dashboard', async () => {
    await updateListingStatus(fd({ listingId: '42', status: 'sold' }))
    expect(revalidatePath).toHaveBeenCalledWith('/listings/42')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
  })
})

// ─── deleteListing ────────────────────────────────────────────────────────────

describe('deleteListing', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue({ userId: 'user_123' } as any)
    mocks.mockSelect
      .mockReturnValueOnce(makeSelectChain([{ clerkUserId: 'user_123' }])) // assertOwner
      .mockReturnValueOnce(makeSelectChain([{ url: 'https://x.supabase.co/storage/v1/object/public/listing-images/42/photo.jpg' }])) // get images
    mocks.mockDelete.mockReturnValue(makeDeleteChain())
    mocks.mockStorageRemove.mockResolvedValue({ error: null })
  })

  it('throws when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any)
    await expect(deleteListing(fd({ listingId: '42' }))).rejects.toThrow('Unauthorized')
  })

  it('throws when user does not own the listing', async () => {
    mocks.mockSelect.mockReset()
    mocks.mockSelect.mockReturnValue(makeSelectChain([{ clerkUserId: 'other_user' }]))
    await expect(deleteListing(fd({ listingId: '42' }))).rejects.toThrow('Forbidden')
  })

  it('removes images from storage before deleting from DB', async () => {
    await deleteListing(fd({ listingId: '42' }))
    expect(mocks.mockStorageRemove).toHaveBeenCalledWith(['42/photo.jpg'])
    expect(mocks.mockDelete).toHaveBeenCalled()
  })

  it('redirects to dashboard after deletion', async () => {
    await deleteListing(fd({ listingId: '42' }))
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })
})

// ─── updateListing ────────────────────────────────────────────────────────────

describe('updateListing', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue({ userId: 'user_123' } as any)
    mocks.mockSelect.mockReturnValue(makeSelectChain([{ clerkUserId: 'user_123' }]))
    mocks.mockUpdate.mockReturnValue(makeUpdateChain())
    mocks.mockDelete.mockReturnValue(makeDeleteChain())
    mocks.mockInsert.mockReturnValue(makeInsertChain())
    mocks.mockStorageRemove.mockResolvedValue({ error: null })
    mocks.mockLookupZip.mockReturnValue(geoResult)
  })

  it('throws when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any)
    await expect(updateListing(fd({ ...baseFields, listingId: '42' }))).rejects.toThrow('Unauthorized')
  })

  it('throws when user does not own the listing', async () => {
    mocks.mockSelect.mockReturnValue(makeSelectChain([{ clerkUserId: 'other_user' }]))
    await expect(updateListing(fd({ ...baseFields, listingId: '42' }))).rejects.toThrow('Forbidden')
  })

  it('converts price from dollars to cents on update', async () => {
    await updateListing(fd({ ...baseFields, listingId: '42', price: '19.99' }))
    expect(mocks.mockUpdate().set).toHaveBeenCalledWith(
      expect.objectContaining({ price: 1999 })
    )
  })

  it('deletes removed images from storage and DB', async () => {
    mocks.mockSelect
      .mockReturnValueOnce(makeSelectChain([{ clerkUserId: 'user_123' }])) // assertOwner
      .mockReturnValueOnce(makeSelectChain([{ url: 'https://x.supabase.co/storage/v1/object/public/listing-images/42/old.jpg' }])) // images to delete

    await updateListing(fd({
      ...baseFields,
      listingId: '42',
      deleteImageId: ['7'],
    }))

    expect(mocks.mockStorageRemove).toHaveBeenCalledWith(['42/old.jpg'])
    expect(mocks.mockDelete).toHaveBeenCalled()
  })

  it('redirects to listing page after update', async () => {
    await updateListing(fd({ ...baseFields, listingId: '42' }))
    expect(redirect).toHaveBeenCalledWith('/listings/42')
  })

  it('stores derived city, state, lat, lng from zip on update', async () => {
    await updateListing(fd({ ...baseFields, listingId: '42' }))
    expect(mocks.mockUpdate().set).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Portland', state: 'OR', lat: 45.52, lng: -122.68 })
    )
  })
})
