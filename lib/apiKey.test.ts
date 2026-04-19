import { describe, it, expect, beforeEach, vi } from 'vitest'

// Stub a 32-byte hex secret before importing the module
beforeEach(() => {
  vi.stubEnv('API_KEY_ENCRYPTION_SECRET', 'a'.repeat(64))
})

import { generateKey, hashKey, encryptKey, decryptKey } from './apiKey'

describe('generateKey', () => {
  it('starts with sk_', () => {
    expect(generateKey()).toMatch(/^sk_/)
  })

  it('is 67 characters long (sk_ + 64 hex)', () => {
    expect(generateKey()).toHaveLength(67)
  })

  it('generates unique keys', () => {
    expect(generateKey()).not.toBe(generateKey())
  })
})

describe('hashKey', () => {
  it('returns a 64-char hex string', () => {
    expect(hashKey('sk_abc')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', () => {
    expect(hashKey('sk_abc')).toBe(hashKey('sk_abc'))
  })

  it('different inputs produce different hashes', () => {
    expect(hashKey('sk_abc')).not.toBe(hashKey('sk_xyz'))
  })
})

describe('encryptKey / decryptKey', () => {
  it('round-trips correctly', () => {
    const key = 'sk_' + 'f'.repeat(64)
    expect(decryptKey(encryptKey(key))).toBe(key)
  })

  it('produces different ciphertext each time (random IV)', () => {
    const key = 'sk_test'
    expect(encryptKey(key)).not.toBe(encryptKey(key))
  })

  it('decryptKey returns the exact original string', () => {
    const original = generateKey()
    expect(decryptKey(encryptKey(original))).toBe(original)
  })
})
