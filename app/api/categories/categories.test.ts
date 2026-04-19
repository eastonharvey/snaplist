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

import { GET, OPTIONS } from './route'

// ─── chain helper ─────────────────────────────────────────────────────────────

function makeSelectChain(result: unknown[]) {
  const promise = Promise.resolve(result)
  const chain: Record<string, unknown> = {
    from: vi.fn(), orderBy: vi.fn(),
    then: promise.then.bind(promise), catch: promise.catch.bind(promise),
  }
  for (const key of ['from', 'orderBy']) {
    (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  }
  return chain
}

function makeReq() {
  return new Request('http://localhost/api/categories', {
    headers: { authorization: 'Bearer test' },
  })
}

// ─── GET /api/categories ──────────────────────────────────────────────────────

describe('GET /api/categories', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.mockRateLimit.mockReturnValue(true)
    mocks.mockApiKey.mockReturnValue(true)
    mocks.mockSelect.mockReturnValue(makeSelectChain([
      { id: 1, name: 'Electronics', slug: 'electronics' },
      { id: 2, name: 'Sports', slug: 'sports' },
    ]))
  })

  it('returns 200 with categories array', async () => {
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(2)
    expect(body.data[0].slug).toBe('electronics')
  })

  it('returns empty meta object', async () => {
    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.meta).toEqual({})
  })

  it('returns 401 without API key', async () => {
    mocks.mockApiKey.mockReturnValue(false)
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })
})

// ─── OPTIONS ─────────────────────────────────────────────────────────────────

describe('OPTIONS /api/categories', () => {
  it('returns 204 with CORS headers', () => {
    const res = OPTIONS()
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})
