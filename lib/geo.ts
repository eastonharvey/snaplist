import zipcodes from 'zipcodes'
import { sql, SQL } from 'drizzle-orm'
import { listings } from '@/lib/db/schema'

export type ZipInfo = {
  city: string
  state: string
  lat: number
  lng: number
}

export function lookupZip(zip: string): ZipInfo | null {
  const result = zipcodes.lookup(zip)
  if (!result) return null
  return { city: result.city, state: result.state, lat: result.latitude, lng: result.longitude }
}

/** Returns the nearest US zip code for a given lat/lng coordinate pair. */
export function reverseZip(lat: number, lng: number): string | null {
  const result = zipcodes.lookupByCoords(lat, lng)
  return result?.zip ?? null
}

/**
 * Returns a Drizzle SQL condition that keeps only listings within `radiusMiles`
 * of the given coordinates, using the Haversine formula.
 * Earth radius: 3,958.8 miles.
 */
export function haversineWhere(lat: number, lng: number, radiusMiles: number): SQL {
  return sql`(
    3958.8 * acos(
      least(1.0,
        cos(radians(${lat})) * cos(radians(${listings.lat})) *
        cos(radians(${listings.lng}) - radians(${lng})) +
        sin(radians(${lat})) * sin(radians(${listings.lat}))
      )
    )
  ) <= ${radiusMiles}`
}
