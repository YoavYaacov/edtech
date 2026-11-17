-- =====================================================================
-- Migration: 20261118000100_join_links_and_identity   (batch 4)
-- Class join links + student self-registration identity.
--
-- Builds ON the existing model (classes, class_students, course_enrollments, teacher_students).
-- Nothing parallel is created.
--
-- Security model
--   * Roles: unchanged. private.handle_new_user() already forces role='student' for every
--     auth user, so self-registration can never produce a teacher/admin. This migration does
--     not touch it, profiles' column grants, or the invite-student flow.
--   * A student only ever enters a class through join_class(token) (or a teacher's approval).
--     The class is derived from the token on the server; the client never sends a class id.
--   * Israeli ID number:
--       - checksum-validated server-side (private.is_valid_il_id);
--       - stored ENCRYPTED (pgp_sym_encrypt) in private.student_identity, plus a keyed blind
--         index (HMAC-SHA256) with a UNIQUE constraint => no duplicate ids, no plaintext;
--       - the key lives in Supabase Vault (secret 'hevanti_identity_key', generated here from
--         gen_random_bytes: it never appears in code, chat or logs);
--       - schema "private" is not exposed by the API; the table has RLS on, no policies and no
--         grants. Only SECURITY DEFINER functions touch it;
--       - never used as a password or as proof of identity; a student cannot change it later;
--       - a teacher can reveal it only for a student they teach, and every reveal is logged;
--       - wrong/duplicate attempts are rate limited (anti-enumeration).
--   * Join links: random 192-bit token, expiry (1-90 days), optional max uses, revoke / renew
--     (one active link per class). preview_join exposes ONLY class title, subject title and a
--     status. Per class switch: join_requires_approval (teacher approves each student).
--   * Joining adds course_enrollments + teacher_students (+ class_students) in ONE transaction.
--     A student in another class of the same subject is refused (never silently moved).
--
-- Prerequisites: 20261117000300 (lessons) in the ledger; extensions pgcrypto + supabase_vault.
-- Not applied to any database by this file's author.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20261117000300') then
    raise exception 'Run 20261117000300_lessons.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20261118000100') then
    raise exception 'Migration 20261118000100 already applied.';
  end if;
  if to_regclass('vault.secrets') is null or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Supabase Vault is required (Dashboard > Database > Extensions > supabase_vault).';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'extensions' and p.proname = 'pgp_sym_encrypt') then
    raise exception 'pgcrypto is required in schema "extensions".';
  end if;
end $$;

-- ---- 1. names on the profile (the ID number is NOT here) ----
alter table public.profiles
  add column if not exists first_name text check (first_name is null or char_length(first_name) between 1 and 40),
  add column if not exists last_name  text check (last_name  is null or char_length(last_name)  between 1 and 40);
-- no new grants: names change only through complete_student_identity()

-- ---- 2. encryption key (generated inside the database, once) ----
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'hevanti_identity_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'hevanti_identity_key',
      'Encrypts and indexes student ID numbers. Do NOT delete or change: stored ids become unreadable.');
  end if;
end $$;

create or replace function private.identity_key()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'hevanti_identity_key' limit 1
$$;

-- ---- 3. ID validation (Israeli ID: up to 9 digits, left-padded, check digit) ----
create or replace function private.is_valid_il_id(p text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare s text; t int := 0; d int; i int;
begin
  if p is null or p !~ '^[0-9]{5,9}$' then return false; end if;
  s := lpad(p, 9, '0');
  if s = '000000000' then return false; end if;
  for i in 1..9 loop
    d := substr(s, i, 1)::int * case when i % 2 = 1 then 1 else 2 end;
    if d > 9 then d := d - 9; end if;
    t := t + d;
  end loop;
  return t % 10 = 0;
end $$;

create or replace function private.id_blind_index(p text)
returns bytea language sql stable security definer set search_path = '' as $$
  select extensions.hmac(convert_to('idx:' || p, 'UTF8'), convert_to(private.identity_key(), 'UTF8'), 'sha256')
$$;

-- ---- 4. private identity storage ----
create table private.student_identity (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  id_enc      bytea not null,
  id_hash     bytea not null unique,
  created_at  timestamptz not null default now()
);
create table private.identity_attempts (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  at        timestamptz not null default now()
);
create index identity_attempts_user_idx on private.identity_attempts (user_id, at desc);
create table private.identity_reveals (
  id          bigint generated always as identity primary key,
  teacher_id  uuid not null,
  student_id  uuid not null,
  at          timestamptz not null default now()
);
alter table private.student_identity  enable row level security;
alter table private.identity_attempts enable row level security;
alter table private.identity_reveals  enable row level security;
revoke all on private.student_identity, private.identity_attempts, private.identity_reveals from public, anon, authenticated;

-- ---- 5. identity RPCs ----
create or replace function public.my_identity()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); p record;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select role, first_name, last_name into p from public.profiles where id = v_uid;
  if not found then raise exception 'Profile not found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'role', p.role,
    'first_name', p.first_name, 'last_name', p.last_name,
    'complete', (p.first_name is not null and p.last_name is not null
                 and exists (select 1 from private.student_identity where user_id = v_uid)));
