-- =====================================================================
-- Migration: 20261118000200_class_board   (batch 5)
-- Class announcement board with optional student comments.
--
-- Access: both tables have RLS ON and NO client privileges. Every read/write goes through
-- SECURITY DEFINER functions that re-check inside the database:
--   * write posts / pin / lock / delete any comment -> the class owner only
--   * read posts and comments                        -> the class owner and members of THAT class
--   * comment                                        -> members only when the post is 'open';
--                                                       the owner whenever comments are not 'off'
--   * delete a comment                               -> its author, or the class owner
-- Students see other students as "First L."; the teacher sees full names.
-- Lesson / assignment links reuse existing tables (same subject, owned by the teacher).
-- Prerequisite: 20261118000100. Not applied to any database by this file's author.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20261118000100') then
    raise exception 'Run 20261118000100_join_links_and_identity.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20261118000200') then
    raise exception 'Migration 20261118000200 already applied.';
  end if;
end $$;

create table public.class_posts (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references public.classes (id) on delete restrict,
  author_id      uuid not null references public.profiles (id) on delete restrict,
  body           text not null check (char_length(btrim(body)) between 1 and 4000),
  pinned         boolean not null default false,
  comments_mode  text not null default 'off' check (comments_mode in ('off', 'open', 'locked')),
  lesson_id      uuid references public.lessons (id) on delete set null,
  assignment_id  uuid references public.assignments (id) on delete set null,
  created_at     timestamptz not null default now(),
  edited_at      timestamptz
);
create index class_posts_feed_idx on public.class_posts (class_id, pinned desc, created_at desc);

create table public.class_post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.class_posts (id) on delete restrict,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index class_post_comments_post_idx on public.class_post_comments (post_id, created_at);
create index class_post_comments_author_idx on public.class_post_comments (author_id, created_at desc);

alter table public.class_posts         enable row level security;
alter table public.class_post_comments enable row level security;
revoke all on public.class_posts, public.class_post_comments from public, anon, authenticated;

create or replace function private.is_class_member(p_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.class_students where class_id = p_class_id and student_id = (select auth.uid()))
$$;

create or replace function private.person_name(p_id uuid, p_full boolean)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when p_full or p.role = 'teacher'
      then coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), nullif(btrim(p.full_name), ''), '—')
    else coalesce(nullif(p.first_name, ''), nullif(split_part(btrim(p.full_name), ' ', 1), ''), '—')
         || case when coalesce(p.last_name, '') <> '' then ' ' || left(p.last_name, 1) || '.' else '' end
  end
  from public.profiles p where p.id = p_id
$$;

create or replace function private.check_post_links(p_class_id uuid, p_lesson_id uuid, p_assignment_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_course uuid := (select course_id from public.classes where id = p_class_id);
begin
  if p_lesson_id is not null and not exists (
       select 1 from public.lessons l where l.id = p_lesson_id and l.course_id = v_course and l.owner_id = (select auth.uid())) then
    return 'bad_lesson';
  end if;
  if p_assignment_id is not null and not exists (
       select 1 from public.assignments a where a.id = p_assignment_id and a.course_id = v_course and a.owner_id = (select auth.uid())
         and a.status = 'published') then
    return 'bad_assignment';
  end if;
  return null;
end $$;

create or replace function public.create_class_post(
  p_class_id uuid, p_body text, p_pinned boolean default false, p_comments_mode text default 'off',
  p_lesson_id uuid default null, p_assignment_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_why text; v_id uuid; v_body text := btrim(coalesce(p_body, ''));
begin
  if not private.is_teacher() or not private.owns_class(p_class_id) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  if char_length(v_body) not between 1 and 4000 or p_comments_mode not in ('off', 'open', 'locked') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;
  v_why := private.check_post_links(p_class_id, p_lesson_id, p_assignment_id);
  if v_why is not null then return jsonb_build_object('ok', false, 'reason', v_why); end if;
  insert into public.class_posts (class_id, author_id, body, pinned, comments_mode, lesson_id, assignment_id)
  values (p_class_id, (select auth.uid()), v_body, coalesce(p_pinned, false), p_comments_mode, p_lesson_id, p_assignment_id)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.update_class_post(
  p_post_id uuid, p_body text, p_pinned boolean, p_comments_mode text, p_lesson_id uuid, p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_why text; v_body text := btrim(coalesce(p_body, ''));
begin
  select * into r from public.class_posts where id = p_post_id for update;
  if not found or not private.is_teacher() or not private.owns_class(r.class_id) then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  if char_length(v_body) not between 1 and 4000 or p_comments_mode not in ('off', 'open', 'locked') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;
  v_why := private.check_post_links(r.class_id, p_lesson_id, p_assignment_id);
  if v_why is not null then return jsonb_build_object('ok', false, 'reason', v_why); end if;
  update public.class_posts
     set body = v_body, pinned = coalesce(p_pinned, false), comments_mode = p_comments_mode,
         lesson_id = p_lesson_id, assignment_id = p_assignment_id,
         edited_at = case when r.body is distinct from v_body then now() else r.edited_at end
   where id = p_post_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.set_class_post_flags(p_post_id uuid, p_pinned boolean, p_comments_mode text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_class uuid;
begin
  select class_id into v_class from public.class_posts where id = p_post_id;
  if v_class is null or not private.is_teacher() or not private.owns_class(v_class) then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  if p_comments_mode not in ('off', 'open', 'locked') then raise exception 'Invalid mode' using errcode = '22023'; end if;
  update public.class_posts set pinned = coalesce(p_pinned, false), comments_mode = p_comments_mode where id = p_post_id;
end $$;

create or replace function public.delete_class_post(p_post_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_class uuid;
begin
  select class_id into v_class from public.class_posts where id = p_post_id for update;
  if v_class is null or not private.is_teacher() or not private.owns_class(v_class) then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  delete from public.class_post_comments where post_id = p_post_id;
  delete from public.class_posts where id = p_post_id;
end $$;

create or replace function public.list_class_posts(p_class_id uuid, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_owner boolean := private.is_teacher() and private.owns_class(p_class_id);
begin
  if not v_owner and not private.is_class_member(p_class_id) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_agg(s.x order by s.pinned desc, s.created_at desc)
    from (
      select p.pinned, p.created_at, jsonb_build_object(
        'id', p.id, 'body', p.body, 'pinned', p.pinned, 'comments_mode', p.comments_mode,
        'created_at', p.created_at, 'edited_at', p.edited_at,
        'author_name', private.person_name(p.author_id, true),
        'lesson', (select jsonb_build_object('id', l.id, 'title', l.title) from public.lessons l where l.id = p.lesson_id),
        'assignment', (select jsonb_build_object('id', a.id, 'title', a.title) from public.assignments a where a.id = p.assignment_id),
        'comment_count', (select count(*) from public.class_post_comments c where c.post_id = p.id)) as x
      from public.class_posts p
      where p.class_id = p_class_id
      order by p.pinned desc, p.created_at desc
      limit greatest(1, least(coalesce(p_limit, 50), 100))
    ) s), '[]'::jsonb);
end $$;

create or replace function public.my_classes()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('class_id', c.id, 'class_title', c.title, 'course_id', co.id, 'course_title', co.title)
                            order by co.title, c.title), '[]'::jsonb)
  from public.class_students cs join public.classes c on c.id = cs.class_id join public.courses co on co.id = c.course_id
  where cs.student_id = (select auth.uid())
$$;

create or replace function public.list_post_comments(p_post_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_class uuid; v_owner boolean; v_uid uuid := (select auth.uid());
begin
  select class_id into v_class from public.class_posts where id = p_post_id;
  v_owner := v_class is not null and private.is_teacher() and private.owns_class(v_class);
  if v_class is null or (not v_owner and not private.is_class_member(v_class)) then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'body', c.body, 'created_at', c.created_at,
      'author_name', private.person_name(c.author_id, v_owner),
      'mine', c.author_id = v_uid, 'can_delete', v_owner or c.author_id = v_uid) order by c.created_at)
    from public.class_post_comments c where c.post_id = p_post_id), '[]'::jsonb);
