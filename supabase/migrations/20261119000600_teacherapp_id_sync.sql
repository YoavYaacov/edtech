-- =====================================================================
-- Migration: 20261119000600_teacherapp_id_sync   (batch 7 - full ID sync from TeacherApp)
--
-- TeacherApp (migration 0009) keeps student ID numbers encrypted in teacherapp_private.student_identity with its OWN
-- key (Vault secret teacherapp_identity_key). The two keys differ, so an encrypted value can never be copied between
-- the databases: inside SECURITY DEFINER functions only, the ID is decrypted with the TeacherApp key and immediately
-- re-encrypted with this system's key (hevanti_identity_key) plus this system's blind index. The plain value exists
-- only in a local variable of the function; it is never returned, logged or put in any jsonb.
--
--   * ta_apply: 'add' / 'match' carry the ID; new kinds
--       id_fill               linked row without an ID  -> fill from TeacherApp (default: apply)
--       id_conflict           linked row, not registered yet, ID differs -> TeacherApp wins (default: apply)
--       id_conflict_claimed   linked row of a registered student, ID differs -> flagged, NO automatic action
--     An ID already used by another student of the class is skipped and counted in 'id_skipped'.
--   * Previews expose only names and kinds (plus counts), never an ID or a hash.
--   * No new grants; no SELECT on any sensitive table is added. Learning progress is never touched.
--
--   * Identity backup/restore package for this system (ciphertext + HMAC, restore by stable ids only).
--
-- Prerequisites: 20261119000100 (TeacherApp bridge) AND TeacherApp migration 0009 (+ its Vault secret).
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20261119000100') then
    raise exception 'Run 20261119000100_teacherapp_sync.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20261119000600') then
    raise exception '20261119000600 was already applied.';
  end if;
  if to_regclass('teacherapp_private.student_identity') is null then
    raise exception 'TeacherApp migration 0009 (teacherapp_private.student_identity) is required first.';
  end if;
  if not exists (select 1 from vault.secrets where name = 'teacherapp_identity_key') then
    raise exception 'Vault secret teacherapp_identity_key is missing.';
  end if;
end $$;

-- the decrypted TeacherApp ID of one student; for use by the functions below only (no client may call it)
create or replace function private.ta_plain_id(p_ta_student uuid)
returns text language sql stable security definer set search_path = '' as $$
  select extensions.pgp_sym_decrypt(i.id_enc, teacherapp_private.identity_key())
    from teacherapp_private.student_identity i where i.student_id = p_ta_student
$$;
revoke all on function private.ta_plain_id(uuid) from public, anon, authenticated;

-- ---------------- diff, preview, apply, pending (redefined) ----------------
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
    select case when r.id_hash is null then 'id_fill' when r.user_id is null then 'id_conflict' else 'id_conflict_claimed' end,
           r.ta_student_id::text, r.ta_student_id, r.id, (r.last_name || ' ' || r.first_name), null::text, null::text,
           r.user_id is not null, false
      from ros r join ta t on t.id = r.ta_student_id and t.active
      join teacherapp_private.student_identity ti on ti.student_id = r.ta_student_id
     where r.id_hash is null
        or private.id_blind_index(lpad(extensions.pgp_sym_decrypt(ti.id_enc, teacherapp_private.identity_key()), 9, '0')) is distinct from r.id_hash
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
    'without_id', (select count(*) from private.class_roster r where r.class_id = p_class_id and r.id_hash is null),
    'ta_without_id', (select count(distinct e.student_id) from teacherapp.enrollments e join teacherapp.students s on s.id = e.student_id
                       where e.group_id = v_group and e.left_at is null and s.archived_at is null
                         and not exists (select 1 from teacherapp_private.student_identity i where i.student_id = s.id)));
end $$;

