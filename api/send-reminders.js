import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://pqvovkwqkapmpibktpwb.supabase.co',
  'sb_publishable_9a56u0YAwjJFjeQ6AGpJeg_qrzPnl0k'
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
      .select('*, profiles:owner_id(business_name, slug)')
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

      // Send reminder email via existing edge function
      try {
        await fetch('https://pqvovkwqkapmpibktpwb.supabase.co/functions/v1/send-emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer sb_publishable_9a56u0YAwjJFjeQ6AGpJeg_qrzPnl0k'
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
              salon_slug: salonSlug
            }
          })
        })

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
