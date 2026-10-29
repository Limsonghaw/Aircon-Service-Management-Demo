create table public.expenses (
    id uuid primary key default gen_random_uuid(),
    expense_number text not null unique,
    description text not null,
    amount numeric(12, 2) not null,
    expense_date date not null,
    status text not null default 'pending',
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint expenses_number_length
        check (char_length(btrim(expense_number)) between 1 and 50),
    constraint expenses_description_length
        check (char_length(btrim(description)) between 1 and 500),
    constraint expenses_amount_positive
        check (amount > 0 and amount <= 9999999999.99),
    constraint expenses_status_values
        check (status in ('pending', 'confirmed')),
    constraint expenses_notes_length
        check (notes is null or char_length(notes) <= 5000)
);

create index expenses_date_idx on public.expenses (expense_date desc);
create index expenses_status_idx on public.expenses (status);

create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

alter table public.expenses enable row level security;

grant select, insert, update, delete on table public.expenses to service_role;

comment on table public.expenses is
    'Company expense records. Access is restricted to the backend service role.';
