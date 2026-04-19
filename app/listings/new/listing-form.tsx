'use client'

import { useState } from 'react'
import { createListing } from '@/app/actions/listings'
import ZipInput from '@/app/_components/zip-input'

const MAX_IMAGES = 10
const MAX_ANALYSES = 3

type Category = { id: number; name: string; slug: string }
type Step = 'upload' | 'form'

const CONDITIONS = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
] as const

const inputClass =
  'rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50'

function AiBadge() {
  return (
    <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
      ✦ AI
    </span>
  )
}

export default function ListingForm({
  categories,
  defaultZip,
}: {
  categories: Category[]
  defaultZip: string
}) {
  // ── photo state ──────────────────────────────────────────────────────────
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])

  // ── analysis state ───────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('upload')
  const [analysisCount, setAnalysisCount] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  // ── form field state (controlled, populated by AI) ───────────────────────
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [condition, setCondition] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [zip, setZip] = useState(defaultZip)
  const [aiFields, setAiFields] = useState<Set<string>>(new Set())

  // ── photo handlers ───────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? [])
    const slots = MAX_IMAGES - selectedFiles.length
    const toAdd = incoming.slice(0, slots)
    setSelectedFiles(prev => [...prev, ...toAdd])
    setPreviews(prev => [...prev, ...toAdd.map(f => URL.createObjectURL(f))])
    e.target.value = ''
  }

  function removeFile(index: number) {
    URL.revokeObjectURL(previews[index])
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    setPreviews(prev => prev.filter((_, i) => i !== index))
  }

  // ── analysis handler ─────────────────────────────────────────────────────
  async function handleAnalyze() {
    if (selectedFiles.length === 0 || analyzing || analysisCount >= MAX_ANALYSES) return

    setAnalyzing(true)
    setAnalyzeError(null)

    const fd = new FormData()
    selectedFiles.forEach(f => fd.append('images', f))
    if (zip) fd.append('zip', zip)

    const res = await fetch('/api/analyze', { method: 'POST', body: fd })
    const data = await res.json()

    setAnalysisCount(c => c + 1)
    setAnalyzing(false)

    if (data.error) {
      setAnalyzeError(data.error)
      setStep('form')
      return
    }

    const cat = categories.find(c => c.slug === data.categorySlug)
    setTitle(data.title ?? '')
    setDescription(data.description ?? '')
    setPrice(data.price ? (data.price / 100).toFixed(2) : '')
    setCondition(data.condition ?? '')
    setCategoryId(cat ? String(cat.id) : '')

    const filled = new Set(['title', 'description', 'price', 'condition'])
    if (cat) filled.add('categoryId')
    setAiFields(filled)
    setStep('form')
  }

  // ── submit handler ───────────────────────────────────────────────────────
  async function handleSubmit(formData: FormData) {
    selectedFiles.forEach(file => formData.append('images', file))
    await createListing(formData)
  }

  // ── render ────────────────────────────────────────────────────────────────
  const canAnalyze = selectedFiles.length > 0 && !analyzing && analysisCount < MAX_ANALYSES
  const analysisExhausted = analysisCount >= MAX_ANALYSES

  return (
    <div className="flex flex-col gap-6">
      {/* ── Photo upload section (always visible) ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            Photos {selectedFiles.length > 0 && `(${selectedFiles.length}/${MAX_IMAGES})`}
          </span>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">Tip</span>
          Upload 2–3 photos for the most accurate AI identification
        </p>

        {previews.length > 0 && (
          <div className={`grid gap-2 ${step === 'form' ? 'grid-cols-6' : 'grid-cols-4'}`}>
            {previews.map((url, i) => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {selectedFiles.length < MAX_IMAGES && (
          <label className="flex h-20 cursor-pointer items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-700 dark:border-zinc-700 dark:hover:border-zinc-500">
            + Add photos
            <input type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={handleFileChange} />
          </label>
        )}

        {step === 'upload' && (
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className="flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {analyzing ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Analyzing…
              </>
            ) : (
              <>✦ Analyze Photos</>
            )}
          </button>
        )}

        {step === 'form' && !analysisExhausted && (
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className="self-start text-xs text-indigo-600 underline hover:text-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-indigo-400"
          >
            ✦ Re-analyze
          </button>
        )}

        {analysisExhausted && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Maximum analysis attempts reached. Edit the fields manually.
          </p>
        )}
      </div>

      {/* ── Error / success banners ── */}
      {analyzeError && (
        <div className="flex items-center gap-2 rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
          <span>⚠️</span>
          <span>{analyzeError} Fill in the details manually.</span>
        </div>
      )}

      {step === 'form' && !analyzeError && aiFields.size > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-green-800 bg-green-950 px-4 py-3 text-sm text-green-300">
          <span>✦</span>
          <span>Item identified — review and edit the details below</span>
        </div>
      )}

      {/* ── Step 2: form fields (shown after analysis) ── */}
      {step === 'form' && (
        <form action={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-1.5 text-sm font-medium" htmlFor="title">
              Title {aiFields.has('title') && <AiBadge />}
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What are you selling?"
              className={`${inputClass} ${aiFields.has('title') ? 'border-indigo-500 dark:border-indigo-500' : ''}`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-1.5 text-sm font-medium" htmlFor="description">
              Description {aiFields.has('description') && <AiBadge />}
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={5}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the item — condition, size, colour, any defects…"
              className={`${inputClass} ${aiFields.has('description') ? 'border-indigo-500 dark:border-indigo-500' : ''}`}
            />
          </div>

          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <label className="flex items-center gap-1.5 text-sm font-medium" htmlFor="price">
                Price ($) {aiFields.has('price') && <AiBadge />}
              </label>
              <input
                id="price"
                name="price"
                type="number"
                required
                min="0"
                step="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0.00"
                className={`${inputClass} ${aiFields.has('price') ? 'border-indigo-500 dark:border-indigo-500' : ''}`}
              />
            </div>

            <div className="flex flex-1 flex-col gap-1">
              <label className="flex items-center gap-1.5 text-sm font-medium" htmlFor="condition">
                Condition {aiFields.has('condition') && <AiBadge />}
              </label>
              <select
                id="condition"
                name="condition"
                value={condition}
                onChange={e => setCondition(e.target.value)}
                className={`${inputClass} ${aiFields.has('condition') ? 'border-indigo-500 dark:border-indigo-500' : ''}`}
              >
                <option value="">— Select condition —</option>
                {CONDITIONS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <label className="flex items-center gap-1.5 text-sm font-medium" htmlFor="categoryId">
                Category {aiFields.has('categoryId') && <AiBadge />}
              </label>
              <select
                id="categoryId"
                name="categoryId"
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className={`${inputClass} ${aiFields.has('categoryId') ? 'border-indigo-500 dark:border-indigo-500' : ''}`}
              >
                <option value="">— Select a category —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-1 flex-col gap-1">
              <label className="flex items-center gap-1.5 text-sm font-medium">
                ZIP Code
                {zip && zip === defaultZip && (
                  <span className="rounded-full bg-teal-700 px-2 py-0.5 text-[10px] font-semibold text-white">
                    📍 auto
                  </span>
                )}
              </label>
              <ZipInput
                defaultValue={zip}
                onChange={setZip}
                inputClassName={`${inputClass} w-full`}
              />
            </div>
          </div>

          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Post listing
          </button>
        </form>
      )}
    </div>
  )
}
