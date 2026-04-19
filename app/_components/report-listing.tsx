'use client'

import { useState } from 'react'
import { reportListing } from '@/app/actions/reports'

export default function ReportListing({ listingId }: { listingId: number }) {
  const [open, setOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  if (submitted) {
    return (
      <p className="text-sm text-zinc-500">Thank you for your report. We will review it shortly.</p>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        Report listing
      </button>
    )
  }

  async function handleSubmit(formData: FormData) {
    await reportListing(formData)
    setSubmitted(true)
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="listingId" value={listingId} />
      <div>
        <label htmlFor="report-reason" className="mb-1 block text-sm font-medium">Reason</label>
        <select
          id="report-reason"
          name="reason"
          required
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">Select a reason</option>
          <option value="spam">Spam or duplicate</option>
          <option value="prohibited">Prohibited item</option>
          <option value="misleading">Misleading information</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label htmlFor="report-details" className="mb-1 block text-sm">Additional details (optional)</label>
        <textarea
          id="report-details"
          name="details"
          rows={2}
          placeholder="Describe the issue..."
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Submit report
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm transition-colors hover:border-zinc-500 dark:border-zinc-700"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
