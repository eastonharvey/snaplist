import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { hashKey } from '@/lib/apiKey'

// ─── Rate limiter (in-memory sliding window, 60 req/min per IP) ──────────────

const windows = new Map<string, number[]>()

export function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const hits = (windows.get(ip) ?? []).filter(t => now - t < 60_000)
  hits.push(now)
  windows.set(ip, hits)
  return hits.length <= 60
}

// ─── API key DB lookup ────────────────────────────────────────────────────────

async function resolveApiKey(key: string): Promise<string | null> {
  const [row] = await db
    .select({ clerkUserId: apiKeys.clerkUserId })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashKey(key)))
  return row?.clerkUserId ?? null
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

// ─── Response builders ────────────────────────────────────────────────────────

export function ok<T>(data: T, meta: Record<string, unknown> = {}): Response {
  return Response.json({ data, meta }, { headers: corsHeaders })
}

export function apiError(status: number, message: string, code: string): Response {
  return Response.json({ error: { message, code } }, { status, headers: corsHeaders })
}

// ─── Composed middleware: rate limit → auth → handler ─────────────────────────

export async function withApi(
  req: Request,
  handler: (ctx: { userId: string }) => Promise<Response>
): Promise<Response> {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  if (!checkRateLimit(ip)) return apiError(429, 'Too many requests', 'RATE_LIMITED')

  const bearer = req.headers.get('authorization')
  const key = bearer?.startsWith('Bearer ') ? bearer.slice(7) : null
  if (!key) return apiError(401, 'Invalid or missing API key', 'UNAUTHORIZED')

  const userId = await resolveApiKey(key)
  if (!userId) return apiError(401, 'Invalid or missing API key', 'UNAUTHORIZED')

  return handler({ userId })
}
