import { createClient } from '@supabase/supabase-js'

// Fallbacks are the PUBLIC url + publishable key (they ship in every browser
// bundle anyway, so hardcoding them leaks nothing). Without these, a Vercel
// build that's missing the VITE_ env vars produces a bundle where
// createClient(undefined) throws during module init — the whole app dies
// before first paint (the 2026-07-20 "black screen" production outage).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://pqvovkwqkapmpibktpwb.supabase.co'
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_9a56u0YAwjJFjeQ6AGpJeg_qrzPnl0k'

// Exposed so features can build public edge-function URLs (e.g. the
// iCal calendar-feed subscription link shown in owner settings).
export const supabaseUrl = SUPABASE_URL

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
