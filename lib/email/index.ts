import { Resend } from 'resend'

interface NewMessageEmailOptions {
  toEmail: string
  senderName: string
  listingTitle: string
  listingId: number
  messagePreview: string
}

export async function sendNewMessageEmail(opts: NewMessageEmailOptions): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY!)
  const from = process.env.RESEND_FROM_EMAIL ?? 'notifications@snaplist.app'

  const { error } = await resend.emails.send({
    from,
    to: opts.toEmail,
    subject: `New message about "${opts.listingTitle}"`,
    html: `
      <p><strong>${opts.senderName}</strong> sent you a message about <strong>${opts.listingTitle}</strong>:</p>
      <blockquote style="border-left:3px solid #ccc;padding-left:1em;color:#555">${opts.messagePreview}</blockquote>
      <p><a href="${process.env.NEXT_PUBLIC_BASE_URL}/messages">View conversation →</a></p>
    `,
  })

  if (error) {
    console.error('[email] Failed to send new message notification:', error)
  }
}