end $$;

create or replace function public.complete_student_identity(p_first text, p_last text, p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_first text; v_last text; v_id text; v_hash bytea; v_existing bytea; v_fail int;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'student') then
    return jsonb_build_object('ok', false, 'reason', 'not_student');
  end if;

  select count(*) into v_fail from private.identity_attempts where user_id = v_uid and at > now() - interval '1 hour';
  if v_fail >= 8 then return jsonb_build_object('ok', false, 'reason', 'rate_limited'); end if;

  v_first := regexp_replace(btrim(coalesce(p_first, '')), '\s+', ' ', 'g');
  v_last  := regexp_replace(btrim(coalesce(p_last,  '')), '\s+', ' ', 'g');
  if char_length(v_first) not between 1 and 40 or char_length(v_last) not between 1 and 40
     or v_first ~ '[<>[:cntrl:]]' or v_last ~ '[<>[:cntrl:]]' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;

  v_id := btrim(coalesce(p_id, ''));
  if not private.is_valid_il_id(v_id) then
    insert into private.identity_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'reason', 'invalid_id');
  end if;
  v_id := lpad(v_id, 9, '0');
  v_hash := private.id_blind_index(v_id);

  select id_hash into v_existing from private.student_identity where user_id = v_uid;
  if found then
    if v_existing <> v_hash then
      insert into private.identity_attempts (user_id) values (v_uid);
      return jsonb_build_object('ok', false, 'reason', 'identity_locked');   -- the id cannot be changed by the student
    end if;
  else
    begin
      insert into private.student_identity (user_id, id_enc, id_hash)
      values (v_uid, extensions.pgp_sym_encrypt(v_id, private.identity_key()), v_hash);
    exception when unique_violation then
      insert into private.identity_attempts (user_id) values (v_uid);
      return jsonb_build_object('ok', false, 'reason', 'id_in_use');
    end;
  end if;

  update public.profiles set first_name = v_first, last_name = v_last, full_name = v_first || ' ' || v_last
   where id = v_uid;
  return jsonb_build_object('ok', true);
end $$;

-- A teacher may see the full id ONLY of a student they teach; each reveal is logged.
create or replace function public.reveal_student_id(p_student_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_enc bytea;
begin
  if v_uid is null or not private.is_teacher() or not private.teaches(p_student_id) then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  select id_enc into v_enc from private.student_identity where user_id = p_student_id;
  if v_enc is null then return null; end if;
  insert into private.identity_reveals (teacher_id, student_id) values (v_uid, p_student_id);
  return extensions.pgp_sym_decrypt(v_enc, private.identity_key());
end $$;

-- ---- 6. classes: approval switch + helper ----
alter table public.classes add column if not exists join_requires_approval boolean not null default false;

create or replace function private.owns_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.classes c join public.courses co on co.id = c.course_id
                 where c.id = p_class_id and co.owner_id = (select auth.uid()))
$$;

-- ---- 7. join links + requests ----
create table public.class_join_links (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes (id) on delete restrict,
  token       text not null unique check (char_length(token) >= 32),
  expires_at  timestamptz not null,
  max_uses    integer check (max_uses is null or max_uses between 1 and 1000),
  uses        integer not null default 0 check (uses >= 0),
  revoked_at  timestamptz,
  created_by  uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now()
);
create unique index class_join_links_one_active on public.class_join_links (class_id) where revoked_at is null;

create table public.class_join_requests (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes (id) on delete restrict,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  unique (class_id, student_id)
);
create index class_join_requests_pending_idx on public.class_join_requests (class_id) where status = 'pending';

