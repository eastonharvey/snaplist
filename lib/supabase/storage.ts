import { createClient } from '@supabase/supabase-js'

// Server-only: uses the service role key to bypass RLS for storage uploads.
// Never import this file from a client component.
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const BUCKET = 'listing-images'
