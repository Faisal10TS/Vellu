-- Staff members with their own login send invoices under their own details
-- (staff_members.address/kvk/btw/iban). Give them their own payment-request
-- fields too, so each worker's pay block routes to their own account.
alter table public.staff_members add column if not exists payment_link text;
alter table public.staff_members add column if not exists iban_holder text;