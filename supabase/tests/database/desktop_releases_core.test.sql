begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

select plan(50);

select has_table('public', 'desktop_releases', 'desktop_releases table exists');
select has_index('public', 'desktop_releases', 'desktop_releases_one_current', 'single-current index exists');
select has_index('public', 'desktop_releases', 'desktop_releases_lookup', 'lookup index exists');
select hasnt_table('public', 'installers', 'core migration does not require installers');
select hasnt_table('public', 'products', 'core migration does not require products');

select ok(
  exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.desktop_releases'::pg_catalog.regclass
       and conname = 'desktop_releases_unique_version'
       and contype = 'u'
  ),
  'unique platform/channel/version constraint exists'
);
select ok(
  exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.desktop_releases'::pg_catalog.regclass
       and conname = 'desktop_releases_unique_object_key'
       and contype = 'u'
  ),
  'unique object_key constraint exists'
);

select lives_ok(
  $$insert into public.desktop_releases (
      id, platform, channel, version, object_key, filename, sha256, file_size, content_type
    ) values (
      '00000000-0000-0000-0000-000000000101',
      'windows',
      'stable',
      '1.0.0',
      'installers/windows/1.0.0/Cast Director Studio Setup 1.0.0.exe',
      'Cast Director Studio Setup 1.0.0.exe',
      repeat('a', 64),
      1000000,
      'application/x-msdownload'
    )$$,
  'valid release inserts'
);

