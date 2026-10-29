create table public.quotes (
 id uuid primary key default gen_random_uuid(),
 quote_number text not null unique check (char_length(btrim(quote_number)) between 1 and 50),
 customer_id uuid not null references public.customers(id) on delete restrict,
 valid_until date not null,
 status text not null default 'draft' check (status in ('draft','sent','accepted','rejected')),
 notes text check (char_length(notes) <= 5000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.quote_items (
 id uuid primary key default gen_random_uuid(),
 quote_id uuid not null references public.quotes(id) on delete cascade,
 position integer not null,
 description text not null check (char_length(btrim(description)) between 1 and 1000),
 quantity numeric(10,2) not null check (quantity > 0 and quantity <= 1000000),
 unit_price numeric(12,2) not null check (unit_price >= 0 and unit_price <= 9999999999.99),
 unique(quote_id, position)
);
create index quotes_customer_idx on public.quotes(customer_id);
create trigger quotes_set_updated_at before update on public.quotes
for each row execute function public.set_updated_at();
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
grant select, insert, update, delete on public.quotes, public.quote_items to service_role;

-- One RPC transaction prevents partially saved quotes or lost items on failure.
create function public.save_quote(p_id uuid, p_quote_number text, p_customer_id uuid,
 p_valid_until date, p_status text, p_notes text, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare saved_id uuid;
begin
 if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 or p_items is null then
  raise exception 'A quote requires 1 to 100 items' using errcode = '23514';
 end if;
 if p_id is null then
  insert into public.quotes(quote_number,customer_id,valid_until,status,notes)
  values(btrim(p_quote_number),p_customer_id,p_valid_until,p_status,p_notes) returning id into saved_id;
 else
  update public.quotes set quote_number=btrim(p_quote_number),customer_id=p_customer_id,
   valid_until=p_valid_until,status=p_status,notes=p_notes where id=p_id returning id into saved_id;
  if saved_id is null then return null; end if;
  delete from public.quote_items where quote_id=saved_id;
 end if;
 insert into public.quote_items(quote_id,position,description,quantity,unit_price)
 select saved_id, ordinality::integer, btrim(item->>'description'),
  (item->>'quantity')::numeric, (item->>'unitPrice')::numeric
 from jsonb_array_elements(p_items) with ordinality as entries(item,ordinality);
 return saved_id;
end;
$$;
revoke all on function public.save_quote(uuid,text,uuid,date,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_quote(uuid,text,uuid,date,text,text,jsonb) to service_role;
