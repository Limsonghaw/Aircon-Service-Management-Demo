begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('owner-signatures', 'owner-signatures', false, 1048576, array['application/json'])
on conflict (id) do nothing;
do $$ begin
    if exists (select 1 from storage.buckets where id = 'owner-signatures' and public) then
        raise exception 'owner-signatures bucket must be private';
    end if;
end $$;

create table public.owner_saved_signatures (
    user_id uuid primary key references public.user_profiles(id),
    id uuid not null unique,
    storage_path text not null unique,
    signature_sha256 text not null check (signature_sha256 ~ '^[A-F0-9]{64}$'),
    updated_at timestamptz not null default now(),
    constraint owner_signature_path check (storage_path = user_id::text || '/' || id::text || '.json')
);
alter table public.owner_saved_signatures enable row level security;
revoke all on public.owner_saved_signatures from public, anon, authenticated;
grant select on public.owner_saved_signatures to service_role;

alter table public.activity_logs drop constraint activity_logs_entity_type_values;
alter table public.activity_logs add constraint activity_logs_entity_type_values
    check (entity_type in ('customer', 'job', 'invoice', 'quote', 'expense', 'team', 'employee', 'owner_signature'));

create function public.save_owner_signature(p_user_id uuid, p_id uuid, p_expected_id uuid,
    p_storage_path text, p_signature_sha256 text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare signer text; prior_id uuid; saved_at timestamptz := now();
begin
    -- Serialise writes per owner, including the first save when no row exists yet.
    select display_name into signer from public.user_profiles
        where id = p_user_id and role = 'owner' for update;
    if signer is null then raise exception 'Only owner may save a signature' using errcode = '42501'; end if;
    select id into prior_id from public.owner_saved_signatures where user_id = p_user_id;
    if prior_id is distinct from p_expected_id then
        raise exception 'Saved signature changed; reload before replacing' using errcode = '40001';
    end if;
    insert into public.owner_saved_signatures(user_id, id, storage_path, signature_sha256, updated_at)
        values (p_user_id, p_id, p_storage_path, p_signature_sha256, saved_at)
        on conflict (user_id) do update set id = excluded.id, storage_path = excluded.storage_path,
            signature_sha256 = excluded.signature_sha256, updated_at = excluded.updated_at;
    insert into public.activity_logs(action, entity_type, entity_id, entity_label, actor_user_id, actor_name, details)
        values (case when prior_id is null then 'created' else 'updated' end,
            'owner_signature', p_user_id, left(signer || ' · 常用签名', 200), p_user_id, signer,
            jsonb_build_object('operation', 'owner_signature_saved', 'signatureId', p_id));
    return jsonb_build_object('updated_at', saved_at);
end;
$$;
revoke all on function public.save_owner_signature(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_owner_signature(uuid, uuid, uuid, text, text) to service_role;
-- No browser-facing Storage policies. Neither file contents nor links enter activity logs.
commit;
