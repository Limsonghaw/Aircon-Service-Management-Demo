do $$
begin
    if not exists (select from pg_roles where rolname = 'anon') then
        create role anon;
    end if;
    if not exists (select from pg_roles where rolname = 'authenticated') then
        create role authenticated;
    end if;
    if not exists (select from pg_roles where rolname = 'service_role') then
        create role service_role bypassrls;
    end if;
end;
$$;

create schema auth;
create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb default '{}',
    created_at timestamptz default now()
);
create schema storage;
create table storage.buckets (
    id text primary key,
    name text,
    public boolean,
    file_size_limit bigint,
    allowed_mime_types text[]
);
create table storage.objects (bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema public to anon, authenticated, service_role;
