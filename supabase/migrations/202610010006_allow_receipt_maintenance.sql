begin;
-- Backend-only maintenance: remove receipt metadata before cleaning its private
-- Storage object. No browser role or application endpoint receives delete access.
grant delete on public.expense_receipts to service_role;
commit;
