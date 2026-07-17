// Vercel cron proxy: fires the send-reminders Supabase edge function once a
// day. The actual work (querying tomorrow's appointments, client reminder
// email/SMS, salon digest, cron_health logging) lives in
// supabase/functions/send-reminders — this file only forwards the call.
//
// History: this used to be a full duplicate implementation that called
// send-emails with `Authorization: Bearer <service key>`. send-emails only
// accepts x-internal-secret or a real USER token, so every call 401'd and no
// reminder ever went out from this path. The pg_cron path was broken too
// (missing pg_net), which is why reminders silently stopped. Both paths now
// hit the same edge function; the reminder_sent flag makes the second daily
// run a no-op.

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const r = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/send-reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      console.error('send-reminders failed:', r.status, data)
      return res.status(502).json({ error: 'edge_function_failed', detail: data })
    }
    return res.status(200).json(data)
  } catch (err) {
    console.error('send-reminders proxy error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
