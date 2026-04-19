import { describe, expect, it } from 'vitest'
import { formatPrice } from './format'

describe('formatPrice', () => {
  it('formats whole dollar amounts', () => {
    expect(formatPrice(100)).toBe('$1.00')
  })

  it('formats cents correctly', () => {
    expect(formatPrice(999)).toBe('$9.99')
  })

  it('formats zero as $0.00', () => {
    expect(formatPrice(0)).toBe('$0.00')
  })

  it('formats large amounts', () => {
    expect(formatPrice(1000000)).toBe('$10,000.00')
  })

  it('rounds to nearest cent', () => {
    expect(formatPrice(101)).toBe('$1.01')
  })
})
