-- pg_net was missing entirely, so every pg_cron job using net.http_post
-- (send-reminders, send-followups, send-rebook-nudge, cron-watchdog,
-- db-backup) has failed daily with 'schema "net" does not exist' since
-- ~April. Installing it restores all five schedules.
create extension if not exists pg_net;