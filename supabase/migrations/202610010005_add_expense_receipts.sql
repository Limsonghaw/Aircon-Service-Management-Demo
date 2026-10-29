begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 10485760,
    array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;
do $$ begin
    if exists (select 1 from storage.buckets where id = 'expense-receipts' and public) then
        raise exception 'expense-receipts bucket must be private';
    end if;
end $$;

create table public.expense_receipts (
    id uuid primary key,
    expense_id uuid not null references public.expenses(id),
    file_name text not null check (char_length(file_name) between 1 and 200),
    content_type text not null check (content_type in ('image/jpeg', 'image/png', 'application/pdf')),
    file_size bigint not null check (file_size between 1 and 10485760),
    storage_path text not null unique,
    sha256 text not null check (sha256 ~ '^[A-F0-9]{64}$'),
    uploaded_by uuid not null references public.user_profiles(id),
    uploaded_by_name text not null,
    created_at timestamptz not null default now(),
    constraint expense_receipt_path check (storage_path = expense_id::text || '/' || id::text ||
        case content_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.pdf' end)
);
create index expense_receipts_expense_idx on public.expense_receipts(expense_id, created_at desc, id desc);
alter table public.expense_receipts enable row level security;
revoke all on public.expense_receipts from public, anon, authenticated;
grant select on public.expense_receipts to service_role;

alter table public.activity_logs drop constraint activity_logs_action_values;
alter table public.activity_logs add constraint activity_logs_action_values
    check (action in ('created', 'updated', 'status_changed', 'quote_converted', 'document_signed', 'receipt_uploaded'));

create function public.register_expense_receipt(p_id uuid, p_expense_id uuid, p_file_name text,
    p_content_type text, p_file_size bigint, p_sha256 text, p_uploader_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor text; label text; saved public.expense_receipts%rowtype; extension text;
begin
    select display_name into actor from public.user_profiles
        where id = p_uploader_id and role in ('owner', 'admin') for share;
    if actor is null then raise exception 'Management role required' using errcode = '42501'; end if;
    select expense_number into label from public.expenses where id = p_expense_id for share;
    if label is null then raise exception 'Expense missing' using errcode = '23503'; end if;
    extension := case p_content_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png'
        when 'application/pdf' then '.pdf' else null end;
    if extension is null then raise exception 'Unsupported receipt type' using errcode = '23514'; end if;
    insert into public.expense_receipts(id, expense_id, file_name, content_type, file_size, storage_path,
        sha256, uploaded_by, uploaded_by_name)
        values (p_id, p_expense_id, p_file_name, p_content_type, p_file_size,
            p_expense_id::text || '/' || p_id::text || extension, p_sha256, p_uploader_id, actor)
        returning * into saved;
    insert into public.activity_logs(action, entity_type, entity_id, entity_label, actor_user_id, actor_name, details)
        values ('receipt_uploaded', 'expense', p_expense_id, label, p_uploader_id, actor,
            jsonb_build_object('operation', 'receipt_uploaded', 'receiptId', p_id, 'fileName', p_file_name,
                'fileSize', p_file_size));
    return to_jsonb(saved);
end;
$$;
revoke all on function public.register_expense_receipt(uuid, uuid, text, text, bigint, text, uuid)
    from public, anon, authenticated;
grant execute on function public.register_expense_receipt(uuid, uuid, text, text, bigint, text, uuid) to service_role;
-- The API alone accesses Storage. No public or authenticated Storage policies are added.
commit;
