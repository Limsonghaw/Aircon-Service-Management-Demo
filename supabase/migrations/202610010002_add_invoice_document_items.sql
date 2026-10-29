begin;
alter table public.invoices
    add column items jsonb not null default '[]'::jsonb,
    add column discount numeric(12,2) not null default 0 check (discount >= 0);

create function public.calculate_invoice_items()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare entry jsonb; subtotal numeric := 0; quantity numeric; price numeric;
begin
    if tg_op = 'INSERT' and new.source_quote_id is not null and new.items = '[]'::jsonb then
        select coalesce(jsonb_agg(jsonb_build_object('description', description,
            'quantity', qi.quantity, 'unitPrice', unit_price) order by position), '[]'::jsonb)
        into new.items from public.quote_items qi where quote_id = new.source_quote_id;
    end if;
    if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) > 100 then
        raise exception 'Invalid invoice items' using errcode = '23514';
    end if;
    if jsonb_array_length(new.items) = 0 then
        if new.discount <> 0 then raise exception 'Discount requires items' using errcode = '23514'; end if;
        return new;
    end if;
    for entry in select * from jsonb_array_elements(new.items) loop
        quantity := (entry ->> 'quantity')::numeric;
        price := (entry ->> 'unitPrice')::numeric;
        if quantity is null or price is null or quantity <= 0 or quantity > 1000000 or price < 0
            or price > 9999999999.99 or round(quantity,2) <> quantity or round(price,2) <> price
            or coalesce(char_length(btrim(entry ->> 'description')),0) not between 1 and 1000 then
            raise exception 'Invalid invoice item' using errcode = '23514';
        end if;
        subtotal := subtotal + round(quantity * price, 2);
    end loop;
    new.amount := subtotal - new.discount;
    return new;
end;
$$;
create trigger invoices_calculate_items before insert or update on public.invoices
for each row execute function public.calculate_invoice_items();
revoke all on function public.calculate_invoice_items() from public, anon, authenticated;
commit;
