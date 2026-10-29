create table public.activity_logs (
    id bigint generated always as identity primary key,
    action text not null,
    entity_type text not null,
    entity_id uuid not null,
    entity_label text not null,
    actor_user_id uuid,
    actor_name text not null default '系统',
    previous_status text,
    new_status text,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),

    constraint activity_logs_action_values
        check (action in ('created', 'updated', 'status_changed', 'quote_converted')),
    constraint activity_logs_entity_type_values
        check (entity_type in ('customer', 'job', 'invoice', 'quote', 'expense', 'team', 'employee')),
    constraint activity_logs_entity_label_length
        check (char_length(entity_label) between 1 and 200),
    constraint activity_logs_actor_name_length
        check (char_length(actor_name) between 1 and 200)
);

create index activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index activity_logs_entity_idx on public.activity_logs (entity_type, entity_id);

create function public.record_activity_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    new_data jsonb := to_jsonb(new);
    old_data jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
    log_action text;
    log_entity_type text;
    log_label text;
    old_status text;
    current_status text;
    log_details jsonb := '{}'::jsonb;
begin
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
        action, entity_type, entity_id, entity_label, actor_name,
        previous_status, new_status, details)
    values (
        log_action, log_entity_type, (new_data ->> 'id')::uuid, left(log_label, 200), '系统',
        old_status, current_status, log_details);

    return new;
end;
$$;

create trigger customers_record_activity after insert or update on public.customers
for each row execute function public.record_activity_log();
create trigger jobs_record_activity after insert or update on public.jobs
for each row execute function public.record_activity_log();
create trigger invoices_record_activity after insert or update on public.invoices
for each row execute function public.record_activity_log();
create trigger quotes_record_activity after insert or update on public.quotes
for each row execute function public.record_activity_log();
create trigger expenses_record_activity after insert or update on public.expenses
for each row execute function public.record_activity_log();
create trigger teams_record_activity after insert or update on public.teams
for each row execute function public.record_activity_log();
create trigger employees_record_activity after insert or update on public.employees
for each row execute function public.record_activity_log();

alter table public.activity_logs enable row level security;
revoke all on function public.record_activity_log() from public, anon, authenticated;
grant select on table public.activity_logs to service_role;

comment on table public.activity_logs is
    'Immutable audit trail for successful create, update, status change, and quote conversion operations.';
