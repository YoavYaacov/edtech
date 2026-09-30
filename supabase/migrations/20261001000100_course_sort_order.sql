-- =====================================================================
-- Migration: 20261001000100_course_sort_order
-- Production Acceptance Fix 7 — the teacher can define a persistent order of his courses.
--
--   courses.sort_order (int, per owner)
--     * backfill: 1..n by created_at (the order the courses are shown in today) — backward compatible,
--       updated_at is NOT bumped.
--     * a NEW course gets max(sort_order)+1 of its owner (= the end), by trigger; clients never set it.
--   public.reorder_courses(p_ids uuid[])
--     * the caller must own every id. The ids are re-assigned, in the given order, the SAME set of slots they occupied
--       before. Courses that are not in the list (e.g. hidden archived ones) keep their slot, so they never break
--       the order. Clients get no direct UPDATE privilege on sort_order.
--   Nothing here touches assignments, snapshots, questions or variants.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20260930000400') then
    raise exception 'Run 20260930000400_language_resolution.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20261001000100') then
    raise exception 'Migration 20261001000100 already applied.';
  end if;
end $$;

alter table public.courses add column sort_order integer;

alter table public.courses disable trigger courses_set_updated_at;
update public.courses c set sort_order = r.rn
from (select id, row_number() over (partition by owner_id order by created_at, id) as rn from public.courses) r
where r.id = c.id;
alter table public.courses enable trigger courses_set_updated_at;

alter table public.courses alter column sort_order set not null;
create index courses_owner_sort_idx on public.courses (owner_id, sort_order);

create or replace function private.set_course_sort_order()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.sort_order := coalesce((select max(sort_order) from public.courses where owner_id = new.owner_id), 0) + 1;
  return new;
end;
$$;
revoke all on function private.set_course_sort_order() from public;
create trigger courses_set_sort_order before insert on public.courses
  for each row execute function private.set_course_sort_order();

create or replace function public.reorder_courses(p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_slots integer[];
  v_n     integer := coalesce(array_length(p_ids, 1), 0);
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if v_n = 0 then return; end if;
  if (select count(distinct x) from unnest(p_ids) x) <> v_n then
    raise exception 'duplicate course ids' using errcode = '22023';
  end if;
  if (select count(*) from public.courses where id = any (p_ids) and owner_id = v_uid) <> v_n then
    raise exception 'course not found' using errcode = 'P0002';
  end if;

  select array_agg(sort_order order by sort_order) into v_slots
  from public.courses where id = any (p_ids) and owner_id = v_uid;

  -- lock then reassign the same slots in the requested order
  perform 1 from public.courses where id = any (p_ids) for update;
  update public.courses c set sort_order = v_slots[o.ord]
  from unnest(p_ids) with ordinality as o(id, ord)
  where c.id = o.id and c.owner_id = v_uid and c.sort_order is distinct from v_slots[o.ord];
end;
$$;
revoke all on function public.reorder_courses(uuid[]) from public, anon;
grant execute on function public.reorder_courses(uuid[]) to authenticated;

insert into private.applied_migrations (version, name) values ('20261001000100', 'course_sort_order');

commit;
