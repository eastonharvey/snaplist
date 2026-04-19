import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({ mockInsert: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { insert: mocks.mockInsert } }))

import { auth } from '@clerk/nextjs/server'
import { reportListing } from './reports'

function makeInsertChain() {
  const conflictChain = Object.assign(Promise.resolve(undefined), { catch: (fn: any) => conflictChain })
  return { values: vi.fn().mockReturnValue(Object.assign(Promise.resolve(undefined), {
    onConflictDoNothing: vi.fn().mockReturnValue(conflictChain),
  })) }
}

const fd = (fields: Record<string, string>) => {
  const form = new FormData()
  Object.entries(fields).forEach(([k, v]) => form.append(k, v))
  return form
}

describe('reportListing', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue({ userId: 'user_123' } as any)
    mocks.mockInsert.mockReturnValue(makeInsertChain())
  })

  it('throws when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any)
    await expect(reportListing(fd({ listingId: '1', reason: 'spam' }))).rejects.toThrow('Unauthorized')
  })

  it('throws on invalid reason', async () => {
    await expect(reportListing(fd({ listingId: '1', reason: 'invalid_reason' }))).rejects.toThrow('Invalid reason')
  })

  it('inserts a report for valid input', async () => {
    await reportListing(fd({ listingId: '42', reason: 'spam', details: 'Duplicate post' }))
    expect(mocks.mockInsert).toHaveBeenCalled()
  })
})