alter table public.class_join_links    enable row level security;
alter table public.class_join_requests enable row level security;
revoke all on public.class_join_links, public.class_join_requests from public, anon, authenticated;
grant select on public.class_join_links, public.class_join_requests to authenticated;
create policy "join links: class owner reads" on public.class_join_links for select to authenticated
  using (private.owns_class(class_id));
create policy "join requests: class owner reads" on public.class_join_requests for select to authenticated
  using (private.owns_class(class_id));

-- Enroll + link teacher + add to class. One place, used by join and approval.
-- Returns null on success or a reason.
create or replace function private.enroll_into_class(p_class_id uuid, p_student_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_course uuid; v_owner uuid; v_ts text;
begin
  select c.course_id, co.owner_id into v_course, v_owner
    from public.classes c join public.courses co on co.id = c.course_id
   where c.id = p_class_id and not co.is_archived;
  if v_course is null then return 'invalid'; end if;
  if exists (select 1 from public.class_students where class_id = p_class_id and student_id = p_student_id) then return null; end if;
  if exists (select 1 from public.class_students where course_id = v_course and student_id = p_student_id) then return 'other_class'; end if;
  select status into v_ts from public.teacher_students where teacher_id = v_owner and student_id = p_student_id;
  if v_ts = 'archived' then return 'blocked'; end if;
  insert into public.teacher_students (teacher_id, student_id) values (v_owner, p_student_id)
    on conflict (teacher_id, student_id) do nothing;
  insert into public.course_enrollments (course_id, student_id) values (v_course, p_student_id) on conflict do nothing;
  insert into public.class_students (class_id, course_id, student_id) values (p_class_id, v_course, p_student_id);
  return null;
end $$;

create or replace function public.create_join_link(p_class_id uuid, p_days integer default 14, p_max_uses integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_token text; v_id uuid; v_exp timestamptz;
begin
  if v_uid is null or not private.is_teacher() or not private.owns_class(p_class_id) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  if p_days is null or p_days not between 1 and 90 then raise exception 'Invalid expiry' using errcode = '22023'; end if;
  if p_max_uses is not null and p_max_uses not between 1 and 1000 then raise exception 'Invalid max uses' using errcode = '22023'; end if;
  perform 1 from public.classes where id = p_class_id for update;           -- serialise renew/create per class
  update public.class_join_links set revoked_at = now() where class_id = p_class_id and revoked_at is null;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '=');
  v_exp := now() + make_interval(days => p_days);
  insert into public.class_join_links (class_id, token, expires_at, max_uses, created_by)
  values (p_class_id, v_token, v_exp, p_max_uses, v_uid) returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_exp, 'max_uses', p_max_uses);
end $$;

