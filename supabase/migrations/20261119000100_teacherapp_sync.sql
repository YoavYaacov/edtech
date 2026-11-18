-- =====================================================================
-- Migration: 20261119000100_teacherapp_sync   (batch 7 - sync class rosters from TeacherApp)
--
-- TeacherApp lives in the same Supabase project, schema `teacherapp` (owner-only RLS). This migration adds a
-- READ-ONLY bridge: functions in `public` (SECURITY DEFINER) read teacherapp.study_groups / students / enrollments
-- and keep a class roster in step. Nothing here ever writes to the teacherapp schema.
--
--   * Each TeacherApp study group maps to ONE class (private.ta_group_links; a group links to one class only).
--   * TeacherApp has no ID numbers (by design). Synced students arrive as roster rows WITHOUT an ID and cannot join
--     until the teacher pastes/uploads the roster with IDs (roster_add fills the ID of the same-named row) - the
--     identity check of the join flow is unchanged and cannot be skipped.
--   * Preview before approval: ta_preview() lists what would change; ta_apply() applies only what the teacher chose.
--     Kinds: add (new in TeacherApp), match (same name already in the roster -> link, keeps the ID), left (no longer
--     active in TeacherApp: teacher picks remove / keep connected), rename (name changed).
--   * Re-sync never deletes learning data: removing a joined student only removes the class membership
--     (class_students); the account, enrolment and progress stay.
--   * ta_pending() lets the app notice changes automatically (banner) without any trigger on TeacherApp tables.
--   * Access: only a teacher whose confirmed e-mail is the TeacherApp owner (teacherapp.owner_config) and who owns the
--     class. Everyone else gets reason 'not_available' and no data.
--
-- Prerequisite: 20261118000400 and the teacherapp schema. Not applied to any database by this file's author.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20261118000400') then
    raise exception 'Run 20261118000400_pending_join.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20261119000100') then
    raise exception 'Migration 20261119000100 already applied.';
  end if;
  if not exists (select 1 from information_schema.schemata where schema_name = 'teacherapp') then
    raise exception 'Schema teacherapp not found: this migration needs TeacherApp in the same project.';
  end if;
end $$;

-- ---- roster rows may exist before their ID is known ----
alter table private.class_roster alter column id_enc drop not null;
alter table private.class_roster alter column id_hash drop not null;
alter table private.class_roster add constraint class_roster_id_pair check ((id_enc is null) = (id_hash is null));
alter table private.class_roster add column ta_student_id uuid;
create unique index class_roster_ta_idx on private.class_roster (class_id, ta_student_id) where ta_student_id is not null;

create table private.ta_group_links (
  class_id    uuid primary key references public.classes (id) on delete cascade,
  ta_group_id uuid not null unique,
  owner_id    uuid not null,
  created_at  timestamptz not null default now()
);
create table private.ta_sync_ignored (
  class_id uuid not null references public.classes (id) on delete cascade,
  kind     text not null,
  ref      text not null,
  at       timestamptz not null default now(),
  primary key (class_id, kind, ref)
);
alter table private.ta_group_links  enable row level security;
alter table private.ta_sync_ignored enable row level security;
revoke all on private.ta_group_links, private.ta_sync_ignored from public, anon, authenticated;

