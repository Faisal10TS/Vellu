-- Supabase grants EXECUTE on public functions to anon/authenticated via default
-- privileges, so `revoke from public` isn't enough. Remove those explicitly so
-- only the edge function (service_role) can bump the counter — prevents anyone
-- from maxing out the daily cap directly via /rest/v1/rpc and DoS-ing the chat.
revoke execute on function public.bump_public_chat_usage() from anon, authenticated;