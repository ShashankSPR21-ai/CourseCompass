import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

console.log('Supabase URL loaded:', Boolean(supabaseUrl))
console.log('Supabase key loaded:', Boolean(supabaseKey))

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase environment variables. Check .env.local in your project root.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)