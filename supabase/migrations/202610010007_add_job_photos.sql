begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
do $$ begin
    if exists (select 1 from storage.buckets where id = 'job-photos' and public) then
        raise exception 'job-photos bucket must be private';
    end if;
end $$;

create table public.job_photos (
    id uuid primary key,
    job_id uuid not null references public.jobs(id),
    file_name text not null check (char_length(file_name) between 1 and 200),
    content_type text not null check (content_type in ('image/jpeg', 'image/png')),
    file_size bigint not null check (file_size between 1 and 10485760),
    storage_path text not null unique,
    sha256 text not null check (sha256 ~ '^[A-F0-9]{64}$'),
    uploaded_by uuid not null references public.user_profiles(id),
    uploaded_by_name text not null,
    created_at timestamptz not null default now(),
    constraint job_photo_path check (storage_path = job_id::text || '/' || id::text ||
        case content_type when 'image/jpeg' then '.jpg' else '.png' end)
);
create index job_photos_job_idx on public.job_photos(job_id, created_at desc, id desc);
alter table public.job_photos enable row level security;
revoke all on public.job_photos from public, anon, authenticated;
grant select, delete on public.job_photos to service_role;

create function public.can_access_job_photos(p_job_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.user_profiles p cross join public.jobs j
        where p.id = p_user_id and j.id = p_job_id and (
            p.role in ('owner', 'admin') or (p.role = 'employee' and exists (
                select 1 from public.employees e join public.teams t on t.id = e.team_id
                where e.id = p.employee_id and e.is_active and t.is_active and t.name = j.team
            ))
        )
    );
$$;
revoke all on function public.can_access_job_photos(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_access_job_photos(uuid, uuid) to service_role;

alter table public.activity_logs drop constraint activity_logs_action_values;
alter table public.activity_logs add constraint activity_logs_action_values
    check (action in ('created', 'updated', 'status_changed', 'quote_converted', 'document_signed',
        'receipt_uploaded', 'job_photo_uploaded'));

create function public.register_job_photo(p_id uuid, p_job_id uuid, p_file_name text,
    p_content_type text, p_file_size bigint, p_sha256 text, p_uploader_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor public.user_profiles%rowtype; job public.jobs%rowtype;
    saved public.job_photos%rowtype; extension text; assigned boolean;
begin
    select * into actor from public.user_profiles where id = p_uploader_id for share;
    if not found then raise exception 'User missing' using errcode = '42501'; end if;
    select * into job from public.jobs where id = p_job_id for share;
    if not found then raise exception 'Job missing' using errcode = '23503'; end if;
    if actor.role = 'employee' then
        select true into assigned from public.employees e join public.teams t on t.id = e.team_id
            where e.id = actor.employee_id and e.is_active and t.is_active and t.name = job.team
            for share of e, t;
        if assigned is distinct from true then
            raise exception 'Assigned team required' using errcode = '42501';
        end if;
    elsif actor.role not in ('owner', 'admin') then
        raise exception 'Role denied' using errcode = '42501';
    end if;
    extension := case p_content_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' end;
    if extension is null then raise exception 'Unsupported photo type' using errcode = '23514'; end if;
    insert into public.job_photos(id, job_id, file_name, content_type, file_size, storage_path,
        sha256, uploaded_by, uploaded_by_name)
        values (p_id, p_job_id, p_file_name, p_content_type, p_file_size,
            p_job_id::text || '/' || p_id::text || extension, p_sha256, p_uploader_id, actor.display_name)
        returning * into saved;
    insert into public.activity_logs(action, entity_type, entity_id, entity_label, actor_user_id, actor_name, details)
        values ('job_photo_uploaded', 'job', p_job_id, job.job_number, p_uploader_id, actor.display_name,
            jsonb_build_object('operation', 'job_photo_uploaded', 'photoId', p_id,
                'fileName', p_file_name, 'fileSize', p_file_size));
    return to_jsonb(saved);
end;
$$;
revoke all on function public.register_job_photo(uuid, uuid, text, text, bigint, text, uuid)
    from public, anon, authenticated;
grant execute on function public.register_job_photo(uuid, uuid, text, text, bigint, text, uuid) to service_role;
-- API-only private Storage access. No browser Storage policies or public URLs.
-- Job deletion is intentionally blocked while photos exist; no automatic loss of work evidence.
commit;
