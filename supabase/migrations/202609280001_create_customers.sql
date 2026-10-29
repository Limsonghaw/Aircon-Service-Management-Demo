create table public.customers (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    customer_type text not null,
    phone text not null,
    email text,
    address text,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint customers_name_length
        check (char_length(btrim(name)) between 1 and 200),
    constraint customers_type_values
        check (customer_type in ('individual', 'business')),
    constraint customers_phone_length
        check (char_length(btrim(phone)) between 1 and 50),
    constraint customers_email_length
        check (email is null or char_length(email) <= 320),
    constraint customers_address_length
        check (address is null or char_length(address) <= 1000),
    constraint customers_notes_length
        check (notes is null or char_length(notes) <= 5000)
);

create index customers_name_search_idx
    on public.customers (lower(name));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger customers_set_updated_at
before update on public.customers
for each row
execute function public.set_updated_at();

alter table public.customers enable row level security;

-- Backend requests authenticate as service_role. RLS bypass alone does not
-- grant PostgreSQL table privileges for objects created in the SQL editor.
grant select, insert, update, delete
    on table public.customers
    to service_role;

comment on table public.customers is
    'Customer contact records. Access is restricted to the backend until explicit RLS policies are added.';
