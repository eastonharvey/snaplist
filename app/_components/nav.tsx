import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import { getUnreadCount } from '@/app/actions/messages'

export async function Nav() {
  const { userId } = await auth()
  const unreadCount = userId ? await getUnreadCount(userId) : 0

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Snaplist
        </Link>
        <div className="flex items-center gap-3">
          {userId && (
            <>
              <Link
                href="/dashboard"
                className="text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                My listings
              </Link>
              <Link
                href="/messages"
                className="relative text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Messages
                {unreadCount > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-medium text-white dark:bg-zinc-50 dark:text-zinc-900">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>
              <Link
                href="/settings"
                className="text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Settings
              </Link>
            </>
          )}
          <Link
            href="/listings/new"
            className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Post a listing
          </Link>
          <UserButton />
        </div>
      </div>
    </header>
  )
}