-- ---- helpers ----
create or replace function private.name_part(p text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(lower(btrim(coalesce(p, ''))), '[\s''"׳״\-]+', ' ', 'g')
$$;
create or replace function private.name_key(p_first text, p_last text)
returns text language sql immutable set search_path = '' as $$
  select private.name_part(p_first) || '|' || private.name_part(p_last)
$$;

-- the caller is a teacher whose confirmed e-mail is the TeacherApp owner
create or replace function private.is_ta_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_teacher() and exists (
    select 1 from auth.users u join teacherapp.owner_config o on lower(o.email) = lower(u.email)
     where u.id = (select auth.uid()) and u.email_confirmed_at is not null)
$$;

-- ---- what differs between the linked TeacherApp group and the class roster ----
create or replace function private.ta_diff(p_class_id uuid)
returns table (kind text, key text, ta_student_id uuid, roster_id uuid, name text, new_first text, new_last text,
               claimed boolean, ambiguous boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_group uuid;
begin
  select l.ta_group_id into v_group from private.ta_group_links l where l.class_id = p_class_id;
  if v_group is null then return; end if;
  return query
  with ta as (
    select s.id, s.first_name as f, s.last_name as l, private.name_key(s.first_name, s.last_name) as k,
           (s.archived_at is null and g.archived_at is null and bool_or(e.left_at is null)) as active
      from teacherapp.enrollments e
      join teacherapp.students s on s.id = e.student_id
      join teacherapp.study_groups g on g.id = e.group_id
     where e.group_id = v_group
     group by s.id, s.first_name, s.last_name, s.archived_at, g.archived_at
  ),
  ros as (select r.* from private.class_roster r where r.class_id = p_class_id),
  fresh as (   -- active TeacherApp students that no roster row is linked to
    select t.* from ta t where t.active and not exists (select 1 from ros r where r.ta_student_id = t.id)
  ),
  cand as (    -- same-name, not yet linked roster rows
    select f.id as tid, count(r.id) as n_roster, min(r.id::text)::uuid as one_roster
      from fresh f left join ros r on r.ta_student_id is null and private.name_key(r.first_name, r.last_name) = f.k
     group by f.id
  ),
  samekey as (select f.id as tid, (select count(*) from fresh f2 where f2.k = f.k) as n_ta from fresh f),
  items as (
    select case when c.n_roster = 1 and s.n_ta = 1 then 'match'
                when c.n_roster = 0 then 'add'
                else 'ambiguous' end as kind,
           f.id::text as key, f.id as ta_student_id,
           case when c.n_roster = 1 and s.n_ta = 1 then c.one_roster end as roster_id,
           (f.l || ' ' || f.f) as name, f.f as new_first, f.l as new_last, false as claimed,
           (s.n_ta > 1 or c.n_roster > 1) as ambiguous
      from fresh f join cand c on c.tid = f.id join samekey s on s.tid = f.id
    union all
    select 'left', r.id::text, r.ta_student_id, r.id, (r.last_name || ' ' || r.first_name), null::text, null::text,
           r.user_id is not null, false
      from ros r
     where r.ta_student_id is not null and not exists (select 1 from ta t where t.id = r.ta_student_id and t.active)
    union all
    select 'rename', r.ta_student_id::text || ':' || t.k, r.ta_student_id, r.id, (r.last_name || ' ' || r.first_name),
           t.f, t.l, r.user_id is not null, false
      from ros r join ta t on t.id = r.ta_student_id and t.active
     where private.name_key(r.first_name, r.last_name) <> t.k
  )
  select i.kind, i.key, i.ta_student_id, i.roster_id, i.name, i.new_first, i.new_last, i.claimed, i.ambiguous
    from items i
   where not exists (select 1 from private.ta_sync_ignored x where x.class_id = p_class_id and x.kind = i.kind and x.ref = i.key)
   order by i.kind, i.name;
end $$;

-- ---------------- teacher RPCs ----------------
-- TeacherApp groups the teacher can link, and which class each one is already linked to.
create or replace function public.ta_groups()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_ta_owner() then return jsonb_build_object('ok', false, 'reason', 'not_available'); end if;
  return jsonb_build_object('ok', true, 'groups', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.name, 'subject', g.subject, 'grade_level', g.grade_level,
      'students', (select count(distinct e.student_id) from teacherapp.enrollments e
                    join teacherapp.students s on s.id = e.student_id
                   where e.group_id = g.id and e.left_at is null and s.archived_at is null),
      'class_id', l.class_id) order by g.name)
    from teacherapp.study_groups g left join private.ta_group_links l on l.ta_group_id = g.id
   where g.archived_at is null), '[]'::jsonb));
end $$;

