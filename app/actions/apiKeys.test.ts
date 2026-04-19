import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
  },
}))
vi.mock('@/lib/apiKey', () => ({
  generateKey: vi.fn(() => 'sk_' + 'a'.repeat(64)),
  hashKey: vi.fn((k: string) => `hash:${k}`),
  encryptKey: vi.fn((k: string) => `enc:${k}`),
  decryptKey: vi.fn((k: string) => k.replace('enc:', '')),
}))

import { auth } from '@clerk/nextjs/server'
import { generateApiKey, getMyApiKey } from './apiKeys'

// ─── chain helpers ────────────────────────────────────────────────────────────

function makeInsertChain() {
  const promise = Promise.resolve(undefined)
  const chain: Record<string, unknown> = {
    values: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  }
  chain.values = vi.fn().mockReturnValue(chain)
  chain.onConflictDoUpdate = vi.fn().mockReturnValue(chain)
  return chain
}

function makeSelectChain(result: unknown[]) {
  const promise = Promise.resolve(result)
  const chain: Record<string, unknown> = {
    from: vi.fn(), where: vi.fn(),
    then: promise.then.bind(promise), catch: promise.catch.bind(promise),
  }
  chain.from = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  return chain
}

// ─── generateApiKey ───────────────────────────────────────────────────────────

describe('generateApiKey', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue({ userId: 'user_123' } as any)
    mocks.mockInsert.mockReturnValue(makeInsertChain())
  })

  it('throws when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any)
    await expect(generateApiKey()).rejects.toThrow('Unauthorized')
  })

  it('returns the plaintext key', async () => {
    const key = await generateApiKey()
    expect(key).toBe('sk_' + 'a'.repeat(64))
  })

  it('upserts into the apiKeys table', async () => {
    await generateApiKey()
    expect(mocks.mockInsert).toHaveBeenCalledTimes(1)
  })
})

// ─── getMyApiKey ──────────────────────────────────────────────────────────────

describe('getMyApiKey', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue({ userId: 'user_123' } as any)
  })

  it('throws when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any)
    await expect(getMyApiKey()).rejects.toThrow('Unauthorized')
  })

  it('returns null when no key exists', async () => {
    mocks.mockSelect.mockReturnValue(makeSelectChain([]))
    expect(await getMyApiKey()).toBeNull()
  })

  it('returns the decrypted key when one exists', async () => {
    mocks.mockSelect.mockReturnValue(
      makeSelectChain([{ keyEncrypted: 'enc:sk_' + 'a'.repeat(64) }])
    )
    const key = await getMyApiKey()
    expect(key).toBe('sk_' + 'a'.repeat(64))
  })
})
