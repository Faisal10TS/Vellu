// api/check-trials.js
//
// Vercel cron — runs daily. Flips subscription_status for owners whose
// trial period has ended OR whose paid period has ended after a soft-cancel.
//
// Why: access gating is already done by App.jsx checking plan_expires_at
// against now(), so an expired trial loses access automatically. But
// `subscription_status` is what the Billing tab and admin dashboard show
// the user, and it would otherwise stay "trialing" forever.
//
// Two flips:
//   1. trialing + trial_ends_at < now()  →  past_due
//      (owner needs to subscribe to regain access; access already revoked
//      because plan_expires_at = trial_ends_at)
//
//   2. active + cancel_at_period_end + plan_expires_at < now()  →  cancelled
//      (Mollie subscription was already cancelled at the time the user
//      clicked Cancel — this just tidies up the local status field once
//      the paid-up-through period passes)
//
// Idempotent: safe to run multiple times per day. Each UPDATE has a
// NOT-already-target-state filter so re-runs don't hit any rows.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
  // Same auth pattern as send-reminders.js: shared secret in CRON_SECRET env var.
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const nowIso = new Date().toISOString();
  let trialsExpired = 0;
  let cancellationsFinalised = 0;

  try {
    // 1. Trialing owners whose trial has ended → past_due
    {
      const { data, error } = await supabase
        .from('profiles')
        .update({ subscription_status: 'past_due' })
        .eq('subscription_status', 'trialing')
        .lt('trial_ends_at', nowIso)
        .select('id');
      if (error) throw error;
      trialsExpired = data?.length || 0;
    }

    // 2. Soft-cancel users whose paid period has ended → cancelled
    {
      const { data, error } = await supabase
        .from('profiles')
        .update({ subscription_status: 'cancelled' })
        .eq('subscription_status', 'active')
        .eq('cancel_at_period_end', true)
        .lt('plan_expires_at', nowIso)
        .select('id');
      if (error) throw error;
      cancellationsFinalised = data?.length || 0;
    }

    return res.status(200).json({
      success: true,
      ran_at: nowIso,
      trials_expired: trialsExpired,
      cancellations_finalised: cancellationsFinalised,
    });
  } catch (err) {
    console.error('check-trials error:', err);
    return res.status(500).json({ error: 'internal_error', message: err?.message });
  }
}
