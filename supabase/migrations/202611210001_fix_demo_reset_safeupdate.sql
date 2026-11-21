-- Explicit whole-table deletes are intentional after the demo Auth gate.
-- Compatible with API sessions that load pg-safeupdate; keep the guard enabled.
begin;

create or replace function public.reset_demo_data(
    p_allowed_emails text[],
    p_seed jsonb,
    p_business_date date default null,
    p_source text default 'manual'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    business_day date := coalesce(p_business_date, (current_timestamp at time zone 'Asia/Kuala_Lumpur')::date);
    seed_timestamp timestamptz := business_day::timestamp at time zone 'Asia/Kuala_Lumpur';
    defaults jsonb := jsonb_build_object('created_at', seed_timestamp, 'updated_at', seed_timestamp);
    allowed_emails text[];
    activity_tables constant text[] := array['customers', 'jobs', 'invoices', 'quotes', 'expenses', 'teams', 'employees'];
    seed_keys constant text[] := array['teams', 'employees', 'customers', 'quotes', 'quoteItems', 'jobs', 'invoices', 'expenses'];
    table_name text;
    seed_key text;
    link record;
    counts jsonb := '{}'::jsonb;
begin
    select array_agg(distinct lower(regexp_replace(email, '^\s+|\s+$', '', 'g')))
    into allowed_emails
    from unnest(p_allowed_emails) as e(email)
    where email is not null and email !~ '^\s*$';

    if allowed_emails is null then
        raise exception 'Demo reset requires a nonempty email allow-list';
    end if;

    -- Serialize resets and keep Auth membership stable through the wipe.
    perform pg_advisory_xact_lock(20261120, 1);
    lock table auth.users in share mode;
    if exists (
        select 1 from auth.users
        where email is null or not (lower(regexp_replace(email, '^\s+|\s+$', '', 'g')) = any (allowed_emails))
    ) then
        raise exception 'Demo reset blocked by a missing or unlisted Auth email';
    end if;
    if not exists (
        select 1 from auth.users where lower(regexp_replace(email, '^\s+|\s+$', '', 'g')) = 'demo@gmail.com'
    ) then
        raise exception 'Demo reset requires the demo Auth account';
    end if;

    if jsonb_typeof(p_seed) is distinct from 'object' or p_seed->'version' is distinct from '1'::jsonb then
        raise exception 'Demo seed must be a version 1 object';
    end if;
    foreach seed_key in array seed_keys loop
        if jsonb_typeof(p_seed->seed_key) is distinct from 'array' then
            raise exception 'Demo seed field % must be an array', seed_key;
        end if;
        if exists (select 1 from jsonb_array_elements(p_seed->seed_key) as r(row)
                   where jsonb_typeof(r.row->'id') is distinct from 'string') then
            raise exception 'Demo seed field % requires fixed row IDs', seed_key;
        end if;
        counts := counts || jsonb_build_object(seed_key, jsonb_array_length(p_seed->seed_key));
    end loop;
    if jsonb_typeof(coalesce(p_seed->'userProfileLinks', '{}'::jsonb)) <> 'object' then
        raise exception 'Demo seed userProfileLinks must be an object';
    end if;

    -- ALTER TABLE is transactional, so an error restores the triggers and the data.
    foreach table_name in array activity_tables loop
        execute format('alter table public.%I disable trigger %I', table_name, table_name || '_record_activity');
    end loop;

    delete from public.reference_documents where true;
    delete from public.document_archives where true;
    delete from public.customer_returned_documents where true;
    delete from public.job_po_documents where true;
    delete from public.job_photos where true;
    delete from public.expense_receipts where true;
    delete from public.signed_documents where true;
    delete from public.owner_saved_signatures where true;
    delete from public.invoices where true;
    delete from public.jobs where true;
    delete from public.quotes where true;
    delete from public.expenses where true;
    delete from public.customers where true;
    update public.user_profiles set employee_id = null where employee_id is not null;
    delete from public.employees where true;
    delete from public.teams where true;
    truncate public.activity_logs restart identity;

    insert into public.teams
    select (jsonb_populate_record(null::public.teams, defaults || '{"is_active":true}' || row)).*
    from jsonb_array_elements(p_seed->'teams') as r(row);

    insert into public.employees
    select (jsonb_populate_record(null::public.employees, defaults || '{"is_active":true,"role":"技术员"}' || row)).*
    from jsonb_array_elements(p_seed->'employees') as r(row);

    insert into public.customers
    select (jsonb_populate_record(null::public.customers, defaults || row)).*
    from jsonb_array_elements(p_seed->'customers') as r(row);

    insert into public.quotes
    select (jsonb_populate_record(null::public.quotes, defaults || '{"status":"draft"}' || row)).*
    from jsonb_array_elements(p_seed->'quotes') as r(row);

    insert into public.quote_items
    select (jsonb_populate_record(null::public.quote_items, row)).*
    from jsonb_array_elements(p_seed->'quoteItems') as r(row);

    insert into public.jobs
    select (jsonb_populate_record(null::public.jobs, defaults || '{"team":"未安排","status":"pending"}' || row)).*
    from jsonb_array_elements(p_seed->'jobs') as r(row);

    insert into public.invoices
    select (jsonb_populate_record(null::public.invoices, defaults || '{"status":"unpaid","items":[],"discount":0}' || row)).*
    from jsonb_array_elements(p_seed->'invoices') as r(row);

    insert into public.expenses
    select (jsonb_populate_record(null::public.expenses, defaults || '{"status":"pending"}' || row)).*
    from jsonb_array_elements(p_seed->'expenses') as r(row);

    for link in select * from jsonb_each_text(coalesce(p_seed->'userProfileLinks', '{}'::jsonb)) loop
        if link.value is null then
            raise exception 'Demo seed profile links require an employee ID';
        end if;
        update public.user_profiles
        set employee_id = link.value::uuid
        where lower(regexp_replace(email, '^\s+|\s+$', '', 'g')) = link.key;
        if not found then
            raise exception 'Demo seed profile link has no matching profile';
        end if;
    end loop;

    foreach table_name in array activity_tables loop
        execute format('alter table public.%I enable trigger %I', table_name, table_name || '_record_activity');
    end loop;

    insert into public.demo_reset_runs(business_date, source, allowed_email_count, result, details)
    values (business_day, p_source, cardinality(allowed_emails), 'success', jsonb_build_object('counts', counts));

    return jsonb_build_object('business_date', business_day, 'counts', counts, 'result', 'success');
end;
$$;

revoke all on function public.reset_demo_data(text[], jsonb, date, text) from public, anon, authenticated;
grant execute on function public.reset_demo_data(text[], jsonb, date, text) to service_role;

commit;
