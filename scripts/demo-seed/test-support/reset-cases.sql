insert into auth.users(id, email) values ('00000000-0000-4000-8000-000000000101', 'demo@gmail.com');
insert into public.customers(name, customer_type, phone) values ('Dirty example', 'business', '+1 202-555-0199');
insert into public.owner_saved_signatures(user_id, id, storage_path, signature_sha256)
values ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102',
        '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000102.json', repeat('A', 64));

create function pg_temp.fixture() returns jsonb language sql immutable as $fixture$
    select $seed$__FIXTURE__$seed$::jsonb
$fixture$;
create function pg_temp.empty_seed() returns jsonb language sql immutable as $$
    select $seed$__EMPTY__$seed$::jsonb
$$;

do $$
declare role_name text;
begin
    foreach role_name in array array['anon','authenticated'] loop
        execute format('set local role %I', role_name);
        begin
            perform public.reset_demo_data(array['demo@gmail.com'], pg_temp.empty_seed());
            raise exception 'Expected permission denied';
        exception when insufficient_privilege then
            assert sqlerrm = 'permission denied for function reset_demo_data';
        end;
        reset role;
    end loop;
    assert (select count(*) from public.customers) = 1;
    assert (select count(*) from public.owner_saved_signatures) = 1;
    assert not has_table_privilege('service_role', 'public.owner_saved_signatures', 'DELETE');
    assert not has_table_privilege('anon', 'public.demo_reset_runs', 'SELECT');
    assert not has_table_privilege('authenticated', 'public.demo_reset_runs', 'SELECT');
end;
$$;

do $$
declare extra_email text;
begin
    foreach extra_email in array array['other@example.test', E' \t ', null]::text[] loop
        -- Insert the profile with a valid email, then alter only the Auth stub.
        insert into auth.users(id, email)
        values ('00000000-0000-4000-8000-000000000103', 'other@example.test');
        update auth.users set email = extra_email where id = '00000000-0000-4000-8000-000000000103';
        set local role service_role;
        begin
            perform public.reset_demo_data(array['demo@gmail.com'], pg_temp.empty_seed());
            raise exception 'Expected Auth gate to reject the reset';
        exception when raise_exception then
            assert sqlerrm = 'Demo reset blocked by a missing or unlisted Auth email';
        end;
        reset role;
        assert (select count(*) from public.customers where name = 'Dirty example') = 1;
        assert (select count(*) from public.owner_saved_signatures) = 1;
        assert (select count(*) from public.activity_logs) = 1;
        assert (select count(*) from public.demo_reset_runs) = 0;
        delete from auth.users where id = '00000000-0000-4000-8000-000000000103';
    end loop;
end;
$$;

do $$
begin
    update auth.users set email = 'alternate@example.test';
    set local role service_role;
    begin
        perform public.reset_demo_data(array['alternate@example.test', 'demo@gmail.com'], pg_temp.empty_seed());
        raise exception 'Expected missing demo account to block reset';
    exception when raise_exception then
        assert sqlerrm = 'Demo reset requires the demo Auth account';
    end;
    begin
        perform public.reset_demo_data(array[]::text[], pg_temp.empty_seed());
        raise exception 'Expected empty allow-list to block reset';
    exception when raise_exception then
        assert sqlerrm = 'Demo reset requires a nonempty email allow-list';
    end;
    reset role;
    assert (select count(*) from public.customers where name = 'Dirty example') = 1;
    update auth.users set email = 'demo@gmail.com';
end;
$$;

do $$
begin
    set local role service_role;
    begin
        perform public.reset_demo_data(array['demo@gmail.com'],
            jsonb_set(pg_temp.fixture(), '{jobs,0,customer_id}', '"00000000-0000-4000-8000-000000000999"'), '2026-11-20');
        raise exception 'Expected invalid seed FK to fail';
    exception when foreign_key_violation then
        null;
    end;
    reset role;
    assert (select count(*) from public.customers where name = 'Dirty example') = 1;
    assert (select count(*) from public.owner_saved_signatures) = 1;
    assert (select count(*) from public.demo_reset_runs) = 0;
    assert (select count(*) from pg_trigger where tgname like '%_record_activity' and tgenabled = 'O') = 7;
end;
$$;

create function pg_temp.business_snapshot() returns jsonb language sql as $$
    select jsonb_build_array(
        (select jsonb_agg(to_jsonb(t) order by id) from public.teams t),
        (select jsonb_agg(to_jsonb(t) order by id) from public.employees t),
        (select jsonb_agg(to_jsonb(t) order by id) from public.customers t),
        (select jsonb_agg(to_jsonb(t) order by id) from public.quotes t),
        (select jsonb_agg(to_jsonb(t) order by id) from public.quote_items t),
        (select jsonb_agg(to_jsonb(t) order by id) from public.jobs t),
        (select jsonb_agg(to_jsonb(t) order by id) from public.invoices t),
        (select jsonb_agg(to_jsonb(t) order by id) from public.expenses t)
    )
