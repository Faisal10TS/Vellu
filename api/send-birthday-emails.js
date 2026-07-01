// Vercel cron proxy: fires the send-birthday-emails Supabase edge function
// once a day. The actual work (querying birthdays, sending, logging) lives
// in supabase/functions/send-birthday-emails — this file only forwards the
// call so we can use Vercel Cron's scheduled trigger.

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const r = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/send-birthday-emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // The edge function accepts either the cron secret via x-cron-secret,
        // or the service-role secret as Bearer. Using the cron secret keeps
        // the service role out of a same-day incident window if the Vercel
        // env leaks.
        "x-cron-secret": process.env.CRON_SECRET,
      },
      body: JSON.stringify({}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("send-birthday-emails failed:", r.status, data);
      return res.status(502).json({ error: "edge_function_failed", detail: data });
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error("send-birthday-emails proxy error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
