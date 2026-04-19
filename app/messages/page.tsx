import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getThreads } from '@/app/actions/messages'

export default async function MessagesPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const threadList = await getThreads(userId)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold">Messages</h1>

      {threadList.length === 0 ? (
        <p className="text-zinc-500">No messages yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {threadList.map((thread) => {
            const isBuyer = thread.buyerClerkUserId === userId
            const role = isBuyer ? 'Buyer' : 'Seller'
            const hasUnread = thread.unreadCount > 0

            return (
              <li key={thread.id}>
                <Link
                  href={`/messages/${thread.id}`}
                  className="flex items-start justify-between gap-4 rounded-xl border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                >
                  <div className="min-w-0">
                    <p className={`truncate font-medium ${hasUnread ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-700 dark:text-zinc-300'}`}>
                      {thread.listingTitle}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-500">{role}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {hasUnread && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-900 px-1.5 text-[11px] font-medium text-white dark:bg-zinc-50 dark:text-zinc-900">
                        {thread.unreadCount > 9 ? '9+' : thread.unreadCount}
                      </span>
                    )}
                    <span className="text-xs text-zinc-400">
                      {thread.updatedAt ? new Date(thread.updatedAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
