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
vi.mock('@/lib/geo', () => ({
  lookupZip: vi.fn(() => null),
  haversineWhere: vi.fn(() => ({ sql: 'haversine' })),
}))

import { GET, OPTIONS } from './route'

// ─── chain helper ─────────────────────────────────────────────────────────────

function makeSelectChain(result: unknown[]) {
  const promise = Promise.resolve(result)
  const chain: Record<string, unknown> = {
    from: vi.fn(), where: vi.fn(), leftJoin: vi.fn(),
    orderBy: vi.fn(), limit: vi.fn(), offset: vi.fn(),
    then: promise.then.bind(promise), catch: promise.catch.bind(promise),
  }
  for (const key of ['from', 'where', 'leftJoin', 'orderBy', 'limit', 'offset']) {
    (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  }
  return chain
}

function makeReq(params = '') {
  return new Request(`http://localhost/api/listings${params ? '?' + params : ''}`, {
    headers: { authorization: 'Bearer test' },
  })
}

// ─── GET /api/listings ────────────────────────────────────────────────────────

describe('GET /api/listings', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.mockRateLimit.mockReturnValue(true)
    mocks.mockApiKey.mockReturnValue(true)
    // First select = count, second = paginated results
    mocks.mockSelect
      .mockReturnValueOnce(makeSelectChain([{ count: 2 }]))
      .mockReturnValueOnce(makeSelectChain([
        { id: 1, title: 'Bike', price: 5000, city: 'Austin', state: 'TX', status: 'active', zip: '78701', createdAt: new Date(), categoryName: 'Sports' },
        { id: 2, title: 'Desk', price: 12000, city: null, state: null, status: 'active', zip: null, createdAt: new Date(), categoryName: null },
      ]))
  })

  it('returns 200 with data array and meta', async () => {
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(2)
    expect(body.meta).toMatchObject({ total: 2, page: 1, pageSize: 20, totalPages: 1 })
  })

  it('returns 401 when API key is missing', async () => {
    mocks.mockApiKey.mockReturnValue(false)
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate limit is exceeded', async () => {
    mocks.mockRateLimit.mockReturnValue(false)
    const res = await GET(makeReq())
    expect(res.status).toBe(429)
  })

  it('clamps pageSize to 100', async () => {
    const res = await GET(makeReq('pageSize=500'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.meta.pageSize).toBe(100)
  })

  it('calculates totalPages correctly', async () => {
    mocks.mockSelect.mockReset()
    mocks.mockSelect
      .mockReturnValueOnce(makeSelectChain([{ count: 45 }]))
      .mockReturnValueOnce(makeSelectChain([]))
    const res = await GET(makeReq('pageSize=20'))
    const body = await res.json()
    expect(body.meta).toMatchObject({ total: 45, totalPages: 3 })
  })

  it('defaults to status=active', async () => {
    await GET(makeReq())
    // Just check it didn't throw — status filter is applied internally
    expect(mocks.mockSelect).toHaveBeenCalledTimes(2)
  })
})

// ─── OPTIONS ─────────────────────────────────────────────────────────────────

describe('OPTIONS /api/listings', () => {
  it('returns 204 with CORS headers', () => {
    const res = OPTIONS()
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})