create or replace function public.ta_apply(p_class_id uuid, p_decisions jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d jsonb; v record; v_action text; v_applied int := 0; v_ignored int := 0; v_skipped int := 0; v_id_skipped int := 0; v_plain text;
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
      v_plain := private.ta_plain_id(v.ta_student_id);
      begin
        insert into private.class_roster (class_id, first_name, last_name, ta_student_id, id_enc, id_hash)
        values (p_class_id, regexp_replace(btrim(v.new_first), '\s+', ' ', 'g'), regexp_replace(btrim(v.new_last), '\s+', ' ', 'g'), v.ta_student_id,
                case when v_plain is null then null else extensions.pgp_sym_encrypt(lpad(v_plain, 9, '0'), private.identity_key()) end,
                case when v_plain is null then null else private.id_blind_index(lpad(v_plain, 9, '0')) end)
        on conflict (class_id, ta_student_id) where ta_student_id is not null do nothing;
      exception when unique_violation then
        -- the same ID already belongs to another student of this class: add the name without an ID and report it
        insert into private.class_roster (class_id, first_name, last_name, ta_student_id)
        values (p_class_id, regexp_replace(btrim(v.new_first), '\s+', ' ', 'g'), regexp_replace(btrim(v.new_last), '\s+', ' ', 'g'), v.ta_student_id)
        on conflict (class_id, ta_student_id) where ta_student_id is not null do nothing;
        v_id_skipped := v_id_skipped + 1;
      end;
      v_plain := null;
      v_applied := v_applied + 1;

    elsif v.kind = 'match' and v_action = 'apply' then
      update private.class_roster set ta_student_id = v.ta_student_id where id = v.roster_id and ta_student_id is null;
      v_applied := v_applied + 1;
      -- a linked row that has no ID yet gets it from TeacherApp straight away (never replaces an existing ID here)
      v_plain := private.ta_plain_id(v.ta_student_id);
      if v_plain is not null then
        begin
          update private.class_roster set id_enc = extensions.pgp_sym_encrypt(lpad(v_plain, 9, '0'), private.identity_key()),
                 id_hash = private.id_blind_index(lpad(v_plain, 9, '0'))
           where id = v.roster_id and id_hash is null;
        exception when unique_violation then v_id_skipped := v_id_skipped + 1;
        end;
        v_plain := null;
      end if;

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

    elsif v.kind in ('id_fill', 'id_conflict') and v_action = 'apply' then
      -- TeacherApp is the source of truth for the ID of a student who has not registered yet.
      -- The write is guarded again here: a row that has a linked account is never touched.
      v_plain := private.ta_plain_id(v.ta_student_id);
      if v_plain is null then v_skipped := v_skipped + 1; continue; end if;
      begin
        update private.class_roster set id_enc = extensions.pgp_sym_encrypt(lpad(v_plain, 9, '0'), private.identity_key()),
               id_hash = private.id_blind_index(lpad(v_plain, 9, '0'))
         where id = v.roster_id and user_id is null;
        v_applied := v_applied + 1;
      exception when unique_violation then v_id_skipped := v_id_skipped + 1;
      end;
      v_plain := null;

    else
      v_skipped := v_skipped + 1;   -- ambiguous and id_conflict_claimed rows have no automatic action
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'applied', v_applied, 'ignored', v_ignored, 'skipped', v_skipped, 'id_skipped', v_id_skipped);
end $$;

create or replace function public.ta_pending()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if not private.is_ta_owner() then return jsonb_build_object('ok', false, 'reason', 'not_available'); end if;
  return jsonb_build_object('ok', true,
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object('class_id', x.class_id, 'course_id', x.course_id, 'title', x.title, 'pending', x.n)
                       order by x.title)
        from (select c.id as class_id, c.course_id, c.title, (select count(*) from private.ta_diff(c.id) dd where dd.kind not in ('ambiguous', 'id_conflict_claimed')) as n
                from public.classes c join private.ta_group_links l on l.class_id = c.id
               where c.owner_id = v_uid) x
       where x.n > 0), '[]'::jsonb),
    'unlinked_groups', (select count(*) from teacherapp.study_groups g
                         where g.archived_at is null and not exists (select 1 from private.ta_group_links l where l.ta_group_id = g.id)));
end $$;

revoke all on function private.ta_diff(uuid) from public, anon, authenticated;
revoke all on function public.ta_preview(uuid), public.ta_apply(uuid, jsonb), public.ta_pending() from public, anon;
grant execute on function public.ta_preview(uuid), public.ta_apply(uuid, jsonb), public.ta_pending() to authenticated;

