import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getMyApiKey } from '@/app/actions/apiKeys'
import { getUserSettings, updateUserSettings } from '@/app/actions/settings'
import ApiKeyDisplay from './_components/api-key-display'

export default async function SettingsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const [apiKey, settings] = await Promise.all([
    getMyApiKey(),
    getUserSettings(),
  ])

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold">Settings</h1>

      <section className="mb-10">
        <h2 className="mb-1 text-sm font-medium">Preferences</h2>
        <p className="mb-4 text-sm text-zinc-500">Update your location and notification preferences.</p>
        <form action={updateUserSettings} className="flex flex-col gap-4">
          <div>
            <label htmlFor="zip" className="mb-1 block text-sm font-medium">ZIP code</label>
            <input
              id="zip"
              name="zip"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{5}"
              maxLength={5}
              defaultValue={settings.zip ?? ''}
              placeholder="e.g. 90210"
              className="w-40 rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="notificationsEnabled"
              name="notificationsEnabled"
              type="checkbox"
              defaultChecked={settings.notificationsEnabled}
              className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
            />
            <label htmlFor="notificationsEnabled" className="text-sm">
              Email me when I receive a new message
            </label>
          </div>
          <div>
            <button
              type="submit"
              className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Save preferences
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-medium">API key</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Use this key to authenticate requests to the{' '}
          <a href="/api-docs" className="underline hover:text-zinc-900 dark:hover:text-zinc-100">
            Snaplist API
          </a>
          . Cycling your key immediately invalidates the old one.
        </p>
        <ApiKeyDisplay apiKey={apiKey} />
      </section>
    </main>
  )
}
