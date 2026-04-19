import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockApiKey: vi.fn(),
  mockRateLimit: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: { select: mocks.mockSelect } }))
vi.mock('@/lib/api', () => ({
  withApi: vi.fn(async (req: Request, handler: () => Promise<Response>) => {
    if (!mocks.mockRateLimit()) {
      return Response.json({ error: { message: 'Too many requests', code: 'RATE_LIMITED' } }, { status: 429 })
    }
    if (!mocks.mockApiKey(req)) {
      return Response.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, { status: 401 })
    }
    return handler()
  }),
  ok: vi.fn((data: unknown, meta: unknown = {}) => Response.json({ data, meta })),
  apiError: vi.fn((status: number, message: string, code: string) =>
    Response.json({ error: { message, code } }, { status })
  ),
  corsHeaders: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' },
}))

import { GET } from './route'

// ─── chain helper ─────────────────────────────────────────────────────────────

function makeSelectChain(result: unknown[]) {
  const promise = Promise.resolve(result)
  const chain: Record<string, unknown> = {
    from: vi.fn(), where: vi.fn(), leftJoin: vi.fn(), orderBy: vi.fn(),
    then: promise.then.bind(promise), catch: promise.catch.bind(promise),
  }
  for (const key of ['from', 'where', 'leftJoin', 'orderBy']) {
    (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  }
  return chain
}

function makeReq() {
  return new Request('http://localhost/api/listings/1', {
    headers: { authorization: 'Bearer test' },
  })
}

const listing = {
  id: 1, title: 'Bike', description: 'A bike', price: 5000,
  city: 'Austin', state: 'TX', zip: '78701', lat: 30.27, lng: -97.74,
  status: 'active', clerkUserId: 'user_1', categoryId: 2,
  createdAt: new Date(), updatedAt: new Date(), categoryName: 'Sports',
}

// ─── GET /api/listings/:id ────────────────────────────────────────────────────

describe('GET /api/listings/:id', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.mockRateLimit.mockReturnValue(true)
    mocks.mockApiKey.mockReturnValue(true)
    mocks.mockSelect
      .mockReturnValueOnce(makeSelectChain([listing]))
      .mockReturnValueOnce(makeSelectChain([
        { id: 10, url: 'https://cdn/a.jpg', order: 0 },
        { id: 11, url: 'https://cdn/b.jpg', order: 1 },
      ]))
  })

  it('returns 200 with listing and images array', async () => {
    const res = await GET(makeReq(), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe(1)
    expect(body.data.images).toHaveLength(2)
    expect(body.data.images[0].url).toBe('https://cdn/a.jpg')
  })

  it('returns 404 when listing not found', async () => {
    mocks.mockSelect.mockReset()
    mocks.mockSelect.mockReturnValue(makeSelectChain([]))
    const res = await GET(makeReq(), { params: Promise.resolve({ id: '999' }) })
    expect(res.status).toBe(404)
  })

  it('returns 404 for non-numeric id', async () => {
    const res = await GET(makeReq(), { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(404)
  })

  it('returns 401 without API key', async () => {
    mocks.mockApiKey.mockReturnValue(false)
    const res = await GET(makeReq(), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(401)
  })
})