$$;

set role service_role;
select public.reset_demo_data(array[E'\tDEMO@GMAIL.COM ', 'unused@example.test'], pg_temp.fixture(), '2026-11-20', 'local-test');
reset role;

create temporary table first_reset as select pg_temp.business_snapshot() as snapshot;

set role service_role;
select public.reset_demo_data(array['demo@gmail.com'], pg_temp.fixture(), '2026-11-20', 'local-test');
reset role;

do $$
begin
    assert (select snapshot from first_reset) = pg_temp.business_snapshot();
    assert (select count(*) from public.customers where name = 'Example Ice Lab') = 1;
    assert (select count(*) from public.customers) = 1;
    assert (select count(*) from public.owner_saved_signatures) = 0;
    assert (select count(*) from public.activity_logs) = 0;
    assert (select count(*) from public.demo_reset_runs where result = 'success' and business_date = '2026-11-20') = 2;
    assert (select count(*) from auth.users where email = 'demo@gmail.com') = 1;
    assert (select count(*) from auth.users) = 1;
    assert (select count(*) from public.user_profiles where email = 'demo@gmail.com' and role = 'owner'
        and employee_id = '00000000-0000-4000-8000-000000000002') = 1;
    assert (select service_date from public.jobs where status = 'scheduled') = '2026-11-20';
    assert (select service_date from public.jobs where status = 'completed') = '2026-11-01';
    assert (select due_date from public.invoices where status = 'unpaid') = '2026-11-23';
    assert (select due_date from public.invoices where status = 'overdue') = '2026-11-15';
    assert (select count(*) from public.quotes where valid_until = '2026-11-30') = 3;
    assert (select expense_date from public.expenses) = '2026-11-03';
    assert (select count(*) from pg_trigger where tgname like '%_record_activity' and tgenabled = 'O') = 7;
end;
$$;

set role service_role;
select public.reset_demo_data(array['demo@gmail.com'], pg_temp.empty_seed());
reset role;

do $$
begin
    assert pg_temp.business_snapshot() = '[null,null,null,null,null,null,null,null]'::jsonb;
    assert (select count(*) from public.demo_reset_runs) = 3;
    assert (select count(*) from public.demo_reset_runs where source = 'manual' and
        business_date = (current_timestamp at time zone 'Asia/Kuala_Lumpur')::date) = 1;
    assert (select count(*) from auth.users) = 1;
    assert (select count(*) from public.user_profiles where employee_id is null) = 1;
    insert into public.customers(name, customer_type, phone) values ('After reset', 'business', '+1 202-555-0198');
    assert (select min(id) from public.activity_logs) = 1;
end;
$$;

create function pg_temp.golden_seed() returns jsonb language sql immutable as $$
    select $seed$__GOLDEN__$seed$::jsonb
$$;

set role service_role;
select public.reset_demo_data(array['demo@gmail.com'], pg_temp.golden_seed(), '2026-11-20', 'golden-test');
reset role;

create temporary table golden_first_reset as select pg_temp.business_snapshot() as snapshot;

set role service_role;
select public.reset_demo_data(array['demo@gmail.com'], pg_temp.golden_seed(), '2026-11-20', 'golden-test');
reset role;

do $$
declare
    mapping record;
    actual_count bigint;
begin
    for mapping in select * from (values
        ('teams', 'teams'), ('employees', 'employees'), ('customers', 'customers'),
        ('quotes', 'quotes'), ('quoteItems', 'quote_items'), ('jobs', 'jobs'),
        ('invoices', 'invoices'), ('expenses', 'expenses')
    ) as tables(seed_key, table_name) loop
        execute format('select count(*) from public.%I', mapping.table_name) into actual_count;
        assert actual_count > 0;
        assert actual_count = jsonb_array_length(pg_temp.golden_seed() -> mapping.seed_key);
    end loop;
    assert (select snapshot from golden_first_reset) = pg_temp.business_snapshot();
    assert (select count(*) from auth.users where email = 'demo@gmail.com') = 1;
    assert (select count(*) from auth.users) = 1;
    assert (select count(*) from public.user_profiles where email = 'demo@gmail.com' and role = 'owner') = 1;
    assert (select count(*) from public.demo_reset_runs where source = 'golden-test') = 2;
    assert (select count(*) from public.owner_saved_signatures) = 0;
    assert (select count(*) from public.activity_logs) = 0;
end;
$$;
