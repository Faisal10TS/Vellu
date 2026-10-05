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

// ─── TEAMLID-UITNODIGING (R-02) ──────────────────────────────
// De eigenaar mailt een stylist een link: vellu.cc/owner?invite=<token>. Het
// token bewijst dat de stylist die mailbox leest. Vroeger koppelde de app een
// teamlid-rij op e-mailadres alleen (bij aanmelden en bij inloggen), en
// aanmelden wordt automatisch bevestigd: wie het adres kende, kon de plek
// innemen. /owner bewaart het token in sessionStorage zodat het de stap
// aanmelden/inloggen overleeft; de koppeling zelf doet de database
// (rpc claim_staff_invite, alleen met een geldig, niet verlopen token).
const STAFF_INVITE_KEY = 'vellu_staff_invite'
const INVITE_RE = /^[0-9a-f]{64}$/i

// Leest ?invite= één keer uit de adresbalk, bewaart het token en haalt het
// daarna uit de URL (niet in de browsergeschiedenis, niet in een gedeelde
// link). Een kapot token wordt genegeerd.
export function rememberStaffInviteFromUrl() {
  try {
    const u = new URL(window.location.href)
    if (!u.searchParams.has('invite')) return
    const tok = (u.searchParams.get('invite') || '').trim()
    if (INVITE_RE.test(tok)) sessionStorage.setItem(STAFF_INVITE_KEY, tok)
    u.searchParams.delete('invite')
    window.history.replaceState(window.history.state, '', u)
  } catch { /* private mode: dan geen uitnodiging onthouden */ }
}

export function readStaffInvite() {
  try {
    const tok = sessionStorage.getItem(STAFF_INVITE_KEY) || ''
    return INVITE_RE.test(tok) ? tok : ''
  } catch { return '' }
}

export function clearStaffInvite() {
  try { sessionStorage.removeItem(STAFF_INVITE_KEY) } catch { /* niets te wissen */ }
}

// Eén claim per token tegelijk. Na het aanmelden lopen twee paden bijna
// gelijk op (het aanmeldformulier zelf en de sessie-check van /owner die op
// SIGNED_IN reageert); twee losse rpc-aanroepen zouden elkaar in de weg
// zitten: de tweede krijgt "al gebruikt" terwijl de eerste net slaagde.
// Uitkomst: 'claimed' | 'invalid_or_expired' | 'has_salon' | 'failed'.
// Bij 'failed' (netwerk, geen sessie) blijft het token staan voor een
// volgende poging; bij de andere drie is het token op.
let inviteClaim = null
export function claimStaffInvite(token) {
  if (!token) return Promise.resolve('failed')
  if (inviteClaim && inviteClaim.token === token) return inviteClaim.promise
  const promise = Promise.resolve(supabase.rpc('claim_staff_invite', { p_token: token }))
    .then(({ data, error }) => {
      if (!error && data && data.success === true) { clearStaffInvite(); return 'claimed' }
      const code = data && data.error
      if (code === 'invalid_or_expired' || code === 'has_salon') { clearStaffInvite(); return code }
      inviteClaim = null
      return 'failed'
    }, () => { inviteClaim = null; return 'failed' })
  inviteClaim = { token, promise }
  return promise
}