-- Link a group to a class of the subject: a new class (named like the group) or an existing, not yet linked one.
create or replace function public.ta_link_group(p_course_id uuid, p_group_id uuid, p_class_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_name text; v_class uuid := p_class_id;
begin
  if not private.is_ta_owner() then return jsonb_build_object('ok', false, 'reason', 'not_available'); end if;
  if not private.owns_course(p_course_id) then raise exception 'Course not found' using errcode = 'P0002'; end if;
  select g.name into v_name from teacherapp.study_groups g where g.id = p_group_id and g.archived_at is null;
  if v_name is null then return jsonb_build_object('ok', false, 'reason', 'group_not_found'); end if;
  if exists (select 1 from private.ta_group_links where ta_group_id = p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'already_linked');
  end if;
  if v_class is not null then
    if not exists (select 1 from public.classes c where c.id = v_class and c.course_id = p_course_id and c.owner_id = v_uid) then
      raise exception 'Class not found' using errcode = 'P0002';
    end if;
    if exists (select 1 from private.ta_group_links where class_id = v_class) then
      return jsonb_build_object('ok', false, 'reason', 'class_linked');
    end if;
  else
    insert into public.classes (owner_id, course_id, title) values (v_uid, p_course_id, left(btrim(v_name), 120))
    returning id into v_class;
  end if;
  insert into private.ta_group_links (class_id, ta_group_id, owner_id) values (v_class, p_group_id, v_uid);
  return jsonb_build_object('ok', true, 'class_id', v_class);
end $$;

-- Stop syncing. Students and roster rows stay; only the TeacherApp references are dropped.
create or replace function public.ta_unlink(p_class_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_teacher() or not private.owns_class(p_class_id) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  delete from private.ta_group_links where class_id = p_class_id;
  delete from private.ta_sync_ignored where class_id = p_class_id;
  update private.class_roster set ta_student_id = null where class_id = p_class_id;
  return jsonb_build_object('ok', true);
end $$;

-- Preview: nothing is changed.
create or replace function public.ta_preview(p_class_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_group uuid; v_gname text;
begin
  if not private.is_ta_owner() then return jsonb_build_object('ok', false, 'reason', 'not_available'); end if;
  if not private.owns_class(p_class_id) then raise exception 'Class not found' using errcode = 'P0002'; end if;
  select l.ta_group_id into v_group from private.ta_group_links l where l.class_id = p_class_id;
  if v_group is null then return jsonb_build_object('ok', false, 'reason', 'not_linked'); end if;
  select g.name into v_gname from teacherapp.study_groups g where g.id = v_group;
  return jsonb_build_object('ok', true, 'group', v_gname,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'kind', d.kind, 'key', d.key, 'name', d.name,
        'new_name', case when d.new_first is null then null else d.new_last || ' ' || d.new_first end,
        'claimed', d.claimed, 'ambiguous', d.ambiguous))
      from private.ta_diff(p_class_id) d), '[]'::jsonb),
    'linked', (select count(*) from private.class_roster r where r.class_id = p_class_id and r.ta_student_id is not null),
    'without_id', (select count(*) from private.class_roster r where r.class_id = p_class_id and r.id_hash is null));
end $$;

-- Apply the teacher's decisions: [{kind, key, action}]. Server re-computes the diff; anything not currently
-- in it (stale, tampered) is skipped. Actions: apply (add/match/rename), remove | keep (left), ignore (any).
create or replace function public.ta_apply(p_class_id uuid, p_decisions jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d jsonb; v record; v_action text; v_applied int := 0; v_ignored int := 0; v_skipped int := 0;
begin
  if not private.is_ta_owner() then return jsonb_build_object('ok', false, 'reason', 'not_available'); end if;
  if not private.owns_class(p_class_id) then raise exception 'Class not found' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_decisions) is distinct from 'array' or jsonb_array_length(p_decisions) > 400 then
    raise exception 'Invalid decisions' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('ta_apply:' || p_class_id::text));

  for d in select * from jsonb_array_elements(p_decisions) loop
    v_action := d ->> 'action';
    select * into v from private.ta_diff(p_class_id) x where x.kind = d ->> 'kind' and x.key = d ->> 'key';
    if not found then v_skipped := v_skipped + 1; continue; end if;

    if v_action in ('ignore', 'keep') or (v_action is null) then
      insert into private.ta_sync_ignored (class_id, kind, ref) values (p_class_id, v.kind, v.key) on conflict do nothing;
      v_ignored := v_ignored + 1;

    elsif v.kind = 'add' and v_action = 'apply' then
      if char_length(btrim(v.new_first)) not between 1 and 40 or char_length(btrim(v.new_last)) not between 1 and 40
         or v.new_first ~ '[<>\u0001-\u001f\u007f]' or v.new_last ~ '[<>\u0001-\u001f\u007f]' then
        v_skipped := v_skipped + 1; continue;
      end if;
      insert into private.class_roster (class_id, first_name, last_name, ta_student_id)
      values (p_class_id, regexp_replace(btrim(v.new_first), '\s+', ' ', 'g'), regexp_replace(btrim(v.new_last), '\s+', ' ', 'g'), v.ta_student_id)
      on conflict do nothing;
      v_applied := v_applied + 1;

    elsif v.kind = 'match' and v_action = 'apply' then
      update private.class_roster set ta_student_id = v.ta_student_id where id = v.roster_id and ta_student_id is null;
      v_applied := v_applied + 1;

    elsif v.kind = 'rename' and v_action = 'apply' then
      if char_length(btrim(v.new_first)) not between 1 and 40 or char_length(btrim(v.new_last)) not between 1 and 40
         or v.new_first ~ '[<>\u0001-\u001f\u007f]' or v.new_last ~ '[<>\u0001-\u001f\u007f]' then
        v_skipped := v_skipped + 1; continue;
      end if;
      update private.class_roster set first_name = regexp_replace(btrim(v.new_first), '\s+', ' ', 'g'),
             last_name = regexp_replace(btrim(v.new_last), '\s+', ' ', 'g') where id = v.roster_id;
      v_applied := v_applied + 1;

    elsif v.kind = 'left' and v_action = 'remove' then
      -- a joined student leaves the class only (account, enrolment and progress are untouched)
      delete from public.class_students cs
       using private.class_roster r where r.id = v.roster_id and cs.class_id = p_class_id and cs.student_id = r.user_id;
      delete from private.class_roster where id = v.roster_id;
      v_applied := v_applied + 1;

    else
      v_skipped := v_skipped + 1;   -- e.g. ambiguous rows have no automatic action
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'applied', v_applied, 'ignored', v_ignored, 'skipped', v_skipped);
end $$;

