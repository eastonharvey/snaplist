'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { reverseGeocodeZip } from '@/app/actions/geo'

type Category = { id: number; name: string; slug: string }

export default function SearchFilters({ categories }: { categories: Category[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const [, startTransition] = useTransition()
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  const hasGeolocation = typeof navigator !== 'undefined' && 'geolocation' in navigator

  async function handleNearMe() {
    setLocating(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const zip = await reverseGeocodeZip(pos.coords.latitude, pos.coords.longitude)
        if (zip) push({ zip })
        else setGeoError('Could not determine zip code for your location.')
        setLocating(false)
      },
      () => {
        setGeoError('Location access denied.')
        setLocating(false)
      }
    )
  }

  const push = useCallback((updates: Record<string, string>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    next.delete('page')
    startTransition(() => router.push(`/?${next.toString()}`))
  }, [params, router])

  const inputClass = 'w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50'

  return (
    <form
      className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={e => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        push({
          q:        (fd.get('q')        as string) ?? '',
          category: (fd.get('category') as string) ?? '',
          zip:      (fd.get('zip')      as string) ?? '',
          radius:   (fd.get('radius')   as string) ?? '',
          minPrice: (fd.get('minPrice') as string) ?? '',
          maxPrice: (fd.get('maxPrice') as string) ?? '',
          condition: (fd.get('condition') as string) ?? '',
        })
      }}
    >
      {/* Keyword search */}
      <input
        name="q"
        type="search"
        placeholder="Search listings…"
        defaultValue={params.get('q') ?? ''}
        className={inputClass}
      />

      {/* Category */}
      <select
        name="category"
        defaultValue={params.get('category') ?? ''}
        onChange={e => push({ category: e.target.value })}
        className={inputClass}
      >
        <option value="">All categories</option>
        {categories.map(c => (
          <option key={c.id} value={c.slug}>{c.name}</option>
        ))}
      </select>

      {/* Zip code + Near me */}
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <input
            name="zip"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{5}"
            maxLength={5}
            placeholder="Zip code"
            defaultValue={params.get('zip') ?? ''}
            className={inputClass}
          />
          {hasGeolocation && (
            <button
              type="button"
              onClick={handleNearMe}
              disabled={locating}
              title="Near me"
              className="flex-shrink-0 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-600 transition-colors hover:border-zinc-500 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
            >
              {locating ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
              )}
            </button>
          )}
        </div>
        {geoError && <p className="text-xs text-red-500 dark:text-red-400">{geoError}</p>}
      </div>

      {/* Radius — free-text number with preset suggestions */}
      <div className="flex items-center gap-2">
        <input
          name="radius"
          type="number"
          min="1"
          max="500"
          list="radius-presets"
          placeholder="Radius (mi)"
          defaultValue={params.get('radius') ?? '25'}
          className={inputClass}
        />
        <datalist id="radius-presets">
          <option value="10" />
          <option value="25" />
          <option value="50" />
          <option value="100" />
        </datalist>
        <button
          type="submit"
          className="flex-shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Search
        </button>
      </div>

      {/* Min price */}
      <input
        name="minPrice"
        type="number"
        min="0"
        step="1"
        placeholder="$ Min"
        defaultValue={params.get('minPrice') ?? ''}
        onChange={e => push({ minPrice: e.target.value })}
        aria-label="Minimum price"
        className={inputClass}
      />

      {/* Max price */}
      <input
        name="maxPrice"
        type="number"
        min="0"
        step="1"
        placeholder="$ Max"
        defaultValue={params.get('maxPrice') ?? ''}
        onChange={e => push({ maxPrice: e.target.value })}
        aria-label="Maximum price"
        className={inputClass}
      />

      {/* Condition */}
      <select
        name="condition"
        defaultValue={params.get('condition') ?? ''}
        onChange={e => push({ condition: e.target.value })}
        aria-label="Condition"
        className={inputClass}
      >
        <option value="">Any condition</option>
        <option value="new">New</option>
        <option value="like_new">Like New</option>
        <option value="good">Good</option>
        <option value="fair">Fair</option>
      </select>
    </form>
  )
}
