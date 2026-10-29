-- DRAFT: written for review only; execution requires explicit user confirmation.
-- Optional PO attachments. No jobs/status triggers or existing data updates.
begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('job-po-documents', 'job-po-documents', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Do not repurpose an incompatible existing bucket or alter its files/configuration.
do $$ begin
    if exists (
        select 1 from storage.buckets
        where id = 'job-po-documents' and (
            public is distinct from false
            or file_size_limit is distinct from 10485760::bigint
            or allowed_mime_types is distinct from array['application/pdf']::text[]
        )
    ) then
        raise exception 'job-po-documents must be private, PDF-only and limited to 10 MB';
    end if;
end $$;

create table public.job_po_documents (
    id uuid primary key,
    job_id uuid not null references public.jobs(id) on delete restrict,
    file_name text not null
        check (char_length(btrim(file_name)) between 1 and 200 and right(lower(file_name), 4) = '.pdf'),
    content_type text not null check (content_type = 'application/pdf'),
    file_size bigint not null check (file_size between 1 and 10485760),
    storage_path text not null unique,
    sha256 text not null check (sha256 ~ '^[A-F0-9]{64}$'),
    uploaded_by uuid not null references public.user_profiles(id) on delete restrict,
    uploaded_by_name text not null check (char_length(btrim(uploaded_by_name)) between 1 and 200),
    created_at timestamptz not null default now(),
    constraint job_po_document_path
        check (storage_path = job_id::text || '/' || id::text || '.pdf')
);
create index job_po_documents_job_idx
    on public.job_po_documents(job_id, created_at desc, id desc);

alter table public.job_po_documents enable row level security;
revoke all on public.job_po_documents from public, anon, authenticated, service_role;
grant select on public.job_po_documents to service_role;

-- Restrictive rather than permissive: even a broader authenticated Storage policy
-- cannot grant direct browser access to this bucket. Other buckets are unaffected.
-- service_role uses its existing trusted backend/BYPASSRLS access.
create policy job_po_documents_no_browser_access
    on storage.objects as restrictive for all to anon, authenticated
    using (bucket_id <> 'job-po-documents')
    with check (bucket_id <> 'job-po-documents');

create function public.can_access_job_po_documents(p_job_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.user_profiles p cross join public.jobs j
        where p.id = p_user_id and j.id = p_job_id and p.role in ('owner', 'admin')
    );
$$;
revoke all on function public.can_access_job_po_documents(uuid, uuid)
    from public, anon, authenticated;
grant execute on function public.can_access_job_po_documents(uuid, uuid) to service_role;

-- The backend supplies the authenticated uploader, validated PDF metadata and
-- a stable attachment ID. New uploads use new IDs; retries reuse the same ID.
-- The API must verify role + job access before uploading bytes and for every read.
create function public.register_job_po_document(
    p_id uuid, p_job_id uuid, p_file_name text, p_content_type text,
    p_file_size bigint, p_sha256 text, p_uploader_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor public.user_profiles%rowtype; job public.jobs%rowtype;
    saved public.job_po_documents%rowtype;
begin
    select * into actor from public.user_profiles where id = p_uploader_id for share;
    if not found then
        raise exception 'Management role required' using errcode = '42501';
    end if;
    if actor.role not in ('owner', 'admin') then
        raise exception 'Management role required' using errcode = '42501';
    end if;

    select * into job from public.jobs where id = p_job_id for share;
    if not found then raise exception 'Job missing' using errcode = '23503'; end if;
    -- No status condition: PO is optional and may be added after completion.

    insert into public.job_po_documents(
        id, job_id, file_name, content_type, file_size, storage_path,
        sha256, uploaded_by, uploaded_by_name)
    values (
        p_id, p_job_id, p_file_name, p_content_type, p_file_size,
        p_job_id::text || '/' || p_id::text || '.pdf',
        p_sha256, p_uploader_id, actor.display_name)
    on conflict (id) do nothing
    returning * into saved;

    if found then
        -- Use an existing audit action; no shared enum/check constraint changes.
        -- Log and attachment registration commit or roll back together.
        insert into public.activity_logs(
            action, entity_type, entity_id, entity_label, actor_user_id, actor_name, details)
        values (
            'updated', 'job', p_job_id, job.job_number, p_uploader_id, actor.display_name,
            jsonb_build_object('operation', 'job_po_uploaded', 'poDocumentId', p_id,
                'fileName', p_file_name, 'fileSize', p_file_size, 'sha256', p_sha256));
    else
        -- A confirmed retry returns the original record without duplicate audit.
        select * into saved from public.job_po_documents where id = p_id for share;
        if not found
            or saved.job_id is distinct from p_job_id
            or saved.uploaded_by is distinct from p_uploader_id
            or saved.file_name is distinct from p_file_name
            or saved.content_type is distinct from p_content_type
            or saved.file_size is distinct from p_file_size
            or saved.sha256 is distinct from p_sha256 then
            raise exception 'PO attachment ID already belongs to a different upload'
                using errcode = '23505';
        end if;
    end if;
    return to_jsonb(saved);
end;
$$;
revoke all on function public.register_job_po_document(uuid, uuid, text, text, bigint, text, uuid)
    from public, anon, authenticated;
grant execute on function public.register_job_po_document(uuid, uuid, text, text, bigint, text, uuid)
    to service_role;

comment on table public.job_po_documents is
    'Optional, historical PO PDFs for jobs. Management API only; no overwrite or cascading deletion.';

-- No destructive down migration: retaining the table/bucket keeps real history.
-- Disabling the UI does not revoke historical management access or remove files.
commit;
