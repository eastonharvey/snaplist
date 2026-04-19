import { describe, it, expect } from 'vitest'
import { getPriceSuggestion } from './pricing'

describe('getPriceSuggestion', () => {
  it('returns the aiPrice passed to it', async () => {
    const result = await getPriceSuggestion('MacBook Pro', 'Austin, TX', 74900)
    expect(result).toBe(74900)
  })

  it('works with zero price', async () => {
    const result = await getPriceSuggestion('Unknown item', '', 0)
    expect(result).toBe(0)
  })
})
