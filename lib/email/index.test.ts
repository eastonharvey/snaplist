import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn() }))

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mocks.sendEmail } }
  }),
}))

import { sendNewMessageEmail } from './index'

describe('sendNewMessageEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.RESEND_API_KEY = 'test-key'
    process.env.RESEND_FROM_EMAIL = 'test@example.com'
    mocks.sendEmail.mockResolvedValue({ data: { id: 'email_123' }, error: null })
  })

  it('sends email with correct subject and recipient', async () => {
    await sendNewMessageEmail({
      toEmail: 'buyer@example.com',
      senderName: 'Alice',
      listingTitle: 'Vintage Chair',
      listingId: 42,
      messagePreview: 'Is this still available?',
    })
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'buyer@example.com',
        subject: expect.stringContaining('Vintage Chair'),
      })
    )
  })

  it('does not throw when Resend returns an error', async () => {
    mocks.sendEmail.mockResolvedValue({ data: null, error: { message: 'API error' } })
    await expect(
      sendNewMessageEmail({
        toEmail: 'buyer@example.com',
        senderName: 'Alice',
        listingTitle: 'Chair',
        listingId: 1,
        messagePreview: 'Hello',
      })
    ).resolves.not.toThrow()
  })
})
