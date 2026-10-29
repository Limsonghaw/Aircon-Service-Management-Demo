alter table public.user_profiles
    add column employee_id uuid unique references public.employees(id) on delete set null;

create function public.get_employee_jobs(p_user_id uuid)
returns table (
    id uuid, job_number text, customer_id uuid, title text, service_date date,
    team text, status text, created_at timestamptz, updated_at timestamptz, customer_name text)
language sql stable security invoker set search_path = '' as $$
    select j.id, j.job_number, j.customer_id, j.title, j.service_date,
        j.team, j.status, j.created_at, j.updated_at, c.name
    from public.user_profiles p
    join public.employees e on e.id = p.employee_id and e.is_active
    join public.teams t on t.id = e.team_id and t.is_active
    join public.jobs j on j.team = t.name
    join public.customers c on c.id = j.customer_id
    where p.id = p_user_id and p.role = 'employee'
    order by j.service_date desc;
$$;

revoke all on function public.get_employee_jobs(uuid) from public, anon, authenticated;
grant execute on function public.get_employee_jobs(uuid) to service_role;
