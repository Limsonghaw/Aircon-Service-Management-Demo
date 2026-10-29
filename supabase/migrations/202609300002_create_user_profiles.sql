create table public.user_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    display_name text not null,
    role text not null default 'employee',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint user_profiles_email_length check (char_length(email) between 3 and 320),
    constraint user_profiles_display_name_length check (char_length(btrim(display_name)) between 1 and 200),
    constraint user_profiles_role_values check (role in ('owner', 'admin', 'employee'))
);

create trigger user_profiles_set_updated_at before update on public.user_profiles
for each row execute function public.set_updated_at();

create function public.create_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.email is null then return new; end if;
    insert into public.user_profiles (id, email, display_name, role)
    values (
        new.id,
        new.email,
        coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
        case when exists (select 1 from public.user_profiles where role = 'owner')
            then 'employee' else 'owner' end);
    return new;
end;
$$;

create trigger auth_user_created_profile
after insert on auth.users
for each row execute function public.create_user_profile();

with existing_users as (
    select id, email, raw_user_meta_data,
        row_number() over (order by created_at, id) as account_order
    from auth.users
    where email is not null
)
insert into public.user_profiles (id, email, display_name, role)
select id, email,
    coalesce(nullif(btrim(raw_user_meta_data ->> 'display_name'), ''), split_part(email, '@', 1)),
    case when account_order = 1 then 'owner' else 'employee' end
from existing_users
on conflict (id) do nothing;

create function public.change_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
    current_role text;
begin
    if p_role not in ('owner', 'admin', 'employee') then
        raise exception 'Invalid role' using errcode = '23514';
    end if;

    select role into current_role from public.user_profiles where id = p_user_id for update;
    if current_role is null then return; end if;
    if current_role = 'owner' and p_role <> 'owner'
        and (select count(*) from public.user_profiles where role = 'owner') <= 1 then
        raise exception 'At least one owner is required' using errcode = '23514';
    end if;

    update public.user_profiles set role = p_role where id = p_user_id;
end;
$$;

alter table public.user_profiles enable row level security;
revoke all on function public.create_user_profile() from public, anon, authenticated;
revoke all on function public.change_user_role(uuid,text) from public, anon, authenticated;
grant execute on function public.change_user_role(uuid,text) to service_role;
grant select, insert, update on table public.user_profiles to service_role;

comment on table public.user_profiles is
    'Application display names and authorization roles for Supabase Auth users.';

-- Upgrade the activity trigger created by the preceding migration so requests
-- authenticated by the backend retain their user identity in the audit trail.
create or replace function public.record_activity_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    new_data jsonb := to_jsonb(new);
    old_data jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
    request_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
    request_actor_id uuid;
    request_actor_name text;
    log_action text;
    log_entity_type text;
    log_label text;
    old_status text;
    current_status text;
    log_details jsonb := '{}'::jsonb;
begin
    request_actor_id := nullif(request_headers ->> 'x-actor-user-id', '')::uuid;
    request_actor_name := coalesce(nullif(btrim(request_headers ->> 'x-actor-name'), ''), '系统');

    log_entity_type := case tg_table_name
        when 'customers' then 'customer'
        when 'jobs' then 'job'
        when 'invoices' then 'invoice'
        when 'quotes' then 'quote'
        when 'expenses' then 'expense'
        when 'teams' then 'team'
        when 'employees' then 'employee'
    end;

    log_label := coalesce(
        new_data ->> 'invoice_number', new_data ->> 'quote_number',
        new_data ->> 'job_number', new_data ->> 'expense_number',
        new_data ->> 'name', new_data ->> 'title', new_data ->> 'id');

    if tg_op = 'INSERT' then
        if tg_table_name in ('invoices', 'jobs') and new_data ->> 'source_quote_id' is not null then
            log_action := 'quote_converted';
            log_details := jsonb_build_object('sourceQuoteId', new_data ->> 'source_quote_id');
        else
            log_action := 'created';
        end if;
    else
        old_status := coalesce(old_data ->> 'status', old_data ->> 'is_active');
        current_status := coalesce(new_data ->> 'status', new_data ->> 'is_active');
        if current_status is distinct from old_status then
            log_action := 'status_changed';
        else
            log_action := 'updated';
            old_status := null;
            current_status := null;
        end if;
    end if;

    insert into public.activity_logs (
        action, entity_type, entity_id, entity_label, actor_user_id, actor_name,
        previous_status, new_status, details)
    values (
        log_action, log_entity_type, (new_data ->> 'id')::uuid, left(log_label, 200),
        request_actor_id, left(request_actor_name, 200),
        old_status, current_status, log_details);

    return new;
end;
$$;
