'use client'

import { useRef, useState } from 'react'
import { updateListing } from '@/app/actions/listings'
import ZipInput from '@/app/_components/zip-input'

const MAX_IMAGES = 10

type Category = { id: number; name: string }
type ExistingImage = { id: number; url: string }
type Listing = {
  id: number
  title: string
  description: string
  price: number  // dollars (already converted by server page)
  zip: string | null
  categoryId: number | null
  condition: string | null
}

export default function EditForm({
  listing,
  categories,
  existingImages,
}: {
  listing: Listing
  categories: Category[]
  existingImages: ExistingImage[]
}) {
  const [removedIds, setRemovedIds] = useState<number[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [newPreviews, setNewPreviews] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const visibleExisting = existingImages.filter(img => !removedIds.includes(img.id))
  const totalImages = visibleExisting.length + newFiles.length

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? [])
    const toAdd = incoming.slice(0, MAX_IMAGES - totalImages)
    setNewFiles(prev => [...prev, ...toAdd])
    setNewPreviews(prev => [...prev, ...toAdd.map(f => URL.createObjectURL(f))])
    e.target.value = ''
  }

  function removeNew(index: number) {
    URL.revokeObjectURL(newPreviews[index])
    setNewFiles(prev => prev.filter((_, i) => i !== index))
    setNewPreviews(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(formData: FormData) {
    removedIds.forEach(id => formData.append('deleteImageId', String(id)))
    newFiles.forEach(file => formData.append('images', file))
    await updateListing(formData)
  }

  const inputClass = 'rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50'

  return (
    <form action={handleSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="listingId" value={listing.id} />

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="title">Title</label>
        <input id="title" name="title" type="text" required defaultValue={listing.title} className={inputClass} />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="description">Description</label>
        <textarea id="description" name="description" required rows={5} defaultValue={listing.description} className={inputClass} />
      </div>

      <div className="flex gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="price">Price ($)</label>
          <input id="price" name="price" type="number" required min="0" step="0.01" defaultValue={listing.price} className={inputClass} />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="zip">Zip Code</label>
          <ZipInput defaultValue={listing.zip ?? ''} inputClassName={`${inputClass} w-full`} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="condition">Condition</label>
        <select id="condition" name="condition" defaultValue={listing.condition ?? ''} className={inputClass}>
          <option value="">— Select condition —</option>
          <option value="new">New</option>
          <option value="like_new">Like New</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="categoryId">Category</label>
        <select id="categoryId" name="categoryId" defaultValue={listing.categoryId ?? ''} className={inputClass}>
          <option value="">— Select a category —</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          Photos {totalImages > 0 && `(${totalImages}/${MAX_IMAGES})`}
        </span>

        {(visibleExisting.length > 0 || newPreviews.length > 0) && (
          <div className="grid grid-cols-4 gap-2">
            {visibleExisting.map(img => (
              <div key={img.id} className="relative aspect-square overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setRemovedIds(prev => [...prev, img.id])}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
                >
                  ×
                </button>
              </div>
            ))}
            {newPreviews.map((url, i) => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeNew(i)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {totalImages < MAX_IMAGES && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-20 items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-700 dark:border-zinc-700"
          >
            + Add photos
          </button>
        )}

        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
      </div>

      <button
        type="submit"
        className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Save changes
      </button>
    </form>
  )
}
