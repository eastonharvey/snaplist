import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockApiKey: vi.fn(),
  mockRateLimit: vi.fn(),
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
  corsHeaders: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' },
}))
vi.mock('@/lib/geo', () => ({ lookupZip: vi.fn(() => null) }))

import { POST } from './route'

// ─── chain helpers ────────────────────────────────────────────────────────────

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

function makeInsertChain(returnVal: unknown[] = [{ id: 99 }]) {
  const returningResult = Promise.resolve(returnVal)
  const valuesResult = Object.assign(Promise.resolve(undefined), {
    returning: vi.fn().mockReturnValue(returningResult),
  })
  return { values: vi.fn().mockReturnValue(valuesResult) }
}

function makeReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/listings', {
    method: 'POST',
    headers: { authorization: 'Bearer sk_test', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ─── POST /api/listings ───────────────────────────────────────────────────────

describe('POST /api/listings', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.mockRateLimit.mockReturnValue(true)
    mocks.mockApiKey.mockReturnValue(true)
    mocks.mockSelect.mockReturnValue(makeSelectChain([{ id: 2 }])) // category lookup
    mocks.mockInsert.mockReturnValue(makeInsertChain([{ id: 99 }]))
  })

  it('returns 401 without API key', async () => {
    mocks.mockApiKey.mockReturnValue(false)
    const res = await POST(makeReq({ title: 'Bike', description: 'Fast', price: 10 }))
    expect(res.status).toBe(401)
  })

  it('returns 422 when title is missing', async () => {
    const res = await POST(makeReq({ description: 'Fast', price: 10 }))
    expect(res.status).toBe(422)
  })

  it('returns 422 when description is missing', async () => {
    const res = await POST(makeReq({ title: 'Bike', price: 10 }))
    expect(res.status).toBe(422)
  })

  it('returns 422 when price is missing', async () => {
    const res = await POST(makeReq({ title: 'Bike', description: 'Fast' }))
    expect(res.status).toBe(422)
  })

  it('returns 201 on valid request', async () => {
    const res = await POST(makeReq({ title: 'Bike', description: 'Fast', price: 49.99 }))
    expect(res.status).toBe(201)
  })

  it('converts price from dollars to cents', async () => {
    await POST(makeReq({ title: 'Bike', description: 'Fast', price: 49.99 }))
    const inserted = mocks.mockInsert().values.mock.calls[0]?.[0]
    expect(inserted?.price).toBe(4999)
  })

  it('returns the new listing id in data', async () => {
    const res = await POST(makeReq({ title: 'Bike', description: 'Fast', price: 10 }))
    const body = await res.json()
    expect(body.data.id).toBe(99)
  })
})
