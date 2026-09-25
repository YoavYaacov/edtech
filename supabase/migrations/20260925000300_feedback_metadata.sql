-- =====================================================================
-- Migration: 20260925000300_feedback_metadata
-- Phase 4 — decision 68: teacher-only metadata stays editable after release.
--
--   Student-facing feedback (verdict, message_md, released_at, submission_id,
--   teacher_id, return_for_revision, returned_at) remains IMMUTABLE after
--   release (decision 61; trigger unchanged). save_feedback stays closed
--   after release.
--   New explicit RPC save_feedback_metadata may update ONLY:
--     * feedback_private_notes
--     * the mistake tags of that submission
--
-- Also: tags are now replaced as a DIFF (remove missing, add new). A tag that
-- was attached and later archived can therefore be kept; attaching a NEW
-- archived / foreign-course tag is still rejected by the existing trigger.
-- save_feedback is redefined only to use that shared helper.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20260925000200') then
    raise exception 'Run 20260925000200_safe_delete_v2.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20260925000300') then
    raise exception 'Migration 20260925000300 already applied.';
  end if;
end $$;

-- Replace the tag set of one attempt as a diff. Caller checks ownership.
create or replace function private.set_submission_tags(p_submission_id uuid, p_tag_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[] := coalesce(p_tag_ids, '{}'::uuid[]);
begin
  delete from public.submission_mistakes
   where submission_id = p_submission_id and not (mistake_tag_id = any (v_ids));
  insert into public.submission_mistakes (submission_id, mistake_tag_id)
  select p_submission_id, t from (select distinct unnest(v_ids) as t) x
  where not exists (select 1 from public.submission_mistakes sm
                    where sm.submission_id = p_submission_id and sm.mistake_tag_id = x.t);
end;
$$;

-- save_feedback: unchanged except for using the shared tag helper.
create or replace function public.save_feedback(
  p_submission_id uuid, p_verdict text, p_message_md text, p_private_note text,
  p_mistake_tag_ids uuid[], p_return_for_revision boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c record;
  v_uid uuid := (select auth.uid());
  v_fid uuid;
  v_released timestamptz;
begin
  select * into c from private.submission_ctx(p_submission_id);
  if not found or c.owner_id is distinct from v_uid then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;
  if not c.is_latest then
    return jsonb_build_object('ok', false, 'reason', 'not_latest');
  end if;

  select id, released_at into v_fid, v_released from public.feedback where submission_id = p_submission_id for update;
  if v_released is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_released');
  end if;

  if v_fid is null then
    insert into public.feedback (submission_id, teacher_id, verdict, message_md, return_for_revision)
    values (p_submission_id, v_uid, nullif(p_verdict, ''), coalesce(p_message_md, ''), coalesce(p_return_for_revision, false))
    returning id into v_fid;
  else
    update public.feedback
       set verdict = nullif(p_verdict, ''), message_md = coalesce(p_message_md, ''),
           return_for_revision = coalesce(p_return_for_revision, false)
     where id = v_fid;
  end if;

  insert into public.feedback_private_notes (feedback_id, note_md)
  values (v_fid, coalesce(p_private_note, ''))
  on conflict (feedback_id) do update set note_md = excluded.note_md;

  perform private.set_submission_tags(p_submission_id, p_mistake_tag_ids);

  return jsonb_build_object('ok', true, 'feedback_id', v_fid,
    'ready', private.feedback_is_ready(nullif(p_verdict, ''), p_message_md));
end;
$$;

-- Teacher-only metadata of ANY attempt of the teacher's own assignment,
-- released or not. Never touches the feedback row itself.
create or replace function public.save_feedback_metadata(
  p_submission_id uuid, p_private_note text, p_mistake_tag_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_fid uuid;
begin
  if not private.owns_submission(p_submission_id) then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;
  select id into v_fid from public.feedback where submission_id = p_submission_id;
  if v_fid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_feedback');
  end if;

  insert into public.feedback_private_notes (feedback_id, note_md)
  values (v_fid, coalesce(p_private_note, ''))
  on conflict (feedback_id) do update set note_md = excluded.note_md;

  perform private.set_submission_tags(p_submission_id, p_mistake_tag_ids);
  return jsonb_build_object('ok', true, 'feedback_id', v_fid);
end;
$$;

revoke all on function private.set_submission_tags(uuid, uuid[]) from public;
revoke all on function public.save_feedback_metadata(uuid, text, uuid[]) from public, anon;
grant execute on function public.save_feedback_metadata(uuid, text, uuid[]) to authenticated;
-- save_feedback keeps its existing grants (create or replace preserves them)

insert into private.applied_migrations (version, name) values ('20260925000300', 'feedback_metadata');

commit;
