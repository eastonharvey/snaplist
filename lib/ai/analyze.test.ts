import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
}))

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(function () {
    return {
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: mocks.generateContent,
      }),
    }
  }),
}))

import { analyzeListing } from './analyze'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeGeminiResponse(data: object) {
  return {
    response: {
      text: () => JSON.stringify(data),
    },
  }
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('analyzeListing', () => {
  beforeEach(() => {
    mocks.generateContent.mockReset()
    process.env.GOOGLE_AI_API_KEY = 'test-key'
  })

  it('returns structured listing data from Gemini response', async () => {
    mocks.generateContent.mockResolvedValue(
      makeGeminiResponse({
        title: 'Apple MacBook Pro 13" M1',
        description: 'Excellent condition laptop.',
        price: 749,
        categorySlug: 'electronics',
        condition: 'like_new',
      })
    )

    const result = await analyzeListing(
      [{ data: 'base64imagedata', mimeType: 'image/jpeg' }],
      'Austin, TX',
      ['electronics', 'clothing', 'furniture']
    )

    expect(result).toEqual({
      title: 'Apple MacBook Pro 13" M1',
      description: 'Excellent condition laptop.',
      price: 74900,  // converted to cents
      categorySlug: 'electronics',
      condition: 'like_new',
    })
  })

  it('converts price from dollars to cents', async () => {
    mocks.generateContent.mockResolvedValue(
      makeGeminiResponse({ title: 'Item', description: 'Desc', price: 10, categorySlug: 'other', condition: 'good' })
    )
    const result = await analyzeListing([{ data: 'b64', mimeType: 'image/jpeg' }], '',['other'])
    expect(result.price).toBe(1000)
  })

  it('falls back to first category if Gemini returns unknown slug', async () => {
    mocks.generateContent.mockResolvedValue(
      makeGeminiResponse({ title: 'X', description: 'Y', price: 5, categorySlug: 'nonexistent', condition: 'fair' })
    )
    const result = await analyzeListing([{ data: 'b64', mimeType: 'image/jpeg' }], '',['electronics', 'clothing'])
    expect(result.categorySlug).toBe('electronics')
  })

  it('falls back to "good" if Gemini returns invalid condition', async () => {
    mocks.generateContent.mockResolvedValue(
      makeGeminiResponse({ title: 'X', description: 'Y', price: 5, categorySlug: 'electronics', condition: 'excellent' })
    )
    const result = await analyzeListing([{ data: 'b64', mimeType: 'image/jpeg' }], '',['electronics'])
    expect(result.condition).toBe('good')
  })

  it('throws when Gemini response is missing required fields', async () => {
    mocks.generateContent.mockResolvedValue(
      makeGeminiResponse({ title: 'Only title' })
    )
    await expect(analyzeListing([{ data: 'b64', mimeType: 'image/jpeg' }], '',['electronics'])).rejects.toThrow(
      'Could not identify item'
    )
  })
})