-- ---------------- identity backup package (hevanti) ----------------
-- External package = ciphertext only (no plain IDs, no names), signed with HMAC-SHA256 under a key derived from
-- hevanti_identity_key. Restore matches ONLY by stable ids (profile id / roster row id + class id), never by name,
-- re-verifies every row (decrypts with the current key, recomputes the blind index) and never overwrites.
-- Not a full-project recovery: auth accounts and system data need the Supabase project backup (see docs).
create table private.identity_meta (key text primary key, value text not null);
alter table private.identity_meta enable row level security;
revoke all on private.identity_meta from public, anon, authenticated;

create or replace function private.identity_rows()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(jsonb_build_object('user_id', user_id, 'id_enc', encode(id_enc, 'hex'), 'id_hash', encode(id_hash, 'hex')) order by user_id)
                            from private.student_identity), '[]'::jsonb),
    'roster', coalesce((select jsonb_agg(jsonb_build_object('roster_id', id, 'class_id', class_id, 'id_enc', encode(id_enc, 'hex'), 'id_hash', encode(id_hash, 'hex')) order by id)
                          from private.class_roster where id_hash is not null), '[]'::jsonb))
$$;

create or replace function private.identity_pkg_mac(p_created text, p_accounts jsonb, p_roster jsonb)
returns text language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(
    convert_to('hv-identity-v1|' || p_created || '|' || jsonb_array_length(p_accounts) || '|' || jsonb_array_length(p_roster) || '|' ||
      coalesce((select string_agg(a.user_id || '.' || a.id_enc || '.' || a.id_hash, ';' order by a.user_id)
                  from jsonb_to_recordset(p_accounts) as a(user_id text, id_enc text, id_hash text)), '') || '|' ||
      coalesce((select string_agg(r.roster_id || '.' || r.class_id || '.' || r.id_enc || '.' || r.id_hash, ';' order by r.roster_id)
                  from jsonb_to_recordset(p_roster) as r(roster_id text, class_id text, id_enc text, id_hash text)), ''), 'UTF8'),
    extensions.hmac(convert_to('hv-backup-mac-v1', 'UTF8'), convert_to(private.identity_key(), 'UTF8'), 'sha256'),
    'sha256'), 'hex')
$$;

