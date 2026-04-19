'use server'

import { reverseZip } from '@/lib/geo'

/** Reverse-geocodes browser coordinates to the nearest US zip code. */
export async function reverseGeocodeZip(lat: number, lng: number): Promise<string | null> {
  return reverseZip(lat, lng)
}
