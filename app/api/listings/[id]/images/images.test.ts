import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockApiKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockUpload: vi.fn(),
  mockGetPublicUrl: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: { select: mocks.mockSelect, insert: mocks.mockInsert } }))
vi.mock('@/lib/api', () => ({
  withApi: vi.fn(async (req: Request, handler: (ctx: { userId: string }) => Promise<Response>) => {
    if (!mocks.mockRateLimit()) {
      return Response.json({ error: { message: 'Too many requests', code: 'RATE_LIMITED' } }, { status: 429 })
    }
    if (!mocks.mockApiKey(req)) {
      return Response.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, { status: 401 })
    }
    return handler({ userId: 'user_123' })
  }),
  ok: vi.fn((data: unknown, meta: unknown = {}) => Response.json({ data, meta }, { status: 201 })),
  apiError: vi.fn((status: number, message: string, code: string) =>
    Response.json({ error: { message, code } }, { status })
  ),
  corsHeaders: { 'Access-Control-Allow-Origin': '*' },
}))
vi.mock('@/lib/supabase/storage', () => ({
  BUCKET: 'listing-images',
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: mocks.mockUpload,
        getPublicUrl: mocks.mockGetPublicUrl,
      })),
    },
  },
}))

import { POST } from './route'

// ─── chain helpers ────────────────────────────────────────────────────────────

function makeSelectChain(result: unknown[]) {
  const promise = Promise.resolve(result)
  const chain: Record<string, unknown> = {
    from: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
    then: promise.then.bind(promise), catch: promise.catch.bind(promise),
  }
  for (const key of ['from', 'where', 'orderBy', 'limit']) {
    (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  }
  return chain
}

function makeInsertChain(returnVal: unknown[] = [{ id: 5, url: 'https://cdn/img.jpg', order: 0 }]) {
  const returningResult = Promise.resolve(returnVal)
  const valuesResult = Object.assign(Promise.resolve(undefined), {
    returning: vi.fn().mockReturnValue(returningResult),
  })
  return { values: vi.fn().mockReturnValue(valuesResult) }
}

function makeFormData(file?: File) {
  const fd = new FormData()
  if (file) fd.append('image', file)
  return fd
}

function makeReq(formData: FormData) {
  return new Request('http://localhost/api/listings/1/images', {
    method: 'POST',
    headers: { authorization: 'Bearer sk_test' },
    body: formData,
  })
}

// ─── POST /api/listings/:id/images ────────────────────────────────────────────

describe('POST /api/listings/:id/images', () => {
  const params = Promise.resolve({ id: '1' })

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.mockRateLimit.mockReturnValue(true)
    mocks.mockApiKey.mockReturnValue(true)
    // listing ownership check
    mocks.mockSelect
      .mockReturnValueOnce(makeSelectChain([{ clerkUserId: 'user_123' }]))
      .mockReturnValueOnce(makeSelectChain([]))  // max order query
    mocks.mockInsert.mockReturnValue(makeInsertChain())
    mocks.mockUpload.mockResolvedValue({ error: null })
    mocks.mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn/img.jpg' } })
  })

  it('returns 401 without API key', async () => {
    mocks.mockApiKey.mockReturnValue(false)
    const res = await POST(makeReq(makeFormData()), { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 for non-numeric listing id', async () => {
    const res = await POST(makeReq(makeFormData()), { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(404)
  })

  it('returns 404 when listing not found', async () => {
    mocks.mockSelect.mockReset()
    mocks.mockSelect.mockReturnValue(makeSelectChain([]))
    const res = await POST(makeReq(makeFormData()), { params })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user does not own the listing', async () => {
    mocks.mockSelect.mockReset()
    mocks.mockSelect.mockReturnValue(makeSelectChain([{ clerkUserId: 'other_user' }]))
    const res = await POST(makeReq(makeFormData()), { params })
    expect(res.status).toBe(403)
  })

  it('returns 422 when no image field provided', async () => {
    const res = await POST(makeReq(makeFormData()), { params })
    expect(res.status).toBe(422)
  })

  it('returns 201 with image data on success', async () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
    const res = await POST(makeReq(makeFormData(file)), { params })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.url).toBe('https://cdn/img.jpg')
  })
})
