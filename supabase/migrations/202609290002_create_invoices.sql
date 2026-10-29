create table public.invoices (
    id uuid primary key default gen_random_uuid(),
    invoice_number text not null unique,
    customer_id uuid not null references public.customers(id) on delete restrict,
    amount numeric(12, 2) not null,
    due_date date not null,
    status text not null default 'unpaid',
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint invoices_number_length
        check (char_length(btrim(invoice_number)) between 1 and 50),
    constraint invoices_amount_positive
        check (amount > 0),
    constraint invoices_status_values
        check (status in ('unpaid', 'partial', 'paid', 'overdue')),
    constraint invoices_notes_length
        check (notes is null or char_length(notes) <= 5000)
);

create index invoices_customer_id_idx on public.invoices (customer_id);
create index invoices_due_date_idx on public.invoices (due_date);
create index invoices_status_idx on public.invoices (status);

create trigger invoices_set_updated_at
before update on public.invoices
for each row
execute function public.set_updated_at();

alter table public.invoices enable row level security;

grant select, insert, update, delete
    on table public.invoices
    to service_role;

comment on table public.invoices is
    'Customer invoices managed by the backend. Access is restricted to the service role.';
