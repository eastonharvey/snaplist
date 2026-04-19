import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockDelete: vi.fn(),
  mockSelect: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: { insert: mocks.mockInsert, delete: mocks.mockDelete, select: mocks.mockSelect },
}))

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { toggleFavorite, getFavoriteListingIds } from './favorites'

function makeInsertChain() {
  const conflictChain = Object.assign(Promise.resolve(undefined), {
    catch: (fn: any) => conflictChain,
  })
  return { values: vi.fn().mockReturnValue(Object.assign(Promise.resolve(undefined), {
    onConflictDoNothing: vi.fn().mockReturnValue(conflictChain),
  })) }
}

function makeDeleteChain() {
  const p = Promise.resolve(undefined)
  const chain: any = { where: vi.fn(), then: p.then.bind(p), catch: p.catch.bind(p) }
  chain.where.mockReturnValue(chain)
  return chain
}

function makeSelectChain(result: any[]) {
  const p = Promise.resolve(result)
  const chain: any = { from: vi.fn(), where: vi.fn(), then: p.then.bind(p), catch: p.catch.bind(p) }
  chain.from.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  return chain
}

const fd = (fields: Record<string, string>) => {
  const form = new FormData()
  Object.entries(fields).forEach(([k, v]) => form.append(k, v))
  return form
}

describe('toggleFavorite', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue({ userId: 'user_123' } as any)
    mocks.mockSelect.mockReturnValue(makeSelectChain([]))
    mocks.mockInsert.mockReturnValue(makeInsertChain())
    mocks.mockDelete.mockReturnValue(makeDeleteChain())
  })

  it('throws when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any)
    await expect(toggleFavorite(fd({ listingId: '1' }))).rejects.toThrow('Unauthorized')
  })

  it('inserts favorite when not yet favorited', async () => {
    mocks.mockSelect.mockReturnValue(makeSelectChain([]))
    await toggleFavorite(fd({ listingId: '42' }))
    expect(mocks.mockInsert).toHaveBeenCalled()
  })

  it('deletes favorite when already favorited', async () => {
    mocks.mockSelect.mockReturnValue(makeSelectChain([{ id: 1 }]))
    await toggleFavorite(fd({ listingId: '42' }))
    expect(mocks.mockDelete).toHaveBeenCalled()
  })

  it('revalidates the listing path', async () => {
    await toggleFavorite(fd({ listingId: '42' }))
    expect(revalidatePath).toHaveBeenCalledWith('/listings/42')
  })
})

describe('getFavoriteListingIds', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue({ userId: 'user_123' } as any)
  })

  it('returns empty array when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any)
    const result = await getFavoriteListingIds()
    expect(result).toEqual([])
  })

  it('returns listing IDs for authenticated user', async () => {
    mocks.mockSelect.mockReturnValue(makeSelectChain([{ listingId: 10 }, { listingId: 20 }]))
    const result = await getFavoriteListingIds()
    expect(result).toEqual([10, 20])
  })
})
