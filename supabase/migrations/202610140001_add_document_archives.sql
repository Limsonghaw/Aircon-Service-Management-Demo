-- REVIEW DRAFT ONLY: execute only after explicit approval of this file.
-- Independent historical originals. No writes to quotes/invoices/payment data.
begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('document-archives', 'document-archives', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;
do $$ begin
    if exists (select 1 from storage.buckets where id = 'document-archives'
        and (public is distinct from false or file_size_limit is distinct from 10485760::bigint
            or allowed_mime_types is distinct from array['application/pdf']::text[])) then
        raise exception 'Archive bucket must be private, PDF-only, limited to 10 MB';
    end if;
end $$;

create table public.document_archives (
    id uuid primary key,
    kind text not null check (kind in ('quote', 'invoice')),
    customer_id uuid not null references public.customers(id) on delete restrict,
    customer_name text not null,
    original_number text check (original_number is null or char_length(btrim(original_number)) between 1 and 50),
    original_date date,
    file_name text not null check (char_length(file_name) between 1 and 200 and right(lower(file_name), 4) = '.pdf'),
    file_size bigint not null check (file_size between 1 and 10485760),
    storage_path text not null unique,
    sha256 text not null check (sha256 ~ '^[A-F0-9]{64}$'),
    uploaded_by uuid not null references public.user_profiles(id) on delete restrict,
    ready boolean not null default false,
    created_at timestamptz not null default now(),
    constraint archive_path check (storage_path = kind || '/' || customer_id::text || '/' || id::text || '.pdf')
);
create index document_archives_list_idx on public.document_archives(kind, created_at desc) where ready;
create index document_archives_customer_idx on public.document_archives(customer_id);
create index document_archives_number_idx on public.document_archives(kind, lower(btrim(original_number)));
alter table public.document_archives enable row level security;
revoke all on public.document_archives from public, anon, authenticated, service_role;
grant select on public.document_archives to service_role;
create policy document_archives_no_browser_access on storage.objects as restrictive for all to anon, authenticated
    using (bucket_id <> 'document-archives') with check (bucket_id <> 'document-archives');

create function public.can_access_document_archives(p_user_id uuid, p_customer_id uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.user_profiles where id = p_user_id and role in ('owner', 'admin'))
        and (p_customer_id is null or exists (select 1 from public.customers where id = p_customer_id));
$$;
revoke all on function public.can_access_document_archives(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_access_document_archives(uuid, uuid) to service_role;

create function public.reserve_document_archive(p_id uuid, p_kind text, p_customer_id uuid, p_number text,
    p_date date, p_confirm_duplicate boolean, p_user_id uuid, p_file_name text, p_file_size bigint, p_sha256 text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.document_archives%rowtype; actor public.user_profiles%rowtype; customer_label text;
begin
    select * into actor from public.user_profiles where id = p_user_id for share;
    if not found or actor.role not in ('owner', 'admin') then
        raise exception 'Management required' using errcode = '42501';
    end if;
    select name into customer_label from public.customers where id = p_customer_id for share;
    if not found then raise exception 'Customer missing' using errcode = '42501'; end if;
    p_number := nullif(btrim(p_number), '');
    -- Serializes same-ID retries; no overwrite even when two requests arrive together.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text, 0));
    select * into saved from public.document_archives where id = p_id for update;
    if found then
        if saved.kind is distinct from p_kind or saved.customer_id is distinct from p_customer_id
            or saved.original_number is distinct from p_number or saved.original_date is distinct from p_date
            or saved.uploaded_by is distinct from p_user_id or saved.file_name is distinct from p_file_name
            or saved.file_size is distinct from p_file_size or saved.sha256 is distinct from p_sha256 then
            raise exception 'Upload identity mismatch' using errcode = '23505';
        end if;
        return to_jsonb(saved);
    end if;
    if p_number is not null then
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_kind || ':' || lower(p_number), 1));
        if not coalesce(p_confirm_duplicate, false) and (
            exists (select 1 from public.document_archives where kind = p_kind and lower(btrim(original_number)) = lower(p_number))
            or (p_kind = 'quote' and exists (select 1 from public.quotes where lower(btrim(quote_number)) = lower(p_number)))
            or (p_kind = 'invoice' and exists (select 1 from public.invoices where lower(btrim(invoice_number)) = lower(p_number)))) then
            raise exception 'Duplicate original number' using errcode = 'P0002';
        end if;
    end if;
    insert into public.document_archives(id, kind, customer_id, customer_name, original_number, original_date,
        file_name, file_size, storage_path, sha256, uploaded_by)
    values (p_id, p_kind, p_customer_id, customer_label, p_number, p_date, p_file_name, p_file_size,
        p_kind || '/' || p_customer_id::text || '/' || p_id::text || '.pdf', p_sha256, p_user_id)
    returning * into saved;
    return to_jsonb(saved);
end;
$$;
revoke all on function public.reserve_document_archive(uuid,text,uuid,text,date,boolean,uuid,text,bigint,text) from public, anon, authenticated;
grant execute on function public.reserve_document_archive(uuid,text,uuid,text,date,boolean,uuid,text,bigint,text) to service_role;

create function public.complete_document_archive(p_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.document_archives%rowtype; actor public.user_profiles%rowtype;
begin
    select * into actor from public.user_profiles where id = p_user_id for share;
    if not found or actor.role not in ('owner','admin') then
        raise exception 'Management required' using errcode = '42501';
    end if;
    select * into saved from public.document_archives where id = p_id for update;
    if not found or saved.uploaded_by <> p_user_id then
        raise exception 'Archive ownership mismatch' using errcode = '42501';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'document-archives' and name = saved.storage_path) then
        raise exception 'Original file missing' using errcode = '23503';
    end if;
    if not saved.ready then
        update public.document_archives set ready = true, created_at = now() where id = p_id returning * into saved;
        insert into public.activity_logs(action, entity_type, entity_id, entity_label, actor_user_id, actor_name, details)
        values ('created', saved.kind, saved.id, coalesce(saved.original_number, saved.file_name), p_user_id, actor.display_name,
            jsonb_build_object('operation','historical_pdf_archived','customerId',saved.customer_id,'fileName',saved.file_name));
    end if;
    return to_jsonb(saved);
end;
$$;
revoke all on function public.complete_document_archive(uuid,uuid) from public, anon, authenticated;
grant execute on function public.complete_document_archive(uuid,uuid) to service_role;
comment on table public.document_archives is 'Historical PDF originals only; excluded from income, receivables, payment state and reminders. Pending reservations retained for safe retry.';
-- No destructive down migration. Retain rows and stored PDFs when rolling back application code.
commit;
