import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pqvovkwqkapmpibktpwb.supabase.co'
const SUPABASE_KEY = 'sb_publishable_9a56u0YAwjJFjeQ6AGpJeg_qrzPnl0k'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
