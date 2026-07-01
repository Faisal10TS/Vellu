import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  // Verify cron secret to prevent unauthorized calls
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // Get tomorrow's date
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    // Fetch appointments for tomorrow that haven't been reminded yet
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select('*, profiles:owner_id(business_name, slug, accent_color, logo_url)')
      .eq('date', tomorrowStr)
      .eq('status', 'confirmed')
      .eq('reminder_sent', false)

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Database error' })
    }

    let sent = 0
    for (const appt of appointments || []) {
      const salonName = appt.profiles?.business_name || 'Salon'
      const salonSlug = appt.profiles?.slug || ''
      const salonAccent = appt.profiles?.accent_color || ''
      const salonLogo = appt.profiles?.logo_url || ''

      // Send reminder email via existing edge function
      try {
        const emailRes = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/send-emails`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            type: 'appointment_reminder',
            booking: {
              client_name: appt.client_name,
              client_email: appt.client_email,
              service_name: appt.service_name,
              date: appt.date,
              time: appt.time,
              price: appt.service_price,
              salon_name: salonName,
              salon_slug: salonSlug,
              salon_accent: salonAccent,
              salon_logo: salonLogo
            }
          })
        })

        // Only mark as sent if email actually succeeded
        if (!emailRes.ok) {
          console.error('Email failed for appointment:', appt.id, await emailRes.text())
          continue
        }

        // SMS reminder — the edge function silently no-ops if the salon
        // isn't Professional or the client has no phone, so this is safe to
        // fire for every reminder. Run after the email so a Twilio hiccup
        // never blocks the actual email reminder.
        if (appt.client_phone) {
          try {
            await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/send-sms`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
              },
              body: JSON.stringify({
                type: 'appointment_reminder',
                booking: {
                  client_name: appt.client_name,
                  client_phone: appt.client_phone,
                  service_name: appt.service_name,
                  date: appt.date,
                  time: appt.time,
                  price: appt.service_price,
                  salon_name: salonName,
                  owner_id: appt.owner_id
                }
              })
            })
          } catch (smsErr) {
            console.error('SMS reminder error for appointment:', appt.id, smsErr)
          }
        }

        // Mark reminder as sent
        await supabase
          .from('appointments')
          .update({ reminder_sent: true })
          .eq('id', appt.id)

        sent++
      } catch (emailErr) {
        console.error('Email error for appointment:', appt.id, emailErr)
      }
    }

    return res.status(200).json({
      success: true,
      date: tomorrowStr,
      reminders_sent: sent,
      total_found: (appointments || []).length
    })
  } catch (err) {
    console.error('Cron error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