select throws_like(
  $$insert into public.desktop_releases (platform, channel, version, object_key, filename, sha256, file_size)
    values ('windows','stable','1.0','installers/windows/1.0/Cast Director Studio Setup 1.0.exe','Cast Director Studio Setup 1.0.exe',repeat('b',64),1)$$,
  '%desktop_releases_version_format%',
  'short semantic version is rejected'
);
select throws_like(
  $$insert into public.desktop_releases (platform, channel, version, object_key, filename, sha256, file_size)
    values ('windows','stable','01.0.0','installers/windows/01.0.0/Cast Director Studio Setup 01.0.0.exe','Cast Director Studio Setup 01.0.0.exe',repeat('b',64),1)$$,
  '%desktop_releases_version_format%',
  'leading-zero semantic version is rejected'
);
select throws_like(
  $$insert into public.desktop_releases (platform, channel, version, object_key, filename, sha256, file_size)
    values ('windows','stable','v1.0.0','installers/windows/v1.0.0/Cast Director Studio Setup v1.0.0.exe','Cast Director Studio Setup v1.0.0.exe',repeat('b',64),1)$$,
  '%desktop_releases_version_format%',
  'prefixed semantic version is rejected'
);
select throws_like(
  $$insert into public.desktop_releases (platform, channel, version, object_key, filename, sha256, file_size)
    values ('windows','stable','1.0.3','installers/windows/1.0.3/Cast Director Studio Setup 1.0.3.exe','Cast Director Studio Setup 1.0.3.exe',repeat('A',64),1)$$,
  '%desktop_releases_sha256_format%',
  'uppercase SHA-256 is rejected'
);
select throws_like(
  $$insert into public.desktop_releases (platform, channel, version, object_key, filename, sha256, file_size)
    values ('windows','stable','1.0.4','installers/windows/1.0.4/Cast Director Studio Setup 1.0.4.exe','Cast Director Studio Setup 1.0.4.exe','abcd',1)$$,
  '%desktop_releases_sha256_format%',
  'malformed SHA-256 is rejected'
);
select throws_like(
  $$insert into public.desktop_releases (platform, channel, version, object_key, filename, sha256, file_size)
    values ('windows','stable','1.0.5','installers/windows/1.0.5/Cast Director Studio Setup 1.0.5.exe','Cast Director Studio Setup 1.0.5.exe',repeat('b',64),0)$$,
  '%desktop_releases_file_size_range%',
  'zero file size is rejected'
);
select throws_like(
  $$insert into public.desktop_releases (platform, channel, version, object_key, filename, sha256, file_size)
    values ('windows','stable','1.0.6','installers/windows/1.0.6/Cast Director Studio Setup 1.0.6.exe','Cast Director Studio Setup 1.0.6.exe',repeat('b',64),-1)$$,
  '%desktop_releases_file_size_range%',
  'negative file size is rejected'
);
select throws_like(
  $$insert into public.desktop_releases (platform, channel, version, object_key, filename, sha256, file_size)
    values ('windows','stable','1.0.7','installers/windows/1.0.7/Cast Director Studio Setup 1.0.7.exe','Cast Director Studio Setup 1.0.7.exe',repeat('b',64),2147483649)$$,
  '%desktop_releases_file_size_range%',
  'excessive file size is rejected'
);
select throws_like(
  $$insert into public.desktop_releases (platform, channel, version, object_key, filename, sha256, file_size)
    values ('macos','stable','1.0.8','installers/macos/1.0.8/Cast Director Studio Setup 1.0.8.exe','Cast Director Studio Setup 1.0.8.exe',repeat('b',64),1)$$,
  '%desktop_releases_platform_v1%',
  'unsupported platform is rejected'
);
select throws_like(
  $$insert into public.desktop_releases (platform, channel, version, object_key, filename, sha256, file_size)
    values ('windows','beta','1.0.9','installers/windows/1.0.9/Cast Director Studio Setup 1.0.9.exe','Cast Director Studio Setup 1.0.9.exe',repeat('b',64),1)$$,
  '%desktop_releases_channel_v1%',
  'unsupported channel is rejected'
);
select throws_like(
  $$insert into public.desktop_releases (platform, channel, version, object_key, filename, sha256, file_size, content_type)
    values ('windows','stable','1.0.10','installers/windows/1.0.10/Cast Director Studio Setup 1.0.10.exe','Cast Director Studio Setup 1.0.10.exe',repeat('b',64),1,'text/plain')$$,
  '%desktop_releases_content_type_allowlist%',
  'unsupported content type is rejected'
);
select throws_like(
  $$insert into public.desktop_releases (platform, channel, version, object_key, filename, sha256, file_size)
    values ('windows','stable','1.0.11','installers/windows/1.0.11/setup.exe','setup.exe',repeat('b',64),1)$$,
  '%desktop_releases_filename_format%',
  'arbitrary filename is rejected'
);
select throws_like(
  $$insert into public.desktop_releases (platform, channel, version, object_key, filename, sha256, file_size)
    values ('windows','stable','1.0.12','installers/windows/1.0.12/../Cast Director Studio Setup 1.0.12.exe','Cast Director Studio Setup 1.0.12.exe',repeat('b',64),1)$$,
  '%desktop_releases_object_key_format%',
  'path traversal object key is rejected'
);
select throws_like(
  $$insert into public.desktop_releases (platform, channel, version, object_key, filename, sha256, file_size)
    values ('windows','stable','1.0.13','installers/windows/9.9.9/Cast Director Studio Setup 1.0.13.exe','Cast Director Studio Setup 1.0.13.exe',repeat('b',64),1)$$,
  '%desktop_releases_object_key_format%',
  'mismatched object key is rejected'
);
select throws_like(
  $$insert into public.desktop_releases (platform, channel, version, object_key, filename, sha256, file_size)
    values ('windows','stable','1.0.0','installers/windows/1.0.0/Cast Director Studio Setup 1.0.0.exe','Cast Director Studio Setup 1.0.0.exe',repeat('c',64),2)$$,
  '%duplicate key value violates unique constraint%',
  'duplicate release is rejected'
);
select throws_like(
  $$insert into public.desktop_releases (platform, channel, version, object_key, filename, sha256, file_size, is_current)
    values ('windows','stable','1.0.14','installers/windows/1.0.14/Cast Director Studio Setup 1.0.14.exe','Cast Director Studio Setup 1.0.14.exe',repeat('b',64),1,true)$$,
  '%desktop_releases_current_requires_published%',
  'current release requires published_at'
);

select throws_like(
  $$update public.desktop_releases set version = '1.0.99' where id = '00000000-0000-0000-0000-000000000101'$$,
  '%immutable%',
  'version is immutable'
);
select throws_like(
  $$update public.desktop_releases set content_type = 'application/octet-stream' where id = '00000000-0000-0000-0000-000000000101'$$,
  '%immutable%',
  'content type is immutable'
);
select lives_ok(
  $$update public.desktop_releases set release_notes = 'Updated notes' where id = '00000000-0000-0000-0000-000000000101'$$,
  'release notes remain mutable'
);

