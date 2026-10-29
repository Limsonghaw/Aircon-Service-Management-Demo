create table public.jobs (
    id uuid primary key default gen_random_uuid(),
    job_number text not null unique,
    customer_id uuid not null references public.customers(id) on delete restrict,
    title text not null,
    service_date date not null,
    team text not null default '未安排',
    status text not null default '待安排',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint jobs_number_length
        check (char_length(btrim(job_number)) between 1 and 50),
    constraint jobs_title_length
        check (char_length(btrim(title)) between 1 and 200),
    constraint jobs_team_length
        check (char_length(btrim(team)) between 1 and 100),
    constraint jobs_status_values
        check (status in ('pending', 'scheduled', 'in_progress', 'completed'))
);

create index jobs_customer_id_idx on public.jobs (customer_id);
create index jobs_service_date_idx on public.jobs (service_date);

create trigger jobs_set_updated_at
before update on public.jobs
for each row
execute function public.set_updated_at();

alter table public.jobs enable row level security;

grant select, insert, update, delete
    on table public.jobs
    to service_role;

comment on table public.jobs is
    'Air-conditioning work orders linked to customers. Access is restricted to the backend.';
