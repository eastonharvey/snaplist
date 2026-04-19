'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generateApiKey } from '@/app/actions/apiKeys'

export default function ApiKeyDisplay({ apiKey }: { apiKey: string | null }) {
  const [revealed, setRevealed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleCycle() {
    startTransition(async () => {
      await generateApiKey()
      setRevealed(false)
      router.refresh()
    })
  }

  const masked = apiKey ? `${apiKey.slice(0, 7)}${'•'.repeat(20)}` : null

  return (
    <div className="flex flex-col gap-4">
      {apiKey ? (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900">
            <span className="flex-1 select-all break-all">
              {revealed ? apiKey : masked}
            </span>
            <button
              onClick={() => setRevealed(r => !r)}
              aria-label={revealed ? 'Hide API key' : 'Reveal API key'}
              className="ml-2 shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              {revealed ? (
                // Eye-off icon
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                // Eye icon
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
          <button
            onClick={handleCycle}
            disabled={isPending}
            className="self-start rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium transition-colors hover:border-zinc-500 disabled:opacity-50 dark:border-zinc-700"
          >
            {isPending ? 'Cycling…' : 'Cycle key'}
          </button>
        </>
      ) : (
        <button
          onClick={handleCycle}
          disabled={isPending}
          className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isPending ? 'Generating…' : 'Generate API key'}
        </button>
      )}
    </div>
  )
}