-- What the app shows automatically: classes with open changes, and TeacherApp groups with no class yet.
create or replace function public.ta_pending()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if not private.is_ta_owner() then return jsonb_build_object('ok', false, 'reason', 'not_available'); end if;
  return jsonb_build_object('ok', true,
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object('class_id', x.class_id, 'course_id', x.course_id, 'title', x.title, 'pending', x.n)
                       order by x.title)
        from (select c.id as class_id, c.course_id, c.title, (select count(*) from private.ta_diff(c.id) dd where dd.kind <> 'ambiguous') as n
                from public.classes c join private.ta_group_links l on l.class_id = c.id
               where c.owner_id = v_uid) x
       where x.n > 0), '[]'::jsonb),
    'unlinked_groups', (select count(*) from teacherapp.study_groups g
                         where g.archived_at is null and not exists (select 1 from private.ta_group_links l where l.ta_group_id = g.id)));
end $$;

-- ---------------- roster functions, redefined: rows without an ID ----------------
-- roster_add: a row whose name matches exactly one roster row that still has no ID fills that row's ID
-- (this is how a synced student gets the ID from the pasted/uploaded list).
create or replace function public.roster_add(p_class_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; i int := 0; v_added int := 0; v_filled int := 0; v_errors jsonb := '[]'::jsonb;
  v_first text; v_last text; v_id text; v_hash bytea; v_match uuid; v_n int;
begin
  if not private.is_teacher() or not private.owns_class(p_class_id) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 300 then
    raise exception 'Invalid rows' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    v_first := regexp_replace(btrim(coalesce(r ->> 'first', '')), '\s+', ' ', 'g');
    v_last  := regexp_replace(btrim(coalesce(r ->> 'last',  '')), '\s+', ' ', 'g');
    v_id    := regexp_replace(coalesce(r ->> 'id', ''), '[\s-]', '', 'g');
    if char_length(v_first) not between 1 and 40 or char_length(v_last) not between 1 and 40
       or v_first ~ '[<>\u0001-\u001f\u007f]' or v_last ~ '[<>\u0001-\u001f\u007f]' then
      v_errors := v_errors || jsonb_build_object('row', i, 'reason', 'invalid_name'); continue;
    end if;
    if not private.is_valid_il_id(v_id) then
      v_errors := v_errors || jsonb_build_object('row', i, 'reason', 'invalid_id'); continue;
    end if;
    v_id := lpad(v_id, 9, '0');
    v_hash := private.id_blind_index(v_id);
    begin
      select count(*), min(x.id::text)::uuid into v_n, v_match
        from private.class_roster x
       where x.class_id = p_class_id and x.id_hash is null and private.name_key(x.first_name, x.last_name) = private.name_key(v_first, v_last);
      if v_n > 1 then
        v_errors := v_errors || jsonb_build_object('row', i, 'reason', 'ambiguous'); continue;
      elsif v_n = 1 then
        update private.class_roster set id_enc = extensions.pgp_sym_encrypt(v_id, private.identity_key()), id_hash = v_hash
         where id = v_match;
        v_filled := v_filled + 1;
      else
        insert into private.class_roster (class_id, first_name, last_name, id_enc, id_hash)
        values (p_class_id, v_first, v_last, extensions.pgp_sym_encrypt(v_id, private.identity_key()), v_hash);
        v_added := v_added + 1;
      end if;
    exception when unique_violation then
      v_errors := v_errors || jsonb_build_object('row', i, 'reason', 'duplicate');
    end;
  end loop;
  return jsonb_build_object('added', v_added, 'filled', v_filled, 'errors', v_errors);
end $$;

create or replace function public.roster_list(p_class_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_teacher() or not private.owns_class(p_class_id) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'first_name', r.first_name, 'last_name', r.last_name,
      'id_masked', case when r.id_enc is null then null
                        else '••••••' || right(extensions.pgp_sym_decrypt(r.id_enc, private.identity_key()), 3) end,
      'needs_id', r.id_enc is null,
      'from_ta', r.ta_student_id is not null,
      'claimed', r.user_id is not null) order by r.last_name, r.first_name)
    from private.class_roster r where r.class_id = p_class_id), '[]'::jsonb);