end $$;

create or replace function public.add_post_comment(p_post_id uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); r record; v_found boolean; v_owner boolean;
        v_body text := btrim(coalesce(p_body, '')); v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into r from public.class_posts where id = p_post_id;
  v_found := found;
  v_owner := v_found and private.is_teacher() and private.owns_class(r.class_id);
  if not v_found or (not v_owner and not private.is_class_member(r.class_id)) then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  if char_length(v_body) not between 1 and 1000 then return jsonb_build_object('ok', false, 'reason', 'invalid_input'); end if;
  if v_owner then
    if r.comments_mode = 'off' then return jsonb_build_object('ok', false, 'reason', 'comments_off'); end if;
  else
    if r.comments_mode <> 'open' then
      return jsonb_build_object('ok', false, 'reason', case r.comments_mode when 'locked' then 'locked' else 'comments_off' end);
    end if;
    if (select count(*) from public.class_post_comments where author_id = v_uid and created_at > now() - interval '10 minutes') >= 20 then
      return jsonb_build_object('ok', false, 'reason', 'rate_limited');
    end if;
  end if;
  insert into public.class_post_comments (post_id, author_id, body) values (p_post_id, v_uid, v_body) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.delete_post_comment(p_comment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); r record;
begin
  select c.id, c.author_id, p.class_id into r
    from public.class_post_comments c join public.class_posts p on p.id = c.post_id where c.id = p_comment_id;
  if not found or not (r.author_id = v_uid or (private.is_teacher() and private.owns_class(r.class_id))) then
    raise exception 'Comment not found' using errcode = 'P0002';
  end if;
  delete from public.class_post_comments where id = p_comment_id;
end $$;

create or replace function public.delete_class(p_class_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_course uuid; v_members int; v_statuses int;
begin
  select course_id into v_course from public.classes where id = p_class_id for update;
  if v_course is null or not private.owns_course(v_course) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
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

revoke all on function private.is_class_member(uuid), private.person_name(uuid, boolean), private.check_post_links(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function
  public.create_class_post(uuid, text, boolean, text, uuid, uuid), public.update_class_post(uuid, text, boolean, text, uuid, uuid),
  public.set_class_post_flags(uuid, boolean, text), public.delete_class_post(uuid), public.list_class_posts(uuid, integer),
  public.my_classes(), public.list_post_comments(uuid), public.add_post_comment(uuid, text), public.delete_post_comment(uuid),
  public.delete_class(uuid)
  from public, anon;
grant execute on function
  public.create_class_post(uuid, text, boolean, text, uuid, uuid), public.update_class_post(uuid, text, boolean, text, uuid, uuid),
  public.set_class_post_flags(uuid, boolean, text), public.delete_class_post(uuid), public.list_class_posts(uuid, integer),
  public.my_classes(), public.list_post_comments(uuid), public.add_post_comment(uuid, text), public.delete_post_comment(uuid),
  public.delete_class(uuid)
  to authenticated;

insert into private.applied_migrations (version, name) values ('20261118000200', 'class_board');

commit;
