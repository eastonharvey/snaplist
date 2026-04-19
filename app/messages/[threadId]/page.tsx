import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getThreadWithMessages, markThreadRead, sendMessage } from '@/app/actions/messages'

type Params = Promise<{ threadId: string }>

export default async function ThreadPage({ params }: { params: Params }) {
  const { threadId: threadIdStr } = await params
  const threadId = parseInt(threadIdStr, 10)
  if (isNaN(threadId)) notFound()

  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const data = await getThreadWithMessages(threadId, userId)
  if (!data) notFound()

  const { thread, messages } = data

  // Mark unread messages as read now that the user is viewing
  await markThreadRead(threadId, userId)

  const otherParty = userId === thread.buyerClerkUserId ? 'Seller' : 'Buyer'

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-4 py-12">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link href="/messages" className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          ← Messages
        </Link>
        <span className="text-zinc-300 dark:text-zinc-600">/</span>
        <div className="min-w-0">
          <Link
            href={`/listings/${thread.listingId}`}
            className="truncate font-medium hover:underline"
          >
            {thread.listingTitle}
          </Link>
          <span className="ml-2 text-sm text-zinc-500">({otherParty})</span>
        </div>
      </div>

      {/* Message list */}
      <div className="flex flex-col gap-3">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500">No messages yet.</p>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderClerkUserId === userId
            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                    isMine
                      ? 'rounded-br-sm bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
                      : 'rounded-bl-sm bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.body}</p>
                  <p className={`mt-1 text-[11px] ${isMine ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-400'}`}>
                    {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Reply form */}
      <form action={sendMessage} className="mt-6 flex gap-2 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <input type="hidden" name="threadId" value={threadId} />
        <textarea
          name="body"
          required
          rows={2}
          placeholder="Write a reply…"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          className="self-end rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Send
        </button>
      </form>
    </main>
  )
}
