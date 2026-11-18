-- =====================================================================
-- Migration: 20261118000400_pending_join   (registration fix)
--
-- Problem: after the student verified name + ID and created an account, the e-mail confirmation link opens in a
-- different browser/tab. The verified ticket lived only in the first tab, so the confirmation tab asked for the name and
-- ID again (and, because the first tab had already claimed the roster row, the second attempt was refused).
--
-- Fix (server side, nothing trusted from the browser):
--   * bind_ticket_email(ticket, email): called right after verification, BEFORE sign-up. The verified, unexpired ticket
--     is bound (once) to the e-mail address the student is about to register; the ticket now lives 3 days.
--   * complete_pending_join(): called by the signed-in student on any device. It looks up the ticket bound to the
--     account's CONFIRMED e-mail address and redeems it (same checks as claim_roster). If it was already redeemed by
--     this student it simply reports already_member. No ticket for this e-mail -> reason 'none'.
--   * join_status(token): tells a signed-in user only whether THEY are already a member of the link's class.
--   * claim_roster(ticket) keeps working and shares one implementation (private.do_claim).
--
-- The ID check cannot be skipped: a ticket exists only after verify_roster_entry accepted the matching ID, it is bound
-- to one e-mail, is single use, expires, and is voided if the link is revoked/expired/full. Accounts that were
-- created before this fix and never joined are not touched: they sign in and verify name + ID once.
-- Prerequisite: 20261118000300. Not applied to any database by this file's author.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20261118000300') then
    raise exception 'Run 20261118000300_class_roster.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20261118000400') then
    raise exception 'Migration 20261118000400 already applied.';
  end if;
end $$;

alter table private.roster_tickets add column email_hash bytea;
create index roster_tickets_email_idx on private.roster_tickets (email_hash) where email_hash is not null;

create or replace function private.email_blind_index(p_email text)
returns bytea language sql stable security definer set search_path = '' as $$
  select extensions.hmac(convert_to('mail:' || lower(btrim(coalesce(p_email, ''))), 'UTF8'),
                         convert_to(private.identity_key(), 'UTF8'), 'sha256')
$$;

-- ---- shared redeem logic (the body of the former claim_roster) ----
create or replace function private.do_claim(p_uid uuid, p_ticket_hash bytea)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t record; r record; v_link record; v_why text;
begin
  select * into t from private.roster_tickets where ticket_hash = p_ticket_hash for update;
  if not found or t.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'ticket_invalid'); end if;
  select * into r from private.class_roster where id = t.roster_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'ticket_invalid'); end if;

  if t.used_at is not null then
    if r.user_id = p_uid then return jsonb_build_object('ok', true, 'status', 'already_member', 'class_id', r.class_id); end if;
    return jsonb_build_object('ok', false, 'reason', 'ticket_invalid');
  end if;
  if r.user_id is not null and r.user_id <> p_uid then return jsonb_build_object('ok', false, 'reason', 'taken'); end if;

  select l.id, l.revoked_at, l.expires_at, l.max_uses, l.uses into v_link
    from public.class_join_links l where l.id = t.link_id for update;
  if not found or v_link.revoked_at is not null then return jsonb_build_object('ok', false, 'reason', 'revoked'); end if;
  if v_link.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if v_link.max_uses is not null and v_link.uses >= v_link.max_uses then return jsonb_build_object('ok', false, 'reason', 'full'); end if;

  begin
    if exists (select 1 from private.student_identity where user_id = p_uid and id_hash <> r.id_hash) then
      raise exception using errcode = 'P0001', message = 'identity_locked';
    end if;
    v_why := private.enroll_into_class(r.class_id, p_uid);
    if v_why is not null then raise exception using errcode = 'P0001', message = v_why; end if;
    insert into private.student_identity (user_id, id_enc, id_hash) values (p_uid, r.id_enc, r.id_hash)
    on conflict (user_id) do nothing;
    update public.profiles set first_name = r.first_name, last_name = r.last_name,
           full_name = r.first_name || ' ' || r.last_name where id = p_uid;
    update private.class_roster set user_id = p_uid, claimed_at = now() where id = r.id;
    update private.roster_tickets set used_at = now() where ticket_hash = t.ticket_hash;
    update public.class_join_links set uses = uses + 1 where id = v_link.id;
  exception
    when unique_violation then return jsonb_build_object('ok', false, 'reason', 'id_in_use');
    when sqlstate 'P0001' then return jsonb_build_object('ok', false, 'reason', sqlerrm);
  end;
  return jsonb_build_object('ok', true, 'status', 'joined', 'class_id', r.class_id);
