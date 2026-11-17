-- =====================================================================
-- Migration: 20261118000300_class_roster   (batch 4b - join by class roster)
--
-- Flow the teacher asked for:
--   1. The teacher keeps a ROSTER per class (first name, last name, ID number) and shares the class join link.
--   2. A student opens the link, picks their own name from the list and types their ID number.
--   3. Only if the ID matches that roster row does the student get a short-lived, single-use ticket and may then
--      create an account (email + password) or sign in.
--   4. The signed-in student redeems the ticket (claim_roster): the account is linked to the roster row, the ID is
--      stored (encrypted) as the student's identity, and the student joins the class.
--
-- Security notes:
--   * Roster rows live in the non-exposed `private` schema (RLS on, no grants). IDs are stored encrypted + HMAC blind index,
--     exactly like private.student_identity.
--   * The anonymous list shows names only, only of students who have not claimed yet, and only for a valid (not revoked,
--     expired or full) link. It never shows IDs.
--   * verify_roster_entry is rate limited per roster row (5 failures/hour) and per link (40/hour); every failure
--     returns the same generic reason, so it cannot be used to probe.
--   * The ID alone is never a login or proof of identity; it only unlocks a ticket for one roster row.
--   * Account creation itself happens in Supabase Auth and cannot be gated by SQL: an account created without a
--     valid ticket is a plain student with no class and no data.
--   * Class separation is unchanged: the roster row fixes which class is joined, nothing comes from the browser.
--
-- Prerequisite: 20261118000200. Not applied to any database by this file's author.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20261118000200') then
    raise exception 'Run 20261118000200_class_board.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20261118000300') then
    raise exception 'Migration 20261118000300 already applied.';
  end if;
end $$;

create table private.class_roster (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes (id) on delete restrict,
  first_name  text not null check (char_length(first_name) between 1 and 40),
  last_name   text not null check (char_length(last_name) between 1 and 40),
  id_enc      bytea not null,
  id_hash     bytea not null,
  user_id     uuid references public.profiles (id) on delete set null,
  claimed_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (class_id, id_hash)
);
create index class_roster_class_idx on private.class_roster (class_id);
create table private.roster_attempts (
  id         bigint generated always as identity primary key,
  roster_id  uuid not null references private.class_roster (id) on delete cascade,
  link_id    uuid not null,
  at         timestamptz not null default now()
);
create index roster_attempts_roster_idx on private.roster_attempts (roster_id, at desc);
create index roster_attempts_link_idx on private.roster_attempts (link_id, at desc);
create table private.roster_tickets (
  ticket_hash  bytea primary key,
  roster_id    uuid not null references private.class_roster (id) on delete cascade,
  link_id      uuid not null,
  expires_at   timestamptz not null,
  used_at      timestamptz
);
alter table private.class_roster    enable row level security;
alter table private.roster_attempts enable row level security;
alter table private.roster_tickets  enable row level security;
revoke all on private.class_roster, private.roster_attempts, private.roster_tickets from public, anon, authenticated;

-- link state shared by the anonymous functions
create or replace function private.link_state(p_token text)
returns table (link_id uuid, class_id uuid, class_title text, course_title text, status text)
language plpgsql stable security definer set search_path = '' as $$
declare l record;
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then
    return query select null::uuid, null::uuid, null::text, null::text, 'invalid'::text; return;
  end if;
  select l2.id, l2.class_id, l2.revoked_at, l2.expires_at, l2.max_uses, l2.uses, c.title as ct, co.title as cot, co.is_archived as arch
    into l
    from public.class_join_links l2 join public.classes c on c.id = l2.class_id join public.courses co on co.id = c.course_id
   where l2.token = p_token;
  if not found or l.arch then
    return query select null::uuid, null::uuid, null::text, null::text, 'invalid'::text; return;
  end if;
  return query select l.id, l.class_id, l.ct, l.cot,
    case when l.revoked_at is not null then 'revoked'
         when l.expires_at <= now() then 'expired'
         when l.max_uses is not null and l.uses >= l.max_uses then 'full'
         else 'ok' end;
end $$;

-- ---------------- teacher ----------------
create or replace function public.roster_add(p_class_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; i int := 0; v_added int := 0; v_errors jsonb := '[]'::jsonb;
  v_first text; v_last text; v_id text; v_hash bytea;
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
      insert into private.class_roster (class_id, first_name, last_name, id_enc, id_hash)
      values (p_class_id, v_first, v_last, extensions.pgp_sym_encrypt(v_id, private.identity_key()), v_hash);
      v_added := v_added + 1;
    exception when unique_violation then
      v_errors := v_errors || jsonb_build_object('row', i, 'reason', 'duplicate');
    end;
  end loop;
  return jsonb_build_object('added', v_added, 'errors', v_errors);
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
      'id_masked', '••••••' || right(extensions.pgp_sym_decrypt(r.id_enc, private.identity_key()), 3),
      'claimed', r.user_id is not null) order by r.last_name, r.first_name)
    from private.class_roster r where r.class_id = p_class_id), '[]'::jsonb);
end $$;

create or replace function public.roster_remove(p_roster_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_class uuid; v_user uuid;
begin
  select class_id, user_id into v_class, v_user from private.class_roster where id = p_roster_id for update;
  if v_class is null or not private.is_teacher() or not private.owns_class(v_class) then
    raise exception 'Roster entry not found' using errcode = 'P0002';
  end if;
  -- a student who already joined is removed from the class with the normal member action, not from here
  if v_user is not null then return jsonb_build_object('ok', false, 'reason', 'claimed'); end if;
  delete from private.class_roster where id = p_roster_id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------- anonymous / student ----------------
-- Names only, unclaimed only, valid link only.
create or replace function public.roster_for_join(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  select * into s from private.link_state(p_token);
  if s.status is distinct from 'ok' then return jsonb_build_object('status', coalesce(s.status, 'invalid')); end if;
  return jsonb_build_object('status', 'ok', 'class_title', s.class_title, 'course_title', s.course_title,
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.first_name || ' ' || r.last_name)
                                           order by r.last_name, r.first_name)
                            from private.class_roster r where r.class_id = s.class_id and r.user_id is null), '[]'::jsonb));
