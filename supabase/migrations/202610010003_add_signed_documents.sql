begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signed-documents', 'signed-documents', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;
do $$ begin
    if exists (select 1 from storage.buckets where id = 'signed-documents' and public) then
        raise exception 'signed-documents bucket must be private';
    end if;
end $$;

alter table public.activity_logs drop constraint activity_logs_action_values;
alter table public.activity_logs add constraint activity_logs_action_values
    check (action in ('created', 'updated', 'status_changed', 'quote_converted', 'document_signed'));

create table public.signed_documents (
    id uuid primary key,
    kind text not null check (kind in ('quote', 'invoice')),
    document_id uuid not null,
    snapshot jsonb not null,
    print_fields jsonb not null,
    signature jsonb not null,
    signer_id uuid not null references public.user_profiles(id),
    signer_name text not null,
    signed_at timestamptz not null,
    storage_path text not null unique,
    pdf_sha256 text not null,
    created_at timestamptz not null default now()
);
create index signed_documents_lookup on public.signed_documents(kind, document_id, created_at desc);
alter table public.signed_documents enable row level security;
revoke all on public.signed_documents from anon, authenticated;
grant select on public.signed_documents to service_role;

-- Include all persisted fields, customer details and ordered line items. Even a
-- status change invalidates the current signature; historical PDFs remain intact.
create function public.get_document_snapshot(p_kind text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare doc jsonb; cust jsonb; lines jsonb;
begin
    if p_kind = 'quote' then
        select to_jsonb(q), to_jsonb(c) into doc, cust
        from public.quotes q join public.customers c on c.id = q.customer_id where q.id = p_id;
        select coalesce(jsonb_agg(to_jsonb(i) order by i.position, i.id), '[]'::jsonb)
        into lines from public.quote_items i where i.quote_id = p_id;
    elsif p_kind = 'invoice' then
        select to_jsonb(i), to_jsonb(c) into doc, cust
        from public.invoices i join public.customers c on c.id = i.customer_id where i.id = p_id;
        lines := coalesce(doc->'items', '[]'::jsonb);
    else
        raise exception 'Unsupported document kind' using errcode = '23514';
    end if;
    if doc is null then return null; end if;
    return jsonb_build_object('kind', p_kind, 'document', doc, 'customer', cust, 'items', lines);
end;
$$;

create function public.register_signed_document(
    p_id uuid, p_kind text, p_document_id uuid, p_snapshot jsonb,
    p_print_fields jsonb, p_signature jsonb, p_signer_id uuid, p_signer_name text,
    p_signed_at timestamptz, p_storage_path text, p_pdf_sha256 text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare signer text; customer_id uuid; current_snapshot jsonb; label text;
begin
    select display_name into signer from public.user_profiles
    where id = p_signer_id and role = 'owner' for share;
    if signer is null then raise exception 'Only owner may sign' using errcode = '42501'; end if;
    if signer is distinct from p_signer_name then
        raise exception 'Signer profile changed; please retry' using errcode = '40001';
    end if;
    if p_kind = 'quote' then
        select q.customer_id into customer_id from public.quotes q where q.id = p_document_id for update;
    elsif p_kind = 'invoice' then
        select i.customer_id into customer_id from public.invoices i where i.id = p_document_id for update;
    else
        raise exception 'Unsupported document kind' using errcode = '23514';
    end if;
    if customer_id is null then raise exception 'Document missing' using errcode = '23503'; end if;
    perform 1 from public.customers where id = customer_id for share;
    current_snapshot := public.get_document_snapshot(p_kind, p_document_id);
    if current_snapshot is distinct from p_snapshot then
        raise exception 'Document changed; reload before signing' using errcode = '40001';
    end if;
    insert into public.signed_documents values (p_id, p_kind, p_document_id,
        p_snapshot, p_print_fields, p_signature, p_signer_id, signer,
        p_signed_at, p_storage_path, p_pdf_sha256, now());
    label := coalesce(current_snapshot->'document'->>'quote_number', current_snapshot->'document'->>'invoice_number');
    insert into public.activity_logs(action, entity_type, entity_id, entity_label, actor_user_id, actor_name, details)
    values ('document_signed', p_kind, p_document_id, label, p_signer_id, signer,
        jsonb_build_object('operation', 'document_signed', 'signedDocumentId', p_id, 'pdfSha256', p_pdf_sha256));
    return p_id;
end;
$$;

revoke all on function public.get_document_snapshot(text, uuid) from public, anon, authenticated;
revoke all on function public.register_signed_document(uuid, text, uuid, jsonb, jsonb, jsonb, uuid, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.get_document_snapshot(text, uuid) to service_role;
grant execute on function public.register_signed_document(uuid, text, uuid, jsonb, jsonb, jsonb, uuid, text, timestamptz, text, text) to service_role;
-- No public Storage policies: all upload/download operations go through the API.
commit;