create or replace function public.revoke_join_link(p_class_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_teacher() or not private.owns_class(p_class_id) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  update public.class_join_links set revoked_at = now() where class_id = p_class_id and revoked_at is null;
end $$;

create or replace function public.set_class_join_approval(p_class_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_teacher() or not private.owns_class(p_class_id) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  update public.classes set join_requires_approval = coalesce(p_enabled, false) where id = p_class_id;
end $$;

-- Public preview (also for signed-out visitors): class + subject title and a status. Nothing else.
create or replace function public.preview_join(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l record; v_status text;
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select l2.*, c.title as class_title, c.join_requires_approval as needs_ok, co.title as course_title, co.is_archived as archived
    into l
    from public.class_join_links l2 join public.classes c on c.id = l2.class_id join public.courses co on co.id = c.course_id
   where l2.token = p_token;
  if not found or l.archived then return jsonb_build_object('status', 'invalid'); end if;
  v_status := case when l.revoked_at is not null then 'revoked'
                   when l.expires_at <= now() then 'expired'
                   when l.max_uses is not null and l.uses >= l.max_uses then 'full'
                   else 'ok' end;
  return jsonb_build_object('status', v_status, 'class_title', l.class_title, 'course_title', l.course_title,
                            'requires_approval', l.needs_ok);
end $$;

create or replace function public.join_class(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_role text; l record; v_req text; v_why text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'student' then return jsonb_build_object('ok', false, 'reason', 'not_student'); end if;
  if not (public.my_identity() ->> 'complete')::boolean then return jsonb_build_object('ok', false, 'reason', 'identity_required'); end if;
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;

  select l2.*, c.join_requires_approval as needs_ok, co.is_archived as archived into l
    from public.class_join_links l2 join public.classes c on c.id = l2.class_id join public.courses co on co.id = c.course_id
   where l2.token = p_token for update of l2;
  if not found or l.archived then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;

  -- idempotent outcomes first (a link that later expired still lets existing members/requesters see their state)
  if exists (select 1 from public.class_students where class_id = l.class_id and student_id = v_uid) then
    return jsonb_build_object('ok', true, 'status', 'already_member', 'class_id', l.class_id);
  end if;
  select status into v_req from public.class_join_requests where class_id = l.class_id and student_id = v_uid;
  if v_req = 'pending'  then return jsonb_build_object('ok', true, 'status', 'pending'); end if;
  if v_req = 'rejected' then return jsonb_build_object('ok', false, 'reason', 'rejected'); end if;

  if l.revoked_at is not null then return jsonb_build_object('ok', false, 'reason', 'revoked'); end if;
  if l.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if l.max_uses is not null and l.uses >= l.max_uses then return jsonb_build_object('ok', false, 'reason', 'full'); end if;

  if l.needs_ok then
    -- refuse early what approval could never grant
    if exists (select 1 from public.class_students cs join public.classes c on c.course_id = cs.course_id
                where c.id = l.class_id and cs.student_id = v_uid) then
      return jsonb_build_object('ok', false, 'reason', 'other_class');
    end if;
    insert into public.class_join_requests (class_id, student_id) values (l.class_id, v_uid) on conflict do nothing;
    update public.class_join_links set uses = uses + 1 where id = l.id;
    return jsonb_build_object('ok', true, 'status', 'pending');
  end if;

  v_why := private.enroll_into_class(l.class_id, v_uid);
  if v_why is not null then return jsonb_build_object('ok', false, 'reason', v_why); end if;
  update public.class_join_links set uses = uses + 1 where id = l.id;
  return jsonb_build_object('ok', true, 'status', 'joined', 'class_id', l.class_id);
end $$;

create or replace function public.list_join_requests(p_class_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_teacher() or not private.owns_class(p_class_id) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', coalesce(nullif(btrim(p.first_name || ' ' || p.last_name), ''), p.full_name),
                                                       'created_at', r.created_at) order by r.created_at)
                     from public.class_join_requests r join public.profiles p on p.id = r.student_id
                    where r.class_id = p_class_id and r.status = 'pending'), '[]'::jsonb);
end $$;

create or replace function public.decide_join_request(p_request_id uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_why text;
begin
  select * into r from public.class_join_requests where id = p_request_id for update;
  if not found or not private.is_teacher() or not private.owns_class(r.class_id) then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'already_decided'); end if;
  if p_approve then
    v_why := private.enroll_into_class(r.class_id, r.student_id);
    if v_why is not null then return jsonb_build_object('ok', false, 'reason', v_why); end if;   -- stays pending
    update public.class_join_requests set status = 'approved', decided_at = now() where id = r.id;
  else
    update public.class_join_requests set status = 'rejected', decided_at = now() where id = r.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---- 8. delete_class v3: also removes the class's join links and requests ----
create or replace function public.delete_class(p_class_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_course uuid; v_members int; v_statuses int;
begin
  select course_id into v_course from public.classes where id = p_class_id for update;
  if v_course is null or not private.owns_course(v_course) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
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

-- ---- 9. privileges ----
revoke all on function
  private.identity_key(), private.is_valid_il_id(text), private.id_blind_index(text),
  private.owns_class(uuid), private.enroll_into_class(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.owns_class(uuid) to authenticated;   -- used inside RLS policies

revoke all on function
  public.my_identity(), public.complete_student_identity(text, text, text), public.reveal_student_id(uuid),
  public.create_join_link(uuid, integer, integer), public.revoke_join_link(uuid), public.set_class_join_approval(uuid, boolean),
  public.preview_join(text), public.join_class(text), public.list_join_requests(uuid), public.decide_join_request(uuid, boolean),
  public.delete_class(uuid)
  from public, anon;
grant execute on function
  public.my_identity(), public.complete_student_identity(text, text, text), public.reveal_student_id(uuid),
  public.create_join_link(uuid, integer, integer), public.revoke_join_link(uuid), public.set_class_join_approval(uuid, boolean),
  public.join_class(text), public.list_join_requests(uuid), public.decide_join_request(uuid, boolean), public.delete_class(uuid)
  to authenticated;
grant execute on function public.preview_join(text) to anon, authenticated;

insert into private.applied_migrations (version, name) values ('20261118000100', 'join_links_and_identity');

commit;