create or replace function private.identity_restore_rows(p_accounts jsonb, p_roster jsonb, p_dry boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; k text := private.identity_key(); uid uuid; rid uuid; cid uuid; enc bytea; hh bytea; plain text; cur bytea; bucket text;
  c jsonb := jsonb_build_object('restored', 0, 'same', 0, 'conflict', 0, 'duplicate', 0, 'no_target', 0, 'bad_row', 0);
begin
  for r in select * from jsonb_array_elements(p_accounts) loop
    bucket := null;
    begin
      uid := (r ->> 'user_id')::uuid; enc := decode(r ->> 'id_enc', 'hex'); hh := decode(r ->> 'id_hash', 'hex');
      plain := extensions.pgp_sym_decrypt(enc, k);
      if not private.is_valid_il_id(plain) or private.id_blind_index(lpad(plain, 9, '0')) is distinct from hh then bucket := 'bad_row'; end if;
    exception when others then bucket := 'bad_row';
    end;
    plain := null;
    if bucket is null then
      if not exists (select 1 from public.profiles where id = uid and role = 'student') then bucket := 'no_target';
      else
        select id_hash into cur from private.student_identity where user_id = uid;
        if found then bucket := case when cur = hh then 'same' else 'conflict' end;
        elsif exists (select 1 from private.student_identity where id_hash = hh) then bucket := 'duplicate';
        else bucket := 'restored';
          if not p_dry then insert into private.student_identity (user_id, id_enc, id_hash) values (uid, enc, hh); end if;
        end if;
      end if;
    end if;
    c := jsonb_set(c, array[bucket], to_jsonb((c ->> bucket)::int + 1));
  end loop;

  for r in select * from jsonb_array_elements(p_roster) loop
    bucket := null;
    begin
      rid := (r ->> 'roster_id')::uuid; cid := (r ->> 'class_id')::uuid; enc := decode(r ->> 'id_enc', 'hex'); hh := decode(r ->> 'id_hash', 'hex');
      plain := extensions.pgp_sym_decrypt(enc, k);
      if not private.is_valid_il_id(plain) or private.id_blind_index(lpad(plain, 9, '0')) is distinct from hh then bucket := 'bad_row'; end if;
    exception when others then bucket := 'bad_row';
    end;
    plain := null;
    if bucket is null then
      if not exists (select 1 from private.class_roster where id = rid and class_id = cid) then bucket := 'no_target';
      else
        select id_hash into cur from private.class_roster where id = rid;
        if cur is not null then bucket := case when cur = hh then 'same' else 'conflict' end;
        elsif exists (select 1 from private.class_roster where class_id = cid and id_hash = hh) then bucket := 'duplicate';
        else bucket := 'restored';
          if not p_dry then update private.class_roster set id_enc = enc, id_hash = hh where id = rid and id_hash is null; end if;
        end if;
      end if;
    end if;
    c := jsonb_set(c, array[bucket], to_jsonb((c ->> bucket)::int + 1));
  end loop;
  return c;
end $$;
revoke all on function private.identity_rows(), private.identity_pkg_mac(text, jsonb, jsonb),
  private.identity_restore_rows(jsonb, jsonb, boolean) from public, anon, authenticated;

-- owner only (the teacher whose e-mail is the TeacherApp owner)
create or replace function public.identity_backup_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare k text := private.identity_key(); x record; readable int := 0; total int := 0;
begin
  if not private.is_ta_owner() then return jsonb_build_object('ok', false, 'reason', 'not_available'); end if;
  for x in select id_enc from private.student_identity union all select id_enc from private.class_roster where id_hash is not null loop
    total := total + 1;
    begin perform extensions.pgp_sym_decrypt(x.id_enc, k); readable := readable + 1; exception when others then null; end;
  end loop;
  return jsonb_build_object('ok', true, 'total', total, 'readable', readable,
    'last_export_at', (select value from private.identity_meta where key = 'last_export_at'));
end $$;

create or replace function public.identity_backup_export()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare rows_ jsonb; created text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
begin
  if not private.is_ta_owner() then return jsonb_build_object('ok', false, 'reason', 'not_available'); end if;
  rows_ := private.identity_rows();
  insert into private.identity_meta (key, value) values ('last_export_at', created) on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true, 'package', jsonb_build_object('format', 'hv-identity-v1', 'created_at', created,
    'accounts', rows_ -> 'accounts', 'roster', rows_ -> 'roster',
    'mac', private.identity_pkg_mac(created, rows_ -> 'accounts', rows_ -> 'roster')));
end $$;

create or replace function public.identity_backup_import(p_package jsonb, p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare created text; acc jsonb; ros jsonb;
begin
  if not private.is_ta_owner() then return jsonb_build_object('ok', false, 'reason', 'not_available'); end if;
  if jsonb_typeof(p_package) is distinct from 'object' or p_package ->> 'format' is distinct from 'hv-identity-v1'
     or jsonb_typeof(p_package -> 'accounts') is distinct from 'array' or jsonb_typeof(p_package -> 'roster') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'reason', 'format');
  end if;
  acc := p_package -> 'accounts'; ros := p_package -> 'roster'; created := p_package ->> 'created_at';
  if jsonb_array_length(acc) + jsonb_array_length(ros) > 20000 then return jsonb_build_object('ok', false, 'reason', 'too_big'); end if;
  if created is null or created !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$' then return jsonb_build_object('ok', false, 'reason', 'format'); end if;
  begin
    if private.identity_pkg_mac(created, acc, ros) is distinct from (p_package ->> 'mac') then return jsonb_build_object('ok', false, 'reason', 'mac'); end if;
  exception when others then return jsonb_build_object('ok', false, 'reason', 'format');
  end;
  perform pg_advisory_xact_lock(hashtext('hv_identity_import'));
  return jsonb_build_object('ok', true, 'applied', p_apply, 'created_at', created) || private.identity_restore_rows(acc, ros, not p_apply);
end $$;

revoke all on function public.identity_backup_status(), public.identity_backup_export(), public.identity_backup_import(jsonb, boolean) from public, anon;
grant execute on function public.identity_backup_status(), public.identity_backup_export(), public.identity_backup_import(jsonb, boolean) to authenticated;

insert into private.applied_migrations (version, name) values ('20261119000600', 'teacherapp_id_sync');

commit;
