-- =====================================================================
-- Migration: 20260923000000_migration_ledger
-- Dashboard-first workflow: migrations are run manually in the SQL
-- Editor. This ledger records what has been applied, so a migration can
-- never run twice. Every later migration checks and writes this table.
--
-- Also back-fills 20260922000100_foundation (applied manually in Phase 1).
-- Check anytime:  select * from private.applied_migrations order by version;
-- =====================================================================
begin;

do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.teacher_students') is null then
    raise exception 'Foundation (20260922000100) is not applied. Run it first.';
  end if;
  if to_regclass('private.applied_migrations') is not null then
    raise exception 'Migration 20260923000000 already applied.';
  end if;
end $$;

create table private.applied_migrations (
  version     text primary key check (version ~ '^[0-9]{14}$'),
  name        text not null,
  applied_at  timestamptz not null default now()
);

comment on table private.applied_migrations is 'Manual migration ledger (Dashboard-first). Not exposed through the API.';

revoke all on private.applied_migrations from public, anon, authenticated;

insert into private.applied_migrations (version, name) values
  ('20260922000100', 'foundation'),
  ('20260923000000', 'migration_ledger');

commit;