select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.desktop_releases', 'SELECT'),
  'authenticated role has table SELECT privilege'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.desktop_releases', 'INSERT'),
  'authenticated role has no table INSERT privilege'
);
select ok(
  not pg_catalog.has_table_privilege('anon', 'public.desktop_releases', 'SELECT'),
  'anon role has no table SELECT privilege'
);
select ok(
  pg_catalog.has_function_privilege('service_role', 'public.promote_desktop_release(uuid)', 'EXECUTE'),
  'service_role can execute promotion RPC'
);
select ok(
  not pg_catalog.has_function_privilege('authenticated', 'public.promote_desktop_release(uuid)', 'EXECUTE'),
  'authenticated role cannot execute promotion RPC'
);
select ok(
  not pg_catalog.has_function_privilege('anon', 'public.promote_desktop_release(uuid)', 'EXECUTE'),
  'anon role cannot execute promotion RPC'
);
select ok(
  not pg_catalog.has_function_privilege('service_role', 'public.desktop_releases_block_identity_update()', 'EXECUTE'),
  'service_role cannot directly execute trigger helper'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated","app_metadata":{"is_admin":false}}';
select is(
  (select pg_catalog.count(*) from public.desktop_releases),
  0::bigint,
  'ordinary authenticated user sees no releases'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000202","role":"authenticated","app_metadata":{"is_admin":true}}';
select is(
  (select pg_catalog.count(*) from public.desktop_releases),
  1::bigint,
  'authenticated admin can read releases'
);
reset role;

set local role service_role;
select throws_like(
  $$select public.promote_desktop_release('00000000-0000-0000-0000-000000009999'::uuid)$$,
  '%not found%',
  'missing release cannot be promoted'
);
reset role;

select lives_ok(
  $$insert into public.desktop_releases (
      id, platform, channel, version, object_key, filename, sha256, file_size, content_type
    ) values (
      '00000000-0000-0000-0000-000000000102',
      'windows',
      'stable',
      '1.0.1',
      'installers/windows/1.0.1/Cast Director Studio Setup 1.0.1.exe',
      'Cast Director Studio Setup 1.0.1.exe',
      repeat('d', 64),
      2000000,
      'application/vnd.microsoft.portable-executable'
    )$$,
  'second valid release inserts'
);

set local role service_role;
select lives_ok(
  $$select public.promote_desktop_release('00000000-0000-0000-0000-000000000101'::uuid)$$,
  'first release can be promoted'
);
reset role;
select is(
  (select is_current from public.desktop_releases where id = '00000000-0000-0000-0000-000000000101'),
  true,
  'first release is current'
);

set local role service_role;
select lives_ok(
  $$select public.promote_desktop_release('00000000-0000-0000-0000-000000000102'::uuid)$$,
  'second release can be promoted'
);
reset role;
select is(
  (select is_current from public.desktop_releases where id = '00000000-0000-0000-0000-000000000102'),
  true,
  'second release becomes current'
);
select is(
  (select pg_catalog.count(*) from public.desktop_releases where is_current),
  1::bigint,
  'exactly one release is current after promotion'
);

create temporary table desktop_release_test_timestamp as
select published_at
  from public.desktop_releases
 where id = '00000000-0000-0000-0000-000000000102';

set local role service_role;
select lives_ok(
  $$select public.promote_desktop_release('00000000-0000-0000-0000-000000000102'::uuid)$$,
  'repeated promotion is idempotent'
);
reset role;
select is(
  (select published_at from public.desktop_releases where id = '00000000-0000-0000-0000-000000000102'),
  (select published_at from desktop_release_test_timestamp),
  'repeated promotion preserves original published_at'
);

set local role service_role;
select lives_ok(
  $$select public.promote_desktop_release('00000000-0000-0000-0000-000000000101'::uuid)$$,
  'a previous release can be promoted again for rollback'
);
reset role;
select is(
  (select is_current from public.desktop_releases where id = '00000000-0000-0000-0000-000000000101'),
  true,
  'rollback makes the previous release current'
);
select is(
  (select pg_catalog.count(*) from public.desktop_releases where is_current),
  1::bigint,
  'exactly one release is current after rollback'
);
select is(
  (select pg_catalog.count(*) from public.desktop_releases),
  2::bigint,
  'release history is preserved'
);
select throws_like(
  $$insert into public.desktop_releases (
      platform, channel, version, object_key, filename, sha256, file_size, published_at, is_current
    ) values (
      'windows',
      'stable',
      '1.0.2',
      'installers/windows/1.0.2/Cast Director Studio Setup 1.0.2.exe',
      'Cast Director Studio Setup 1.0.2.exe',
      repeat('e', 64),
      3000000,
      now(),
      true
    )$$,
  '%desktop_releases_one_current%',
  'partial unique index prevents a second current release'
);

select * from finish();
rollback;
