import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkRateLimit: vi.fn(),
  analyzeListing: vi.fn(),
  getPriceSuggestion: vi.fn(),
  lookupZip: vi.fn(),
  dbFrom: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }))
vi.mock('@/lib/api', () => ({ checkRateLimit: mocks.checkRateLimit }))
vi.mock('@/lib/ai/analyze', () => ({ analyzeListing: mocks.analyzeListing }))
vi.mock('@/lib/ai/pricing', () => ({ getPriceSuggestion: mocks.getPriceSuggestion }))
vi.mock('@/lib/geo', () => ({ lookupZip: mocks.lookupZip }))
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: mocks.dbFrom,
    }),
  },
}))

import { POST } from './route'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeRequest(overrides: { zip?: string; images?: File[] } = {}) {
  const formData = new FormData()
  const images = overrides.images ?? [
    new File(['fake-image'], 'photo.jpg', { type: 'image/jpeg' }),
  ]
  images.forEach(f => formData.append('images', f))
  if (overrides.zip) formData.append('zip', overrides.zip)
  return new Request('http://localhost/api/analyze', {
    method: 'POST',
    body: formData,
  })
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('POST /api/analyze', () => {
  beforeEach(() => {
    mocks.checkRateLimit.mockReturnValue(true)
    mocks.auth.mockResolvedValue({ userId: 'user_123' })
    mocks.lookupZip.mockReturnValue({ city: 'Austin', state: 'TX', lat: 30.2, lng: -97.7 })
    mocks.dbFrom.mockResolvedValue([{ slug: 'electronics' }, { slug: 'clothing' }])
    mocks.analyzeListing.mockResolvedValue({
      title: 'MacBook Pro',
      description: 'Great laptop',
      price: 74900,
      categorySlug: 'electronics',
      condition: 'like_new',
    })
    mocks.getPriceSuggestion.mockResolvedValue(74900)
  })

  it('returns 429 when rate limited', async () => {
    mocks.checkRateLimit.mockReturnValue(false)
    const res = await POST(makeRequest())
    expect(res.status).toBe(429)
  })

  it('returns 401 when not authenticated', async () => {
    mocks.auth.mockResolvedValue({ userId: null })
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 400 when no images provided', async () => {
    const formData = new FormData()
    const req = new Request('http://localhost/api/analyze', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/image/i)
  })

  it('returns structured analysis on success', async () => {
    const res = await POST(makeRequest({ zip: '78701' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      title: 'MacBook Pro',
      description: 'Great laptop',
      price: 74900,
      categorySlug: 'electronics',
      condition: 'like_new',
    })
  })

  it('returns 422 when analysis throws', async () => {
    mocks.analyzeListing.mockRejectedValue(new Error('Could not identify item'))
    const res = await POST(makeRequest())
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('Could not identify item')
  })

  it('passes location string to analyzeListing when zip resolves', async () => {
    await POST(makeRequest({ zip: '78701' }))
    expect(mocks.analyzeListing).toHaveBeenCalledWith(
      expect.any(Array),
      'Austin, TX',
      expect.any(Array)
    )
  })

  it('passes empty location when zip is absent', async () => {
    await POST(makeRequest())
    expect(mocks.analyzeListing).toHaveBeenCalledWith(
      expect.any(Array),
      '',
      expect.any(Array)
    )
  })
})
