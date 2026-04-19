import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { insert: mocks.mockInsert, select: mocks.mockSelect } }))

import { auth } from '@clerk/nextjs/server'
import { submitReview, getSellerReviews } from './reviews'

function makeInsertChain() {
  const conflictChain = Object.assign(Promise.resolve(undefined), { catch: (fn: any) => conflictChain })
  return { values: vi.fn().mockReturnValue(Object.assign(Promise.resolve(undefined), {
    onConflictDoNothing: vi.fn().mockReturnValue(conflictChain),
  })) }
}

function makeSelectChain(result: any[]) {
  const p = Promise.resolve(result)
  const chain: any = { from: vi.fn(), where: vi.fn(), orderBy: vi.fn(), then: p.then.bind(p), catch: p.catch.bind(p) }
  chain.from.mockReturnValue(chain); chain.where.mockReturnValue(chain); chain.orderBy.mockReturnValue(chain)
  return chain
}

const fd = (fields: Record<string, string>) => {
  const form = new FormData()
  Object.entries(fields).forEach(([k, v]) => form.append(k, v))
  return form
}

describe('submitReview', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue({ userId: 'buyer_123' } as any)
    mocks.mockInsert.mockReturnValue(makeInsertChain())
    mocks.mockSelect.mockReturnValue(makeSelectChain([{ clerkUserId: 'seller_456' }]))
  })

  it('throws when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any)
    await expect(submitReview(fd({ listingId: '1', rating: '5', body: 'Great!' }))).rejects.toThrow('Unauthorized')
  })

  it('throws when rating is out of range', async () => {
    await expect(submitReview(fd({ listingId: '1', rating: '6', body: '' }))).rejects.toThrow('Invalid rating')
  })

  it('throws when reviewer is the seller', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'seller_456' } as any)
    await expect(submitReview(fd({ listingId: '1', rating: '5', body: '' }))).rejects.toThrow('Cannot review')
  })

  it('inserts the review on valid input', async () => {
    await submitReview(fd({ listingId: '42', rating: '4', body: 'Great seller!' }))
    expect(mocks.mockInsert).toHaveBeenCalled()
  })
})
