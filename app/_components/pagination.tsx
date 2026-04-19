'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

export function buildPageUrl(currentSearch: string, targetPage: number): string {
  // Split path and query — currentSearch may be '?query', '/?query', or just a query string
  const qIdx = currentSearch.indexOf('?')
  const path = qIdx > 0 ? currentSearch.slice(0, qIdx) : (currentSearch.startsWith('?') ? '/' : currentSearch || '/')
  const queryString = qIdx >= 0 ? currentSearch.slice(qIdx + 1) : ''
  const params = new URLSearchParams(queryString)
  if (targetPage <= 1) {
    params.delete('page')
  } else {
    params.set('page', String(targetPage))
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

export default function Pagination({
  page,
  hasNextPage,
}: {
  page: number
  hasNextPage: boolean
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const base = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname

  const prevUrl = buildPageUrl(base, page - 1)
  const nextUrl = buildPageUrl(base, page + 1)

  if (page === 1 && !hasNextPage) return null

  return (
    <nav className="mt-10 flex items-center justify-center gap-4">
      {page > 1 ? (
        <Link href={prevUrl} className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm hover:border-zinc-500 dark:border-zinc-700">
          ← Prev
        </Link>
      ) : (
        <span className="rounded-full border border-zinc-200 px-4 py-1.5 text-sm text-zinc-400 dark:border-zinc-800">← Prev</span>
      )}
      <span className="text-sm text-zinc-500">Page {page}</span>
      {hasNextPage ? (
        <Link href={nextUrl} className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm hover:border-zinc-500 dark:border-zinc-700">
          Next →
        </Link>
      ) : (
        <span className="rounded-full border border-zinc-200 px-4 py-1.5 text-sm text-zinc-400 dark:border-zinc-800">Next →</span>
      )}
    </nav>
  )
}
