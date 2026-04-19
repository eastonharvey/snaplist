import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: { select: mocks.mockSelect } }))

import { checkRateLimit, ok, apiError, corsHeaders, withApi } from './api'

// ─── chain helper ─────────────────────────────────────────────────────────────

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

// ─── checkRateLimit ───────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
  it('allows the first 60 requests from the same IP', () => {
    const ip = `test-ip-${Math.random()}`
    for (let i = 0; i < 60; i++) {
      expect(checkRateLimit(ip)).toBe(true)
    }
  })

  it('blocks the 61st request', () => {
    const ip = `test-ip-${Math.random()}`
    for (let i = 0; i < 60; i++) checkRateLimit(ip)
    expect(checkRateLimit(ip)).toBe(false)
  })

  it('treats different IPs independently', () => {
    const ipA = `test-ip-a-${Math.random()}`
    const ipB = `test-ip-b-${Math.random()}`
    for (let i = 0; i < 60; i++) checkRateLimit(ipA)
    expect(checkRateLimit(ipA)).toBe(false)
    expect(checkRateLimit(ipB)).toBe(true)
  })
})

// ─── withApi ──────────────────────────────────────────────────────────────────

describe('withApi', () => {
  const validKey = 'sk_' + 'a'.repeat(64)

  function makeReq(key?: string) {
    return new Request('http://localhost/api/listings', {
      headers: key ? { authorization: `Bearer ${key}` } : {},
    })
  }

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.mockSelect.mockReturnValue(
      makeSelectChain([{ clerkUserId: 'user_123' }])
    )
  })

  it('returns 429 when rate limited', async () => {
    // Burn through 60 requests first
    const ip = '1.2.3.4'
    const req = new Request('http://localhost/api/x', {
      headers: { 'x-forwarded-for': ip },
    })
    for (let i = 0; i < 60; i++) checkRateLimit(ip)
    const res = await withApi(req, async () => new Response('ok'))
    expect(res.status).toBe(429)
  })

  it('returns 401 when no Authorization header', async () => {
    const res = await withApi(makeReq(), async () => new Response('ok'))
    expect(res.status).toBe(401)
  })

  it('returns 401 when key not found in DB', async () => {
    mocks.mockSelect.mockReturnValue(makeSelectChain([]))
    const res = await withApi(makeReq(validKey), async () => new Response('ok'))
    expect(res.status).toBe(401)
  })

  it('calls handler with userId when key is valid', async () => {
    let capturedUserId = ''
    await withApi(makeReq(validKey), async (ctx) => {
      capturedUserId = ctx.userId
      return new Response('ok')
    })
    expect(capturedUserId).toBe('user_123')
  })
})

// ─── response builders ────────────────────────────────────────────────────────

describe('ok', () => {
  it('returns 200 with data and meta', async () => {
    const res = ok([1, 2, 3], { total: 3 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ data: [1, 2, 3], meta: { total: 3 } })
  })

  it('defaults meta to empty object', async () => {
    const res = ok({ id: 1 })
    const body = await res.json()
    expect(body.meta).toEqual({})
  })

  it('includes CORS header', () => {
    const res = ok({})
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})

describe('apiError', () => {
  it('returns the given status code', () => {
    expect(apiError(401, 'Unauthorized', 'UNAUTHORIZED').status).toBe(401)
    expect(apiError(429, 'Rate limited', 'RATE_LIMITED').status).toBe(429)
    expect(apiError(404, 'Not found', 'NOT_FOUND').status).toBe(404)
  })

  it('returns error envelope', async () => {
    const res = apiError(404, 'Not found', 'NOT_FOUND')
    const body = await res.json()
    expect(body).toEqual({ error: { message: 'Not found', code: 'NOT_FOUND' } })
  })

  it('includes CORS header', () => {
    const res = apiError(401, 'x', 'X')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})

// ─── corsHeaders ──────────────────────────────────────────────────────────────

describe('corsHeaders', () => {
  it('allows all origins', () => {
    expect(corsHeaders['Access-Control-Allow-Origin']).toBe('*')
  })

  it('allows GET and OPTIONS', () => {
    expect(corsHeaders['Access-Control-Allow-Methods']).toContain('GET')
    expect(corsHeaders['Access-Control-Allow-Methods']).toContain('OPTIONS')
  })
})