end $$;

create or replace function public.claim_roster(p_ticket text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_role text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'student' then return jsonb_build_object('ok', false, 'reason', 'not_student'); end if;
  if p_ticket is null or char_length(p_ticket) <> 48 then return jsonb_build_object('ok', false, 'reason', 'ticket_invalid'); end if;
  return private.do_claim(v_uid, extensions.digest(p_ticket, 'sha256'));
end $$;

-- ---- bind a verified ticket to the e-mail about to be registered (anonymous caller: it holds the secret ticket) ----
create or replace function public.bind_ticket_email(p_ticket text, p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t record; v_hash bytea; v_mail text := lower(btrim(coalesce(p_email, '')));
begin
  if p_ticket is null or char_length(p_ticket) <> 48 or v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_mail) > 254 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  select * into t from private.roster_tickets where ticket_hash = extensions.digest(p_ticket, 'sha256') for update;
  if not found or t.used_at is not null or t.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'ticket_invalid'); end if;
  v_hash := private.email_blind_index(v_mail);
  if t.email_hash is not null and t.email_hash <> v_hash then return jsonb_build_object('ok', false, 'reason', 'bound'); end if;
  update private.roster_tickets set email_hash = v_hash, expires_at = greatest(expires_at, now() + interval '3 days')
   where ticket_hash = t.ticket_hash;
  return jsonb_build_object('ok', true);
end $$;

-- ---- signed-in student, any device: finish a join that was verified before sign-up ----
create or replace function public.complete_pending_join()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_role text; u record; t record;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'student' then return jsonb_build_object('ok', false, 'reason', 'not_student'); end if;
  select email, email_confirmed_at into u from auth.users where id = v_uid;
  if not found or u.email is null or u.email_confirmed_at is null then return jsonb_build_object('ok', false, 'reason', 'none'); end if;
  select ticket_hash into t from private.roster_tickets
   where email_hash = private.email_blind_index(u.email) and expires_at > now()
   order by used_at nulls first, expires_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'none'); end if;
  return private.do_claim(v_uid, t.ticket_hash);
end $$;

-- ---- does the signed-in user already belong to the class of this link? (only ever about the caller) ----
create or replace function public.join_status(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_class uuid; v_title text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then return jsonb_build_object('member', false); end if;
  select l.class_id, c.title into v_class, v_title
    from public.class_join_links l join public.classes c on c.id = l.class_id where l.token = p_token;
  return jsonb_build_object('member', v_class is not null and exists (
    select 1 from public.class_students where class_id = v_class and student_id = v_uid), 'class_title', v_title);
end $$;

-- ---- privileges ----
revoke all on function private.email_blind_index(text), private.do_claim(uuid, bytea) from public, anon, authenticated;
revoke all on function public.claim_roster(text), public.bind_ticket_email(text, text), public.complete_pending_join(), public.join_status(text)
  from public, anon;
grant execute on function public.claim_roster(text), public.complete_pending_join(), public.join_status(text) to authenticated;
grant execute on function public.bind_ticket_email(text, text) to anon, authenticated;

insert into private.applied_migrations (version, name) values ('20261118000400', 'pending_join');

commit;
