import { describe, it, expect } from 'vitest'
import { buildPageUrl } from './pagination'

describe('buildPageUrl', () => {
  it('adds page param', () => {
    expect(buildPageUrl('/?' , 2)).toBe('/?page=2')
  })

  it('replaces existing page param', () => {
    expect(buildPageUrl('/?page=3&q=chair', 5)).toBe('/?page=5&q=chair')
  })

  it('omits page=1 (canonical first page)', () => {
    expect(buildPageUrl('/?page=3', 1)).toBe('/')
  })
})
