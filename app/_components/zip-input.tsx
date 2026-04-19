'use client'

import { useState } from 'react'
import { reverseGeocodeZip } from '@/app/actions/geo'

type Props = {
  defaultValue?: string
  inputClassName: string
  onChange?: (zip: string) => void
}

export default function ZipInput({ defaultValue = '', inputClassName, onChange }: Props) {
  const [zip, setZip] = useState(defaultValue)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  const hasGeolocation = typeof navigator !== 'undefined' && 'geolocation' in navigator

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setZip(e.target.value)
    onChange?.(e.target.value)
  }

  async function handleUseLocation() {
    setLocating(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const result = await reverseGeocodeZip(pos.coords.latitude, pos.coords.longitude)
        if (result) {
          setZip(result)
          onChange?.(result)
        } else {
          setGeoError('Could not determine zip code for your location.')
        }
        setLocating(false)
      },
      () => {
        setGeoError('Location access denied.')
        setLocating(false)
      }
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          id="zip"
          name="zip"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{5}"
          maxLength={5}
          placeholder="e.g. 97201"
          value={zip}
          onChange={handleChange}
          className={inputClassName}
        />
        {hasGeolocation && (
          <button
            type="button"
            onClick={handleUseLocation}
            disabled={locating}
            title="Use my location"
            className="flex-shrink-0 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-600 transition-colors hover:border-zinc-500 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
          >
            {locating ? (
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Locating…
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
                Use my location
              </span>
            )}
          </button>
        )}
      </div>
      {geoError && (
        <p className="text-xs text-red-500 dark:text-red-400">{geoError}</p>
      )}
    </div>
  )
}
