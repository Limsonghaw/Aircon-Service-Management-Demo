alter table public.invoices
    add column source_quote_id uuid references public.quotes(id) on delete restrict;
alter table public.jobs
    add column source_quote_id uuid references public.quotes(id) on delete restrict;

create unique index invoices_source_quote_unique
    on public.invoices (source_quote_id) where source_quote_id is not null;
create unique index jobs_source_quote_unique
    on public.jobs (source_quote_id) where source_quote_id is not null;

create function public.convert_quote_to_invoice(
    p_quote_id uuid,
    p_invoice_number text,
    p_due_date date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
    quote_customer_id uuid;
    quote_status text;
    quote_total numeric(12, 2);
    invoice_id uuid;
begin
    select q.customer_id, q.status,
        coalesce(sum(round(qi.quantity * qi.unit_price, 2)), 0)
    into quote_customer_id, quote_status, quote_total
    from public.quotes q
    left join public.quote_items qi on qi.quote_id = q.id
    where q.id = p_quote_id
    group by q.customer_id, q.status;

    if quote_customer_id is null then return null; end if;
    if quote_status <> 'accepted' then
        raise exception 'Only accepted quotes can be converted' using errcode = '23514';
    end if;
    if quote_total <= 0 then
        raise exception 'Quote total must be greater than zero' using errcode = '23514';
    end if;

    insert into public.invoices(invoice_number, customer_id, amount, due_date, status, source_quote_id)
    values (btrim(p_invoice_number), quote_customer_id, quote_total, p_due_date, 'unpaid', p_quote_id)
    returning id into invoice_id;
    return invoice_id;
end;
$$;

create function public.convert_quote_to_job(
    p_quote_id uuid,
    p_job_number text,
    p_title text,
    p_service_date date,
    p_team text)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
    quote_customer_id uuid;
    quote_status text;
    job_id uuid;
begin
    select customer_id, status into quote_customer_id, quote_status
    from public.quotes where id = p_quote_id;
    if quote_customer_id is null then return null; end if;
    if quote_status <> 'accepted' then
        raise exception 'Only accepted quotes can be converted' using errcode = '23514';
    end if;

    insert into public.jobs(job_number, customer_id, title, service_date, team, status, source_quote_id)
    values (btrim(p_job_number), quote_customer_id, btrim(p_title), p_service_date,
        btrim(p_team), case when btrim(p_team) = '未安排' then 'pending' else 'scheduled' end, p_quote_id)
    returning id into job_id;
    return job_id;
end;
$$;

revoke all on function public.convert_quote_to_invoice(uuid,text,date) from public, anon, authenticated;
revoke all on function public.convert_quote_to_job(uuid,text,text,date,text) from public, anon, authenticated;
grant execute on function public.convert_quote_to_invoice(uuid,text,date) to service_role;
grant execute on function public.convert_quote_to_job(uuid,text,text,date,text) to service_role;
