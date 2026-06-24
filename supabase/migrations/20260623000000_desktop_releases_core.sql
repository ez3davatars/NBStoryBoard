-- Core desktop release registry for immutable, versioned Windows releases.
-- Legacy products/installers compatibility is intentionally deferred.

create table public.desktop_releases (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  platform text not null,
  channel text not null default 'stable',
  version text not null,
  object_key text not null,
  filename text not null,
  sha256 text not null,
  file_size bigint not null,
  content_type text not null default 'application/octet-stream',
  release_notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  published_at timestamptz,
  is_current boolean not null default false,

  constraint desktop_releases_platform_v1
    check (platform = 'windows'),
  constraint desktop_releases_channel_v1
    check (channel = 'stable'),
  constraint desktop_releases_version_format
    check (version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'),
  constraint desktop_releases_sha256_format
    check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint desktop_releases_file_size_range
    check (file_size > 0 and file_size <= 2147483648),
  constraint desktop_releases_filename_format
    check (filename = 'Cast Director Studio Setup ' || version || '.exe'),
  constraint desktop_releases_object_key_format
    check (object_key = 'installers/' || platform || '/' || version || '/' || filename),
  constraint desktop_releases_content_type_allowlist
    check (content_type in (
      'application/octet-stream',
      'application/x-msdownload',
      'application/vnd.microsoft.portable-executable'
    )),
  constraint desktop_releases_current_requires_published
    check (not is_current or published_at is not null),
  constraint desktop_releases_unique_version
    unique (platform, channel, version),
  constraint desktop_releases_unique_object_key
    unique (object_key)
);

comment on table public.desktop_releases is
  'Immutable versioned desktop installers. Exactly one current release is allowed per platform and channel.';

create unique index desktop_releases_one_current
  on public.desktop_releases (platform, channel)
  where is_current;

create index desktop_releases_lookup
  on public.desktop_releases (platform, channel, is_current);

create or replace function public.desktop_releases_block_identity_update()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if row(
    new.platform,
    new.channel,
    new.version,
    new.object_key,
    new.filename,
    new.sha256,
    new.file_size,
    new.content_type,
    new.created_by,
    new.created_at
  ) is distinct from row(
    old.platform,
    old.channel,
    old.version,
    old.object_key,
    old.filename,
    old.sha256,
    old.file_size,
    old.content_type,
    old.created_by,
    old.created_at
  ) then
    raise exception using
      errcode = '22023',
      message = 'desktop_releases identity and artifact columns are immutable';
  end if;

  return new;
end;
$function$;

create trigger desktop_releases_immutable
before update on public.desktop_releases
for each row
execute function public.desktop_releases_block_identity_update();

alter table public.desktop_releases enable row level security;

create policy desktop_releases_admin_select
on public.desktop_releases
for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');

create or replace function public.promote_desktop_release(p_release_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_platform text;
  v_channel text;
begin
  select dr.platform, dr.channel
    into v_platform, v_channel
    from public.desktop_releases as dr
   where dr.id = p_release_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = pg_catalog.format('promote_desktop_release: release %s not found', p_release_id);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_platform || '|' || v_channel, 0)
  );

  -- Serialize row-level updates after obtaining the advisory lock.
  perform 1
    from public.desktop_releases as dr
   where dr.platform = v_platform
     and dr.channel = v_channel
   for update;

  -- Re-read after the lock in case the target changed concurrently.
  select dr.platform, dr.channel
    into v_platform, v_channel
    from public.desktop_releases as dr
   where dr.id = p_release_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = pg_catalog.format('promote_desktop_release: release %s not found', p_release_id);
  end if;

  update public.desktop_releases as dr
     set is_current = false
   where dr.platform = v_platform
     and dr.channel = v_channel
     and dr.is_current
     and dr.id <> p_release_id;

  update public.desktop_releases as dr
     set is_current = true,
         published_at = coalesce(dr.published_at, pg_catalog.now())
   where dr.id = p_release_id;
end;
$function$;

revoke all on table public.desktop_releases from anon, authenticated;
grant select on table public.desktop_releases to authenticated;
grant all on table public.desktop_releases to service_role;

revoke execute on function public.promote_desktop_release(uuid) from public, anon, authenticated, service_role;
grant execute on function public.promote_desktop_release(uuid) to service_role;
revoke execute on function public.desktop_releases_block_identity_update() from public, anon, authenticated, service_role;
