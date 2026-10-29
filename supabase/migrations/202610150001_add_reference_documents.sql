-- REVIEW DRAFT. Do not execute until the user confirms this migration.
-- Reference PDFs are independent of owner signatures and payment status.
begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('reference-documents', 'reference-documents', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;
do $$ begin
    if exists (select 1 from storage.buckets where id = 'reference-documents'
        and (public is distinct from false or file_size_limit is distinct from 10485760::bigint
            or allowed_mime_types is distinct from array['application/pdf']::text[])) then
        raise exception 'Reference bucket must be private, PDF-only and limited to 10 MB';
    end if;
end $$;

create table public.reference_documents (
    id uuid primary key,
    kind text not null check (kind in ('quote', 'invoice')),
    document_id uuid not null,
    quote_id uuid references public.quotes(id) on delete restrict,
    invoice_id uuid references public.invoices(id) on delete restrict,
    file_name text not null check (char_length(btrim(file_name)) between 1 and 200 and right(lower(file_name), 4) = '.pdf'),
    content_type text not null check (content_type = 'application/pdf'),
    file_size bigint not null check (file_size between 1 and 10485760),
    storage_path text not null unique,
    sha256 text not null check (sha256 ~ '^[A-F0-9]{64}$'),
    uploaded_by uuid not null references public.user_profiles(id) on delete restrict,
    uploaded_by_name text not null check (char_length(btrim(uploaded_by_name)) between 1 and 200),
    created_at timestamptz not null default now(),
    constraint reference_document_parent check (
        (kind = 'quote' and quote_id is not null and quote_id = document_id and invoice_id is null)
        or (kind = 'invoice' and invoice_id is not null and invoice_id = document_id and quote_id is null)),
    constraint reference_document_path check (storage_path = kind || '/' || document_id::text || '/' || id::text || '.pdf')
);
create index reference_documents_parent_idx
    on public.reference_documents(kind, document_id, created_at desc, id desc);
alter table public.reference_documents enable row level security;
revoke all on public.reference_documents from public, anon, authenticated, service_role;
grant select on public.reference_documents to service_role;
create policy reference_documents_no_browser_access
    on storage.objects as restrictive for all to anon, authenticated
    using (bucket_id <> 'reference-documents')
    with check (bucket_id <> 'reference-documents');

create function public.can_access_reference_documents(p_kind text, p_document_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.user_profiles where id = p_user_id and role in ('owner', 'admin'))
        and ((p_kind = 'quote' and exists (select 1 from public.quotes where id = p_document_id))
            or (p_kind = 'invoice' and exists (select 1 from public.invoices where id = p_document_id)));
$$;
revoke all on function public.can_access_reference_documents(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_access_reference_documents(text, uuid, uuid) to service_role;

create function public.register_reference_document(
    p_id uuid, p_kind text, p_document_id uuid, p_file_name text, p_content_type text,
    p_file_size bigint, p_sha256 text, p_uploader_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor public.user_profiles%rowtype;
    saved public.reference_documents%rowtype; label text;
begin
    select * into actor from public.user_profiles where id = p_uploader_id for share;
    if not found then raise exception 'Management role required' using errcode = '42501'; end if;
    if actor.role not in ('owner', 'admin') then
        raise exception 'Management role required' using errcode = '42501';
    end if;
    if p_kind = 'quote' then
        select quote_number into label from public.quotes where id = p_document_id for share;
    elsif p_kind = 'invoice' then
        select invoice_number into label from public.invoices where id = p_document_id for share;
    else
        raise exception 'Unsupported document kind' using errcode = '23514';
    end if;
    if not found then raise exception 'Document missing' using errcode = '23503'; end if;

    insert into public.reference_documents(
        id, kind, document_id, quote_id, invoice_id, file_name, content_type,
        file_size, storage_path, sha256, uploaded_by, uploaded_by_name)
    values (p_id, p_kind, p_document_id,
        case when p_kind = 'quote' then p_document_id end,
        case when p_kind = 'invoice' then p_document_id end,
        p_file_name, p_content_type, p_file_size,
        p_kind || '/' || p_document_id::text || '/' || p_id::text || '.pdf',
        p_sha256, p_uploader_id, actor.display_name)
    on conflict (id) do nothing returning * into saved;
    if found then
        insert into public.activity_logs(action, entity_type, entity_id, entity_label, actor_user_id, actor_name, details)
        values ('updated', p_kind, p_document_id, label, p_uploader_id, actor.display_name,
            jsonb_build_object('operation', 'reference_pdf_uploaded', 'attachmentId', p_id,
                'fileName', p_file_name, 'fileSize', p_file_size, 'sha256', p_sha256));
    else
        select * into saved from public.reference_documents where id = p_id for share;
        if not found or saved.kind is distinct from p_kind or saved.document_id is distinct from p_document_id
            or saved.uploaded_by is distinct from p_uploader_id or saved.file_name is distinct from p_file_name
            or saved.content_type is distinct from p_content_type or saved.file_size is distinct from p_file_size
            or saved.sha256 is distinct from p_sha256 then
            raise exception 'Attachment ID belongs to another upload' using errcode = '23505';
        end if;
    end if;
    return to_jsonb(saved);
end;
$$;
revoke all on function public.register_reference_document(uuid, text, uuid, text, text, bigint, text, uuid)
    from public, anon, authenticated;
grant execute on function public.register_reference_document(uuid, text, uuid, text, text, bigint, text, uuid)
    to service_role;
comment on table public.reference_documents is
    'Reference originals used to create new quotes/invoices. No owner signature or payment status changes.';
-- No destructive down migration or cleanup: rollback code must retain all data/files.
commit;