end $$;

create or replace function public.verify_roster_entry(p_token text, p_roster_id uuid, p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s record; r record; v_id text := regexp_replace(coalesce(p_id, ''), '[\s-]', '', 'g'); v_ticket text;
begin
  select * into s from private.link_state(p_token);
  if s.status is distinct from 'ok' then return jsonb_build_object('ok', false, 'reason', coalesce(s.status, 'invalid')); end if;
  select * into r from private.class_roster where id = p_roster_id and class_id = s.class_id and user_id is null;
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

create or replace function public.claim_roster(p_ticket text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_role text; t record; r record; s record; v_link record;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'student' then return jsonb_build_object('ok', false, 'reason', 'not_student'); end if;
  if p_ticket is null or char_length(p_ticket) <> 48 then return jsonb_build_object('ok', false, 'reason', 'ticket_invalid'); end if;

  select * into t from private.roster_tickets
   where ticket_hash = extensions.digest(p_ticket, 'sha256') for update;
  if not found or t.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'ticket_invalid'); end if;
  select * into r from private.class_roster where id = t.roster_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'ticket_invalid'); end if;

  if t.used_at is not null then
    -- the same student redeeming twice is fine; anyone else is not
    if r.user_id = v_uid then return jsonb_build_object('ok', true, 'status', 'already_member', 'class_id', r.class_id); end if;
    return jsonb_build_object('ok', false, 'reason', 'ticket_invalid');
  end if;
  if r.user_id is not null and r.user_id <> v_uid then return jsonb_build_object('ok', false, 'reason', 'taken'); end if;

  select l.id, l.revoked_at, l.expires_at, l.max_uses, l.uses into v_link
    from public.class_join_links l where l.id = t.link_id for update;
  if not found or v_link.revoked_at is not null then return jsonb_build_object('ok', false, 'reason', 'revoked'); end if;
  if v_link.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if v_link.max_uses is not null and v_link.uses >= v_link.max_uses then return jsonb_build_object('ok', false, 'reason', 'full'); end if;

  begin
    if exists (select 1 from private.student_identity where user_id = v_uid and id_hash <> r.id_hash) then
      raise exception using errcode = 'P0001', message = 'identity_locked';
    end if;
    -- class separation rules (one class per subject, archived relationships) are enforced by the same helper as before
    declare v_why text; begin
      v_why := private.enroll_into_class(r.class_id, v_uid);
      if v_why is not null then raise exception using errcode = 'P0001', message = v_why; end if;
    end;
    insert into private.student_identity (user_id, id_enc, id_hash) values (v_uid, r.id_enc, r.id_hash)
    on conflict (user_id) do nothing;
    update public.profiles set first_name = r.first_name, last_name = r.last_name,
           full_name = r.first_name || ' ' || r.last_name where id = v_uid;
    update private.class_roster set user_id = v_uid, claimed_at = now() where id = r.id;
    update private.roster_tickets set used_at = now() where ticket_hash = t.ticket_hash;
    update public.class_join_links set uses = uses + 1 where id = v_link.id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'id_in_use');   -- this ID already belongs to another account
    when sqlstate 'P0001' then
      return jsonb_build_object('ok', false, 'reason', sqlerrm);
  end;
  return jsonb_build_object('ok', true, 'status', 'joined', 'class_id', r.class_id);
end $$;

-- ---------------- delete_class v5: also removes the roster ----------------
create or replace function public.delete_class(p_class_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_course uuid; v_members int; v_statuses int;
begin
  select course_id into v_course from public.classes where id = p_class_id for update;
  if v_course is null or not private.owns_course(v_course) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  delete from private.class_roster where class_id = p_class_id;   -- cascades to attempts and tickets
  delete from public.class_post_comments where post_id in (select id from public.class_posts where class_id = p_class_id);
  delete from public.class_posts where class_id = p_class_id;
  delete from public.class_join_requests where class_id = p_class_id;
  delete from public.class_join_links where class_id = p_class_id;
  delete from public.lesson_early_access where class_id = p_class_id;
  delete from public.topic_study_status where class_id = p_class_id;
  get diagnostics v_statuses = row_count;
  delete from public.class_students where class_id = p_class_id;
  get diagnostics v_members = row_count;
  delete from public.classes where id = p_class_id;
  return jsonb_build_object('deleted', true, 'members', v_members, 'statuses', v_statuses);
end $$;

-- ---------------- privileges ----------------
revoke all on function private.link_state(text) from public, anon, authenticated;
revoke all on function
  public.roster_add(uuid, jsonb), public.roster_list(uuid), public.roster_remove(uuid),
  public.roster_for_join(text), public.verify_roster_entry(text, uuid, text), public.claim_roster(text),
  public.delete_class(uuid)
  from public, anon;
grant execute on function
  public.roster_add(uuid, jsonb), public.roster_list(uuid), public.roster_remove(uuid), public.claim_roster(text),
  public.delete_class(uuid)
  to authenticated;
grant execute on function public.roster_for_join(text), public.verify_roster_entry(text, uuid, text) to anon, authenticated;

insert into private.applied_migrations (version, name) values ('20261118000300', 'class_roster');

commit;
