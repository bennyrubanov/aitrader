-- ============================================================
-- AITrader database reset script (single-run clean wipe)
-- ============================================================
-- Run this first in the Supabase SQL editor to wipe public schema
-- objects/data for a fresh experiment start.
--
-- Then run:
--   1) supabase/schema.sql
--   2) supabase/rls_policies.sql
-- ============================================================

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_updated on auth.users;

do $$
declare
  obj record;
begin
  -- Drop views first.
  for obj in
    select format('%I.%I', schemaname, viewname) as ident
    from pg_views
    where schemaname = 'public'
  loop
    execute 'drop view if exists ' || obj.ident || ' cascade';
  end loop;

  -- Drop tables.
  for obj in
    select format('%I.%I', schemaname, tablename) as ident
    from pg_tables
    where schemaname = 'public'
  loop
    execute 'drop table if exists ' || obj.ident || ' cascade';
  end loop;

  -- Drop public functions/procedures.
  for obj in
    select
      format('%I.%I', n.nspname, p.proname)
      || '('
      || pg_get_function_identity_arguments(p.oid)
      || ')' as ident
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute 'drop function if exists ' || obj.ident || ' cascade';
  end loop;

  -- Drop remaining sequences.
  for obj in
    select format('%I.%I', sequence_schema, sequence_name) as ident
    from information_schema.sequences
    where sequence_schema = 'public'
  loop
    execute 'drop sequence if exists ' || obj.ident || ' cascade';
  end loop;
end $$;
