-- =====================================================================
-- Phase 9 tests — persistent course order (migration 20261001000100). FAKE users, ROLLED BACK.
-- =====================================================================
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000901', 'p9-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000902', 'p9-b@example.invalid');
update public.profiles set role = 'teacher' where id in ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902');

insert into public.courses (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000009c1', '00000000-0000-4000-8000-000000000901', 'א'),
  ('00000000-0000-4000-8000-0000000009c2', '00000000-0000-4000-8000-000000000901', 'ב'),
  ('00000000-0000-4000-8000-0000000009c3', '00000000-0000-4000-8000-000000000901', 'ג');
insert into public.courses (id, owner_id, title) values ('00000000-0000-4000-8000-0000000009d1', '00000000-0000-4000-8000-000000000902', 'של ב');

do $$
declare r text;
begin
  -- T1 new courses are appended at the end, per owner
  select string_agg(title, ',' order by sort_order) into r from public.courses where owner_id = '00000000-0000-4000-8000-000000000901';
  if r <> 'א,ב,ג' then raise exception 'FAIL T1: %', r; end if;
  if (select sort_order from public.courses where id = '00000000-0000-4000-8000-0000000009d1') <> 1 then raise exception 'FAIL T1b: other owner starts at 1'; end if;
  raise notice 'PASS T1 new course goes last, per owner';
end $$;

-- archive the middle course: it must keep its slot
update public.courses set is_archived = true where id = '00000000-0000-4000-8000-0000000009c2';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);

do $$
declare r text;
begin
  -- T2 reorder only the visible (non-archived) ones: swap ג and א
  perform public.reorder_courses(array['00000000-0000-4000-8000-0000000009c3','00000000-0000-4000-8000-0000000009c1']::uuid[]);
  select string_agg(title, ',' order by sort_order) into r from public.courses where owner_id = '00000000-0000-4000-8000-000000000901';
  if r <> 'ג,ב,א' then raise exception 'FAIL T2: archived course must keep its slot, got %', r; end if;
  raise notice 'PASS T2 reorder keeps archived course in place';

  -- T3 slots stay a permutation (no duplicates / gaps introduced)
  if (select count(distinct sort_order) from public.courses where owner_id = '00000000-0000-4000-8000-000000000901') <> 3 then raise exception 'FAIL T3'; end if;
  raise notice 'PASS T3 slots unique';

  -- T4 cannot touch someone else's course, nor duplicate ids
  begin
    perform public.reorder_courses(array['00000000-0000-4000-8000-0000000009d1']::uuid[]);
    raise exception 'FAIL T4: foreign course accepted';
  exception when sqlstate 'P0002' then raise notice 'PASS T4 foreign course rejected'; end;
  begin
    perform public.reorder_courses(array['00000000-0000-4000-8000-0000000009c1','00000000-0000-4000-8000-0000000009c1']::uuid[]);
    raise exception 'FAIL T4b: duplicates accepted';
  exception when sqlstate '22023' then raise notice 'PASS T4b duplicates rejected'; end;

  -- T5 no direct write of sort_order
  begin
    update public.courses set sort_order = 99 where id = '00000000-0000-4000-8000-0000000009c1';
    raise exception 'FAIL T5: direct update allowed';
  exception when insufficient_privilege then raise notice 'PASS T5 sort_order is not client-writable'; end;
end $$;
rollback;
