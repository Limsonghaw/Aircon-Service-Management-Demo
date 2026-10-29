create table public.teams (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    notes text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint teams_name_length check (char_length(btrim(name)) between 1 and 100),
    constraint teams_notes_length check (notes is null or char_length(notes) <= 2000)
);

create table public.employees (
    id uuid primary key default gen_random_uuid(),
    team_id uuid references public.teams(id) on delete set null,
    name text not null,
    phone text,
    role text not null default '技术员',
    notes text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint employees_name_length check (char_length(btrim(name)) between 1 and 200),
    constraint employees_phone_length check (phone is null or char_length(phone) <= 50),
    constraint employees_role_length check (char_length(btrim(role)) between 1 and 100),
    constraint employees_notes_length check (notes is null or char_length(notes) <= 2000)
);

insert into public.teams (name)
select distinct btrim(team)
from public.jobs
where btrim(team) <> '未安排'
on conflict (name) do nothing;

create index employees_team_id_idx on public.employees (team_id);
create index employees_active_idx on public.employees (is_active);

create trigger teams_set_updated_at before update on public.teams
for each row execute function public.set_updated_at();
create trigger employees_set_updated_at before update on public.employees
for each row execute function public.set_updated_at();

create function public.sync_jobs_team_name()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
    if new.name is distinct from old.name then
        update public.jobs set team = new.name where team = old.name;
    end if;
    return new;
end;
$$;

create trigger teams_sync_jobs_name after update of name on public.teams
for each row execute function public.sync_jobs_team_name();

alter table public.teams enable row level security;
alter table public.employees enable row level security;
grant select, insert, update, delete on table public.teams, public.employees to service_role;

comment on table public.teams is 'Service teams available for job assignment.';
comment on table public.employees is 'Employees and their current team membership.';