end $$;

-- students only see names that can actually be verified (rows that already have an ID)
create or replace function public.roster_for_join(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  select * into s from private.link_state(p_token);
  if s.status is distinct from 'ok' then return jsonb_build_object('status', coalesce(s.status, 'invalid')); end if;
  return jsonb_build_object('status', 'ok', 'class_title', s.class_title, 'course_title', s.course_title,
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.first_name || ' ' || r.last_name)
                                           order by r.last_name, r.first_name)
                            from private.class_roster r
                           where r.class_id = s.class_id and r.user_id is null and r.id_hash is not null), '[]'::jsonb));
end $$;

create or replace function public.verify_roster_entry(p_token text, p_roster_id uuid, p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s record; r record; v_id text := regexp_replace(coalesce(p_id, ''), '[\s-]', '', 'g'); v_ticket text;
begin
  select * into s from private.link_state(p_token);
  if s.status is distinct from 'ok' then return jsonb_build_object('ok', false, 'reason', coalesce(s.status, 'invalid')); end if;
  select * into r from private.class_roster
   where id = p_roster_id and class_id = s.class_id and user_id is null and id_hash is not null;
  if not found then return jsonb_build_object('ok', false, 'reason', 'wrong'); end if;

  if (select count(*) from private.roster_attempts where roster_id = r.id and at > now() - interval '1 hour') >= 5
     or (select count(*) from private.roster_attempts where link_id = s.link_id and at > now() - interval '1 hour') >= 40 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  if not private.is_valid_il_id(v_id) or private.id_blind_index(lpad(v_id, 9, '0')) is distinct from r.id_hash then
    insert into private.roster_attempts (roster_id, link_id) values (r.id, s.link_id);
    return jsonb_build_object('ok', false, 'reason', 'wrong');
  end if;

  delete from private.roster_tickets where roster_id = r.id or expires_at < now();
  v_ticket := encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.roster_tickets (ticket_hash, roster_id, link_id, expires_at)
  values (extensions.digest(v_ticket, 'sha256'), r.id, s.link_id, now() + interval '30 minutes');
  return jsonb_build_object('ok', true, 'ticket', v_ticket, 'name', r.first_name || ' ' || r.last_name);
end $$;

-- ---------------- privileges ----------------
revoke all on function private.name_part(text), private.name_key(text, text), private.is_ta_owner(),
  private.ta_diff(uuid) from public, anon, authenticated;
revoke all on function
  public.ta_groups(), public.ta_link_group(uuid, uuid, uuid), public.ta_unlink(uuid), public.ta_preview(uuid),
  public.ta_apply(uuid, jsonb), public.ta_pending(), public.roster_add(uuid, jsonb), public.roster_list(uuid),
  public.roster_for_join(text), public.verify_roster_entry(text, uuid, text)
  from public, anon;
grant execute on function
  public.ta_groups(), public.ta_link_group(uuid, uuid, uuid), public.ta_unlink(uuid), public.ta_preview(uuid),
  public.ta_apply(uuid, jsonb), public.ta_pending(), public.roster_add(uuid, jsonb), public.roster_list(uuid)
  to authenticated;
grant execute on function public.roster_for_join(text), public.verify_roster_entry(text, uuid, text) to anon, authenticated;

insert into private.applied_migrations (version, name) values ('20261119000100', 'teacherapp_sync');

commit;
