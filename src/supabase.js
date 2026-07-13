import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

// Exposed so features can build public edge-function URLs (e.g. the
// iCal calendar-feed subscription link shown in owner settings).
export const supabaseUrl = SUPABASE_URL

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
