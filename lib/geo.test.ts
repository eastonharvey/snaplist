import { describe, expect, it } from 'vitest'
import { lookupZip, reverseZip, haversineWhere } from './geo'

// ─── lookupZip ────────────────────────────────────────────────────────────────

describe('lookupZip', () => {
  it('returns city, state, lat, lng for a valid US zip', () => {
    const result = lookupZip('97201')
    expect(result).not.toBeNull()
    expect(result!.city).toBeTruthy()
    expect(result!.state).toBe('OR')
    expect(typeof result!.lat).toBe('number')
    expect(typeof result!.lng).toBe('number')
  })

  it('returns null for an unknown zip', () => {
    expect(lookupZip('00000')).toBeNull()
  })

  it('returns null for a non-numeric string', () => {
    expect(lookupZip('abcde')).toBeNull()
  })

  it('returns correct city for a well-known zip', () => {
    const result = lookupZip('10001') // New York, NY
    expect(result).not.toBeNull()
    expect(result!.state).toBe('NY')
  })

  it('lat and lng are within plausible US bounds', () => {
    const result = lookupZip('90210') // Beverly Hills, CA
    expect(result).not.toBeNull()
    expect(result!.lat).toBeGreaterThan(24)
    expect(result!.lat).toBeLessThan(50)
    expect(result!.lng).toBeGreaterThan(-130)
    expect(result!.lng).toBeLessThan(-60)
  })
})

// ─── reverseZip ───────────────────────────────────────────────────────────────

describe('reverseZip', () => {
  it('returns a zip string for valid US coordinates', () => {
    const result = reverseZip(45.52, -122.68) // Portland, OR area
    expect(typeof result).toBe('string')
    expect(result).toMatch(/^\d{5}$/)
  })

  it('returns a zip near the given coordinates', () => {
    // Beverly Hills, CA — should resolve to a CA zip
    const result = reverseZip(34.0901, -118.4065)
    expect(result).not.toBeNull()
    const info = lookupZip(result!)
    expect(info?.state).toBe('CA')
  })

  it('round-trips: lookupZip(reverseZip(lat, lng)) returns consistent coordinates', () => {
    const zip = reverseZip(40.7128, -74.006) // New York City
    expect(zip).not.toBeNull()
    const info = lookupZip(zip!)
    expect(info).not.toBeNull()
    // Resulting zip should be within ~10 degrees of original coordinates
    expect(Math.abs(info!.lat - 40.7128)).toBeLessThan(10)
    expect(Math.abs(info!.lng - (-74.006))).toBeLessThan(10)
  })
})

// ─── haversineWhere ───────────────────────────────────────────────────────────

describe('haversineWhere', () => {
  it('returns a SQL object (truthy)', () => {
    const condition = haversineWhere(45.52, -122.68, 25)
    expect(condition).toBeTruthy()
  })

  it('encodes the radius value in queryChunks', () => {
    const condition = haversineWhere(45.52, -122.68, 50)
    // Drizzle SQL: StringChunks have { value: [string] }, params are stored as raw values
    const chunks: any[] = (condition as any).queryChunks ?? []
    const params = chunks.filter(c => typeof c === 'number' || typeof c?.value === 'number')
      .map(c => typeof c === 'number' ? c : c.value)
    expect(params).toContain(50)
  })

  it('includes the earth-radius constant 3958.8 in the SQL text', () => {
    const condition = haversineWhere(40.71, -74.01, 10)
    // StringChunks store their content as { value: [string] }
    const chunks: any[] = (condition as any).queryChunks ?? []
    const sqlText = chunks
      .filter(c => Array.isArray(c?.value))
      .flatMap(c => c.value as string[])
      .join('')
    expect(sqlText).toContain('3958.8')
  })

  it('accepts edge-case coordinates (lat=0, lng=0)', () => {
    // Should not throw for unusual coordinates
    expect(() => haversineWhere(0, 0, 100)).not.toThrow()
  })
})
