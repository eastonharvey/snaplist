import { describe, expect, it, vi, beforeEach } from 'vitest'

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockSelect: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: {
    insert: mocks.mockInsert,
    update: mocks.mockUpdate,
    select: mocks.mockSelect,
  },
}))

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { startThread, sendMessage, markThreadRead, getUnreadCount } from './messages'

// ─── chain helpers ────────────────────────────────────────────────────────────

function makeSelectChain(result: any[]) {
  const promise = Promise.resolve(result)
  const chain: any = {
    from: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
    innerJoin: vi.fn(), leftJoin: vi.fn(), groupBy: vi.fn(),
    then: promise.then.bind(promise), catch: promise.catch.bind(promise),
  }
  chain.from.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.orderBy.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  chain.innerJoin.mockReturnValue(chain)
  chain.leftJoin.mockReturnValue(chain)
  chain.groupBy.mockReturnValue(chain)
  return chain
}

function makeUpdateChain() {
  const promise = Promise.resolve(undefined)
  const chain: any = {
    set: vi.fn(), where: vi.fn(),
    then: promise.then.bind(promise), catch: promise.catch.bind(promise),
  }
  chain.set.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  return chain
}

function makeInsertChain(returnVal: any[] = []) {
  const returningResult = Promise.resolve(returnVal)
  const valuesResult = Object.assign(Promise.resolve(undefined), {
    returning: vi.fn().mockReturnValue(returningResult),
  })
  return { values: vi.fn().mockReturnValue(valuesResult) }
}

function fd(fields: Record<string, string>): FormData {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return form
}

// ─── startThread ──────────────────────────────────────────────────────────────

describe('startThread', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue({ userId: 'buyer_123' } as any)
    mocks.mockInsert.mockReturnValue(makeInsertChain([{ id: 10 }]))
    mocks.mockUpdate.mockReturnValue(makeUpdateChain())
    // select: 1st call = listing lookup, 2nd call = existing thread check
    mocks.mockSelect
      .mockReturnValueOnce(makeSelectChain([{ clerkUserId: 'seller_456', status: 'active' }]))
      .mockReturnValueOnce(makeSelectChain([]))
  })

  it('throws when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any)
    await expect(startThread(fd({ listingId: '1', body: 'Hi!' }))).rejects.toThrow('Unauthorized')
  })

  it('throws when body is empty', async () => {
    await expect(startThread(fd({ listingId: '1', body: '   ' }))).rejects.toThrow('Message cannot be empty')
  })

  it('throws when listing not found', async () => {
    mocks.mockSelect.mockReset()
    mocks.mockSelect.mockReturnValue(makeSelectChain([]))
    await expect(startThread(fd({ listingId: '1', body: 'Hi!' }))).rejects.toThrow('Listing not found')
  })

  it('throws when user tries to message their own listing', async () => {
    mocks.mockSelect.mockReset()
    mocks.mockSelect.mockReturnValue(makeSelectChain([{ clerkUserId: 'buyer_123', status: 'active' }]))
    await expect(startThread(fd({ listingId: '1', body: 'Hi!' }))).rejects.toThrow('Cannot message yourself')
  })

  it('throws when listing is not active', async () => {
    mocks.mockSelect.mockReset()
    mocks.mockSelect.mockReturnValue(makeSelectChain([{ clerkUserId: 'seller_456', status: 'sold' }]))
    await expect(startThread(fd({ listingId: '1', body: 'Hi!' }))).rejects.toThrow('Listing is not active')
  })

  it('creates a new thread and inserts the message', async () => {
    await startThread(fd({ listingId: '1', body: 'Is this available?' }))
    expect(mocks.mockInsert).toHaveBeenCalledTimes(2) // thread + message
  })

  it('reuses an existing thread instead of creating a duplicate', async () => {
    mocks.mockSelect.mockReset()
    mocks.mockSelect
      .mockReturnValueOnce(makeSelectChain([{ clerkUserId: 'seller_456', status: 'active' }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }])) // existing thread
    await startThread(fd({ listingId: '1', body: 'Still interested!' }))
    // Only one insert: the message (no new thread)
    expect(mocks.mockInsert).toHaveBeenCalledTimes(1)
  })

  it('redirects to the thread after sending', async () => {
    await startThread(fd({ listingId: '1', body: 'Hi!' }))
    expect(redirect).toHaveBeenCalledWith('/messages/10')
  })

  it('revalidates /messages after sending', async () => {
    await startThread(fd({ listingId: '1', body: 'Hi!' }))
    expect(revalidatePath).toHaveBeenCalledWith('/messages')
  })
})

// ─── sendMessage ──────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue({ userId: 'buyer_123' } as any)
    // assertParticipant select
    mocks.mockSelect.mockReturnValue(
      makeSelectChain([{ buyerClerkUserId: 'buyer_123', sellerClerkUserId: 'seller_456' }])
    )
    mocks.mockInsert.mockReturnValue(makeInsertChain())
    mocks.mockUpdate.mockReturnValue(makeUpdateChain())
  })

  it('throws when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any)
    await expect(sendMessage(fd({ threadId: '10', body: 'Hello' }))).rejects.toThrow('Unauthorized')
  })

  it('throws when body is empty', async () => {
    await expect(sendMessage(fd({ threadId: '10', body: '' }))).rejects.toThrow('Message cannot be empty')
  })

  it('throws when user is not a thread participant', async () => {
    mocks.mockSelect.mockReturnValue(
      makeSelectChain([{ buyerClerkUserId: 'other_a', sellerClerkUserId: 'other_b' }])
    )
    await expect(sendMessage(fd({ threadId: '10', body: 'Hi' }))).rejects.toThrow('Forbidden')
  })

  it('inserts the message', async () => {
    await sendMessage(fd({ threadId: '10', body: 'Hello!' }))
    expect(mocks.mockInsert().values).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Hello!', senderClerkUserId: 'buyer_123' })
    )
  })

  it('revalidates and redirects to the thread', async () => {
    await sendMessage(fd({ threadId: '10', body: 'Hello!' }))
    expect(revalidatePath).toHaveBeenCalledWith('/messages/10')
    expect(redirect).toHaveBeenCalledWith('/messages/10')
  })
})

// ─── markThreadRead ───────────────────────────────────────────────────────────

describe('markThreadRead', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.mockUpdate.mockReturnValue(makeUpdateChain())
  })

  it('calls db.update on messages', async () => {
    await markThreadRead(10, 'buyer_123')
    expect(mocks.mockUpdate).toHaveBeenCalled()
  })

  it('sets isRead to true', async () => {
    await markThreadRead(10, 'buyer_123')
    expect(mocks.mockUpdate().set).toHaveBeenCalledWith({ isRead: true })
  })
})

// ─── getUnreadCount ───────────────────────────────────────────────────────────

describe('getUnreadCount', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns the count from the query', async () => {
    mocks.mockSelect.mockReturnValue(makeSelectChain([{ count: 3 }]))
    const result = await getUnreadCount('buyer_123')
    expect(result).toBe(3)
  })

  it('returns 0 when no unread messages', async () => {
    mocks.mockSelect.mockReturnValue(makeSelectChain([{ count: 0 }]))
    const result = await getUnreadCount('buyer_123')
    expect(result).toBe(0)
  })

  it('returns 0 when query returns empty rows', async () => {
    mocks.mockSelect.mockReturnValue(makeSelectChain([]))
    const result = await getUnreadCount('buyer_123')
    expect(result).toBe(0)
  })
})
