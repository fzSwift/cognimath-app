-- ============================================================
-- CogniMath — Supabase schema
-- Run this in your Supabase project: Dashboard → SQL Editor → New query
--
-- Written against the Supabase Postgres Best Practices skill:
--   * RLS policies wrap auth.uid()/helpers in (select ...) so they
--     evaluate ONCE per statement instead of per row.
--   * security definer helpers live in the private schema with
--     search_path = '' (NOT REST-exposed; EXECUTE must stay granted to
--     the API roles because policy expressions run as the querying user).
--   * policies scoped to the authenticated role + force RLS.
--   * check constraints enforce value ranges server-side.
--
-- After running, create at least one teacher account:
--   1. Dashboard → Authentication → Add user (e.g. teacher@cognimath.app)
--      (a profile row is created automatically by the trigger below)
--   2. Then promote them to teacher (only SQL / service role can do this):
--      update public.profiles set role = 'teacher' where id = '<their-user-id>';
--
-- Students who sign up from the app get a profile row automatically.
--
-- Safe to re-run: policies, triggers, functions, and grants are replaced.
-- `create table if not exists` will NOT reshape a table that already has
-- the wrong columns — if a past run drifted, drop that table first
-- (or clear the schema) and run this file again.
-- ============================================================

-- ---------- PROFILES (one row per auth user) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  avatar text not null default '🦉',
  role text not null default 'student' check (role in ('student', 'teacher')),
  points integer not null default 0 check (points >= 0),
  level integer not null default 1 check (level between 1 and 99),
  streak integer not null default 0 check (streak >= 0),
  created_at timestamptz not null default now()
);

-- ---------- GROUPS (teacher-created classes) ----------
-- A teacher owns their groups; students join via a 6-char code (join_group
-- RPC) or are assigned by their teacher (assign_to_group RPC). RLS scopes
-- everything downstream: a teacher sees only their own groups' students,
-- and students see groupmates' profiles for the class leaderboard.
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{4,12}$'),
  created_at timestamptz not null default now()
);
create index if not exists groups_teacher_idx on public.groups(teacher_id);
alter table public.groups drop constraint if exists groups_join_code_fmt;
alter table public.groups add constraint groups_join_code_fmt
  check (join_code ~ '^[A-Z0-9]{4,12}$');

-- a student belongs to at most one group; deleting a group keeps progress
-- (group_id becomes null, the student just drops off the class view)
alter table public.profiles add column if not exists group_id uuid references public.groups(id) on delete set null;
create index if not exists profiles_group_idx on public.profiles(group_id);

-- ---------- SESSIONS (one row per completed quiz run) ----------
create table if not exists public.sessions (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null,
  level integer not null,
  diff integer check (diff between 1 and 5),
  points integer not null default 0 check (points >= 0),
  correct integer not null default 0 check (correct >= 0),
  first_try_correct integer not null default 0 check (first_try_correct >= 0),
  retries integer not null default 0 check (retries >= 0),
  accuracy numeric(5,2) not null default 0 check (accuracy >= 0 and accuracy <= 100),
  stars integer not null default 0 check (stars between 0 and 3),
  max_combo integer not null default 0 check (max_combo >= 0),
  client_session_id uuid,                    -- idempotency key (submit_session dedupes)
  played_at timestamptz not null default now(),
  -- engine invariants, enforced server-side (defense in depth): a correct
  -- answer is either first-try or retry; combo can't exceed correct count
  check (correct = first_try_correct + retries),
  check (max_combo <= correct)
);
-- defensive: repair pre-existing tables that predate the column
-- (create table if not exists does NOT add missing columns)
alter table public.sessions add column if not exists client_session_id uuid;
create unique index if not exists sessions_client_id_idx
  on public.sessions(client_session_id) where client_session_id is not null;
-- RLS columns + the teacher dashboard's per-student history query
create index if not exists sessions_student_idx on public.sessions(student_id, played_at desc);
-- "active today" / date-window queries on the class dashboard
create index if not exists sessions_played_at_idx on public.sessions(played_at);

-- ---------- CONCEPT STRUGGLES (per student, per concept) ----------
create table if not exists public.concept_struggles (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  concept text not null,                        -- e.g. 'division:4'
  attempts integer not null default 0 check (attempts >= 0),
  wrong_first integer not null default 0 check (wrong_first >= 0 and wrong_first <= attempts),
  wrong_final integer not null default 0 check (wrong_final >= 0 and wrong_final <= attempts),
  timeouts integer not null default 0 check (timeouts >= 0),
  updated_at timestamptz not null default now(),
  unique (student_id, concept)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Students read their own profile and groupmates' leaderboard fields.
-- Teachers read only their own classes. Session and struggle rows are
-- teacher-only (the student app never reads them via REST).
-- Session/struggle WRITES go through submit_session, not REST.
-- ============================================================
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.concept_struggles enable row level security;
-- RLS applies even to the table owner (defense in depth)
alter table public.profiles force row level security;
alter table public.sessions force row level security;
alter table public.concept_struggles force row level security;

-- ---------- private helpers ----------
create schema if not exists private;

-- Is the current user a teacher? security definer + explicit auth.uid()
-- check inside, as required for definer functions.
create or replace function private.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'teacher'
  );
$$;

-- Is the current user the teacher of the given group?
create or replace function private.is_teacher_of_group(g uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups gr
    where gr.id = g and gr.teacher_id = (select auth.uid())
  );
$$;

-- Is the current user the teacher of the given student? (student in one of
-- the current user's groups)
create or replace function private.is_teacher_of_student(s uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles st
    join public.groups gr on gr.id = st.group_id
    where st.id = s and gr.teacher_id = (select auth.uid())
  );
$$;

-- Current user's class id. SECURITY DEFINER so the profiles SELECT
-- policy can compare group_id without querying profiles again (that
-- re-enters the same policy and Postgres raises 42P17 recursion).
create or replace function private.my_group_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.group_id from public.profiles p where p.id = (select auth.uid());
$$;

-- Auto-create a profile row whenever an auth user is created.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, avatar, role)
  values (
    new.id,
    left(coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(new.email, '@', 1),
      'Student'
    ), 64),
    '🦉',
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Role protection: only the service role (or SQL Editor, where auth.role()
-- is null) may set role = 'teacher'. Regular app users are always forced
-- to 'student', so nobody can self-promote and read the whole class.
create or replace function private.enforce_profile_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  _role text := auth.role();
begin
  if _role is not null and _role <> 'service_role' then
    if tg_op = 'INSERT' then
      new.role := 'student';
    elsif old.role <> 'teacher' then
      new.role := 'student';
    end if;
  end if;
  return new;
end;
$$;

-- IMPORTANT: do NOT revoke EXECUTE on functions referenced in RLS policies.
-- Policy expressions run with the privileges of the querying user (CREATE
-- POLICY docs), so the API roles must be able to execute them — revoking
-- makes every policy that calls the helper fail with "permission denied for
-- function" for ALL authenticated users, teachers included. The private
-- schema is not exposed to PostgREST, so there is no direct RPC surface to
-- protect; security comes from the SECURITY DEFINER bodies + auth.uid()
-- gating + RLS itself.
-- Authenticated MUST also have USAGE on schema private, or every policy
-- that calls these helpers fails with "permission denied for schema".
grant usage on schema private to authenticated;
grant execute on function private.is_teacher() to authenticated;
grant execute on function private.is_teacher_of_group(uuid) to authenticated;
grant execute on function private.is_teacher_of_student(uuid) to authenticated;
grant execute on function private.my_group_id() to authenticated;

-- Per-user write caps. submit_session already counts sessions rows;
-- this table covers RPCs and REST inserts that have no natural ledger.
create table if not exists private.rate_hits (
  uid uuid not null,
  bucket text not null,
  hit_at timestamptz not null default now()
);
create index if not exists rate_hits_uid_bucket_idx
  on private.rate_hits (uid, bucket, hit_at desc);
revoke all on private.rate_hits from public;
revoke all on private.rate_hits from anon;
revoke all on private.rate_hits from authenticated;

create or replace function private.check_rate(p_bucket text, p_max int, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid := (select auth.uid());
  n int;
begin
  if u is null then
    raise exception 'rate limit: not signed in';
  end if;
  if p_bucket is null or p_bucket = '' or p_max is null or p_max < 1 or p_window is null then
    raise exception 'rate limit: bad args';
  end if;
  perform pg_advisory_xact_lock(hashtext(u::text || ':' || p_bucket));
  delete from private.rate_hits h
    where h.uid = u and h.bucket = p_bucket and h.hit_at < now() - p_window;
  select count(*)::int into n
    from private.rate_hits h
    where h.uid = u and h.bucket = p_bucket;
  if n >= p_max then
    raise exception 'rate limit: too many requests - wait a few minutes';
  end if;
  insert into private.rate_hits (uid, bucket) values (u, p_bucket);
end;
$$;

revoke all on function private.check_rate(text, int, interval) from public;
revoke all on function private.check_rate(text, int, interval) from anon;
grant execute on function private.check_rate(text, int, interval) to authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.handle_new_user();

drop trigger if exists profiles_enforce_role on public.profiles;
create trigger profiles_enforce_role
  before insert or update on public.profiles
  for each row execute procedure private.enforce_profile_role();

-- ---------- policies ----------
-- (select auth.uid()) / (select private.is_teacher()) evaluate once per
-- statement; the group-scoped checks are correlated per row but ride the
-- profiles_group_idx index, so a class of 150 students is cheap.

alter table public.groups enable row level security;
alter table public.groups force row level security;

drop policy if exists "groups: teacher manages own" on public.groups;
drop policy if exists "groups: teacher read own" on public.groups;
-- Teachers may READ their own groups. Creates/renames go through
-- create_group (REST insert/update/delete on groups is not granted).
create policy "groups: teacher read own" on public.groups
  for select to authenticated
  using ((select private.is_teacher()) and teacher_id = (select auth.uid()));

-- PROFILES
-- Teachers see ONLY students in their own groups (not the whole class).
-- Students see groupmates' profiles (name/avatar/points) so the leaderboard
-- is class-based; everyone can still read their own row.
drop policy if exists "profiles: select own or teacher" on public.profiles;
drop policy if exists "profiles: insert own" on public.profiles;
drop policy if exists "profiles: select own, groupmates, or group teacher" on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
drop policy if exists "sessions: select own or teacher" on public.sessions;
drop policy if exists "sessions: insert own" on public.sessions;
drop policy if exists "sessions: select own or group teacher" on public.sessions;
drop policy if exists "sessions: teacher reads class" on public.sessions;
drop policy if exists "struggles: select own or teacher" on public.concept_struggles;
drop policy if exists "struggles: insert own" on public.concept_struggles;
drop policy if exists "struggles: update own" on public.concept_struggles;
drop policy if exists "struggles: select own or group teacher" on public.concept_struggles;
drop policy if exists "struggles: teacher reads class" on public.concept_struggles;

create policy "profiles: insert own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);
-- Own row: routing (role) and the profile screen.
-- Groupmates: leaderboard only (students, same class). Not other classes.
-- Teacher of that student: live class dashboard.
create policy "profiles: select own, groupmates, or group teacher" on public.profiles
  for select to authenticated
  using (
    (select auth.uid()) = id
    or (select private.is_teacher_of_student(id))
    or (
      role = 'student'
      and (select private.my_group_id()) is not null
      and group_id = (select private.my_group_id())
    )
  );
-- REST may change name/avatar only (column grants + score trigger).
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- SESSIONS / STRUGGLES: academic records. The student app never reads
-- these via REST (scores live on-device; the class board uses profiles).
-- Only the student's teacher can SELECT them. Writes stay on submit_session.
create policy "sessions: teacher reads class" on public.sessions
  for select to authenticated
  using ((select private.is_teacher_of_student(student_id)));

create policy "struggles: teacher reads class" on public.concept_struggles
  for select to authenticated
  using ((select private.is_teacher_of_student(student_id)));

-- ---------- group_id can only change via the RPCs ----------
-- RLS can't exclude a column, so a direct REST update could set group_id
-- without a code. This trigger rejects any group_id change unless the
-- session flag (set only by join_group / assign_to_group) is on — the
-- RPCs are SECURITY DEFINER and run in the same transaction, so the
-- setting is visible to the trigger.
create or replace function private.enforce_group_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.group_id is distinct from old.group_id
     and coalesce(current_setting('app.allow_group_change', true), '') <> '1' then
    raise exception 'group_id: join via the class code instead';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_group_change on public.profiles;
create trigger profiles_enforce_group_change
  before update of group_id on public.profiles
  for each row execute procedure private.enforce_group_change();

-- ---------- points / level / streak are server-side only ----------
-- RLS lets a student UPDATE their own profile (name/avatar). Without this
-- trigger they could REST-set points and win the class leaderboard. Same
-- pattern as group_id: freeze unless submit_session sets app.allow_score_update
-- in this transaction. auth.role() stays 'authenticated' inside SECURITY
-- DEFINER RPCs (it reads the JWT), so a service_role check is not enough.
-- SQL Editor has no JWT (role is null) and can still edit scores.
create or replace function private.enforce_profile_scores()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  _role text := auth.role();
begin
  if _role is not null and _role <> 'service_role'
     and coalesce(current_setting('app.allow_score_update', true), '') <> '1' then
    if tg_op = 'INSERT' then
      new.points := 0;
      new.level := 1;
      new.streak := 0;
    else
      new.points := old.points;
      new.level := old.level;
      new.streak := old.streak;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_scores on public.profiles;
create trigger profiles_enforce_scores
  before insert or update of points, level, streak on public.profiles
  for each row execute procedure private.enforce_profile_scores();

-- Recompute profile totals from sessions (engine.js: level = 1 + floor(points/500);
-- streak increments on a new calendar day, not on a second session today).
-- Called only from submit_session after the new row is in.
create or replace function private.refresh_profile_scores(p_uid uuid, p_new_session_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _prev date;
  _streak int;
  _total_pts int;
  _today date := (timezone('utc', now()))::date;
begin
  if p_uid is null or p_new_session_id is null then
    return;
  end if;
  select coalesce(sum(s.points), 0)::int into _total_pts
    from public.sessions s where s.student_id = p_uid;
  select p.streak into _streak from public.profiles p where p.id = p_uid;
  if exists (
    select 1 from public.sessions s
    where s.student_id = p_uid
      and s.id is distinct from p_new_session_id
      and (s.played_at at time zone 'utc')::date = _today
  ) then
    null;
  else
    select max((s.played_at at time zone 'utc')::date) into _prev
      from public.sessions s
      where s.student_id = p_uid
        and s.id is distinct from p_new_session_id;
    if _prev is null then
      _streak := 1;
    elsif _prev = _today - 1 then
      _streak := coalesce(_streak, 0) + 1;
    else
      _streak := 1;
    end if;
  end if;
  perform set_config('app.allow_score_update', '1', true);
  update public.profiles
    set points = _total_pts,
        level = least(99, 1 + (_total_pts / 500)),
        streak = greatest(coalesce(_streak, 1), 1)
    where id = p_uid;
end;
$$;

-- ---------- server-owned fields cannot be client-set ----------
-- REST may send teacher_id, student_id, created_at, completed_at.
-- For an authenticated JWT those are overwritten here. SQL Editor
-- (no JWT) and service_role are left alone.
create or replace function private.enforce_profile_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.name := left(btrim(regexp_replace(coalesce(new.name, ''), '[[:space:]]+', ' ', 'g')), 64);
  if new.name = '' then
    raise exception 'profiles: name required';
  end if;
  if new.avatar is null or btrim(new.avatar) = '' then
    new.avatar := '🦉';
  else
    new.avatar := left(btrim(new.avatar), 16);
  end if;
  if (select auth.role()) = 'authenticated' then
    if tg_op = 'INSERT' then
      new.id := (select auth.uid());
      new.created_at := now();
    else
      new.id := old.id;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_fields on public.profiles;
create trigger profiles_enforce_fields
  before insert or update on public.profiles
  for each row execute procedure private.enforce_profile_fields();

alter table public.profiles drop constraint if exists profiles_name_len;
alter table public.profiles add constraint profiles_name_len
  check (char_length(name) between 1 and 64);
alter table public.profiles drop constraint if exists profiles_avatar_len;
alter table public.profiles add constraint profiles_avatar_len
  check (char_length(avatar) between 1 and 16);

-- ---------- Writes are server-side only ----------
-- Sessions and struggle rows are written EXCLUSIVELY by the
-- submit_session RPC, which recomputes scores from per-question outcomes
-- (VULN-001 fix). Direct REST inserts/updates are locked down so a client
-- cannot fabricate points/accuracy/struggles. The RPC runs as a superuser
-- (SECURITY DEFINER), which bypasses RLS even with force row level
-- security — the auth.uid() gate inside the function is what scopes it.
-- (Drops leftover write policies from older schema revisions.)
drop policy if exists "sessions: insert own" on public.sessions;
drop policy if exists "struggles: insert own" on public.concept_struggles;
drop policy if exists "struggles: update own" on public.concept_struggles;

-- ============================================================
-- AGGREGATE VIEWS (teacher dashboards read these, not raw rows)
-- The dashboards aggregate per student in the browser today, which
-- forces them to download every session row (truncated at 500) and
-- recompute on every refresh. These views push the aggregation into
-- Postgres so a class of 150 students costs ~150 rows per refresh.
-- security_invoker = RLS on the base tables applies with the querying
-- user's privileges: students see their own totals, teachers see only
-- students in their groups (via is_teacher_of_student on sessions).
-- ============================================================
create or replace view public.student_totals
with (security_invoker = true) as
select
  student_id,
  count(*)::int as sessions,
  round(avg(accuracy), 1) as avg_accuracy,
  sum(points)::bigint as points,
  sum(stars)::bigint as stars,
  sum(correct)::bigint as correct,
  sum(first_try_correct)::bigint as first_try_correct,
  sum(retries)::bigint as retries,
  max(max_combo)::bigint as max_combo,
  max(played_at) as last_played
from public.sessions
group by student_id;

-- Per-student aggregates must be readable by the API roles (the RLS
-- policies on public.sessions already gate the rows beneath the view).
grant select on public.student_totals to authenticated;

-- ============================================================
-- SERVER-SIDE SCORING (VULN-001)
-- submit_session recomputes points/stars/accuracy from per-question
-- outcomes, exactly mirroring engine.js's scoring rules, and inserts the
-- session + struggle rows in one transaction. The client sends NO scores
-- at all — it only reports what happened on each question.
--
-- Per-question status codes (mirrors result.questions in engine.js):
--   p = pending (unanswered)  c = first-try correct  r = retry correct
--   w = wrong (no timeout)    t = timeout
-- Scoring rules (engine.js answerQuestion/endSession):
--   first-try: POINTS_BY_LEVEL[diff] ×2 when combo >= 3 (combo = consecutive
--   first-try corrects, reset ONLY by timeouts); retry: 40% rounded;
--   accuracy = firstTryCorrect / total (pending included);
--   stars = 3 if acc >= .9, 2 if >= .7, 1 if >= .5 else 0.
-- Keep this in lockstep with cognimath-app/src/core/engine.js!
--
-- Abuse protection: the RPC is the ONLY way to write sessions/struggles,
-- so per-student rate caps here stop a flooder (30 sessions/hour, 100/day;
-- a real session takes minutes — TIMER_SECONDS = 25 × 10 questions). A
-- client-generated p_client_session_id makes the RPC idempotent: resubmits
-- of the same session return the existing row instead of inserting dupes,
-- and rate checks ignore the current session's own id so retries never
-- get blocked by the limit they already count toward.
-- After insert, refresh_profile_scores writes profiles.points/level/streak
-- from the sessions sum (REST cannot set those columns).
-- ============================================================

-- replace previous signatures (no stale overloads)
drop function if exists public.submit_session(uuid, text, int, int, jsonb, jsonb);
drop function if exists public.submit_session(uuid, text, int, int, jsonb, uuid, jsonb);

create or replace function private.points_for_level(d int)
returns int
language sql
immutable
set search_path = ''
as $$ select case when d <= 1 then 10 when d = 2 then 15 when d = 3 then 20 when d = 4 then 25 else 30 end $$;

create or replace function public.submit_session(
  p_student_id uuid,
  p_topic text,
  p_level int,
  p_diff int,
  p_questions jsonb,
  p_client_session_id uuid,
  p_struggles jsonb default '[]'::jsonb,
  p_assignment_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  qq jsonb; sr jsonb;
  _s text; _d int; _concept text;
  _att int; _wf int; _wfl int; _to int;
  _points int := 0; _correct int := 0; _first int := 0; _retries int := 0;
  _combo int := 0; _max_combo int := 0; _total int := 0;
  _acc numeric; _stars int; _sid bigint; _existing bigint;
  _asg_group uuid; _asg_topic text; _asg_kind text;
begin
  -- JWT required. The client-sent id is checked, not trusted: a missing
  -- token, a mismatched id, or a teacher account all fail closed.
  if (select auth.uid()) is null then
    raise exception 'submit_session: not signed in';
  end if;
  if (select auth.uid()) is distinct from p_student_id then
    raise exception 'submit_session: not your session';
  end if;
  if exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'teacher'
  ) then
    raise exception 'submit_session: teachers cannot submit sessions';
  end if;
  if p_client_session_id is null then
    raise exception 'submit_session: missing client_session_id';
  end if;

  -- idempotency: a resubmit of the same session is a no-op, not a dupe
  select id into _existing
    from public.sessions
    where client_session_id = p_client_session_id
    limit 1;
  if _existing is not null then
    return jsonb_build_object('session_id', _existing, 'duplicate', true);
  end if;

  -- abuse protection: per-student rate caps. Played_at is covered by
  -- sessions_student_idx (student_id, played_at desc), so these counts are
  -- narrow index scans. The current session's own id is excluded so a retry
  -- (handled above) can never be blocked by the limit it already counts.
  if (select count(*) from public.sessions
      where student_id = p_student_id
        and played_at > now() - interval '1 hour'
        and client_session_id is distinct from p_client_session_id) >= 30 then
    raise exception 'submit_session: rate limit — too many sessions this hour';
  end if;
  if (select count(*) from public.sessions
      where student_id = p_student_id
        and played_at > now() - interval '1 day'
        and client_session_id is distinct from p_client_session_id) >= 100 then
    raise exception 'submit_session: rate limit — too many sessions today';
  end if;

  if p_topic is null or p_topic not in ('division', 'multiplication', 'addition', 'subtraction', 'mixed') then
    raise exception 'submit_session: bad topic';
  end if;
  if p_assignment_id is not null then
    select a.group_id, a.topic, a.kind into _asg_group, _asg_topic, _asg_kind
      from public.assignments a where a.id = p_assignment_id;
    if not found then
      raise exception 'submit_session: unknown assignment';
    end if;
    if not exists (
      select 1 from public.profiles p
      where p.id = p_student_id and p.group_id = _asg_group
    ) then
      raise exception 'submit_session: not in that class';
    end if;
    if p_topic is distinct from _asg_topic then
      raise exception 'submit_session: topic mismatch';
    end if;
    -- first hand-in is the study score; a second run cannot shop for a better mark
    if _asg_kind in ('term_start', 'term_end')
       and exists (
         select 1 from public.assignment_completions c
         where c.assignment_id = p_assignment_id and c.student_id = p_student_id
       ) then
      raise exception 'submit_session: term quiz already handed in';
    end if;
  end if;
  if p_level is null or p_level < 1 or p_level > 99 then
    raise exception 'submit_session: bad level';
  end if;
  if p_diff is null or p_diff < 1 or p_diff > 5 then
    raise exception 'submit_session: bad diff';
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array'
     or jsonb_array_length(p_questions) < 1 or jsonb_array_length(p_questions) > 20 then
    raise exception 'submit_session: bad questions payload';
  end if;

  -- replay the session and recompute every score server-side
  for qq in select * from jsonb_array_elements(p_questions) loop
    _total := _total + 1;
    _s := qq->>'s';
    _d := (qq->>'d')::int;
    if _s is null or _s not in ('p','c','r','w','t') or _d is null or _d < 1 or _d > 5 then
      raise exception 'submit_session: bad question payload';
    end if;
    if _s = 't' then
      _combo := 0;                       -- timeout resets the streak
    elsif _s = 'c' then
      _correct := _correct + 1;
      _first := _first + 1;
      _combo := _combo + 1;
      if _combo > _max_combo then _max_combo := _combo; end if;
      if _combo >= 3 then
        _points := _points + 2 * private.points_for_level(_d);
      else
        _points := _points + private.points_for_level(_d);
      end if;
    elsif _s = 'r' then
      _correct := _correct + 1;
      _retries := _retries + 1;
      _points := _points + round(private.points_for_level(_d) * 0.4);
    end if;
    -- 'w' and 'p' only count toward the accuracy denominator
  end loop;

  _acc := round((_first::numeric / greatest(_total, 1)) * 100, 2);
  _stars := case
    when _first::numeric / greatest(_total, 1) >= 0.9 then 3
    when _first::numeric / greatest(_total, 1) >= 0.7 then 2
    when _first::numeric / greatest(_total, 1) >= 0.5 then 1
    else 0 end;

  insert into public.sessions
    (student_id, topic, level, diff, points, correct, first_try_correct, retries, accuracy, stars, max_combo, client_session_id, assignment_id)
  values
    (p_student_id, p_topic, p_level, p_diff, _points, _correct, _first, _retries, _acc, _stars, _max_combo, p_client_session_id, p_assignment_id)
  returning id into _sid;

  if p_assignment_id is not null then
    insert into public.assignment_completions (assignment_id, student_id)
    values (p_assignment_id, p_student_id)
    on conflict (assignment_id, student_id) do nothing;
  end if;

  -- struggle tallies ride along in the same transaction
  if p_struggles is not null and jsonb_typeof(p_struggles) <> 'array' then
    raise exception 'submit_session: bad struggles payload';
  end if;
  for sr in select * from jsonb_array_elements(coalesce(p_struggles, '[]'::jsonb)) loop
    _concept := sr->>'concept';
    _att := coalesce((sr->>'attempts')::int, 0);
    _wf := coalesce((sr->>'wrong_first')::int, 0);
    _wfl := coalesce((sr->>'wrong_final')::int, 0);
    _to := coalesce((sr->>'timeouts')::int, 0);
    if _concept is null or char_length(_concept) > 40
       or _att < 0 or _wf < 0 or _wfl < 0 or _to < 0 or _wf > _att or _wfl > _att then
      raise exception 'submit_session: bad struggle payload';
    end if;
    insert into public.concept_struggles
      (student_id, concept, attempts, wrong_first, wrong_final, timeouts, updated_at)
    values
      (p_student_id, _concept, _att, _wf, _wfl, _to, now())
    on conflict (student_id, concept) do update
      set attempts = excluded.attempts, wrong_first = excluded.wrong_first,
          wrong_final = excluded.wrong_final, timeouts = excluded.timeouts,
          updated_at = excluded.updated_at;
  end loop;

  perform private.refresh_profile_scores(p_student_id, _sid);

  return jsonb_build_object(
    'session_id', _sid, 'duplicate', false, 'points', _points, 'stars', _stars,
    'accuracy', _acc, 'correct', _correct, 'first_try_correct', _first,
    'retries', _retries, 'max_combo', _max_combo
  );
end;
$$;

grant execute on function public.submit_session(uuid, text, int, int, jsonb, uuid, jsonb, bigint) to authenticated;
revoke all on function public.submit_session(uuid, text, int, int, jsonb, uuid, jsonb, bigint) from public;
revoke all on function public.submit_session(uuid, text, int, int, jsonb, uuid, jsonb, bigint) from anon;

-- ============================================================
-- GROUPS (classes)
-- Teachers create groups and assign students; students join with a
-- 6-char code. All writes to profiles.group_id happen ONLY through these
-- RPCs (the enforce_group_change trigger blocks direct REST updates).
-- ============================================================

-- Teacher: create a group, returns its join code.
create or replace function public.create_group(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _tid uuid; _code text; _gid uuid;
begin
  if (select private.is_teacher()) is not true then
    raise exception 'create_group: teachers only';
  end if;
  perform private.check_rate('create_group', 8, interval '1 hour');
  _tid := (select auth.uid());
  p_name := btrim(regexp_replace(coalesce(p_name, ''), '[[:space:]]+', ' ', 'g'));
  if p_name is null or char_length(p_name) < 1 or char_length(p_name) > 60 then
    raise exception 'create_group: bad name';
  end if;
  loop
    _code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.groups where join_code = _code);
  end loop;
  insert into public.groups (name, teacher_id, join_code)
  values (p_name, _tid, _code)
  returning id into _gid;
  return jsonb_build_object('group_id', _gid, 'join_code', _code, 'name', p_name);
end;
$$;

grant execute on function public.create_group(text) to authenticated;
revoke all on function public.create_group(text) from public;
revoke all on function public.create_group(text) from anon;

-- Student: join a class by code. The app.allow_group_change flag lets the
-- update through the enforce_group_change trigger.
create or replace function public.join_group(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _gid uuid; _name text; _uid uuid;
begin
  _uid := (select auth.uid());
  if _uid is null then raise exception 'join_group: not signed in'; end if;
  perform private.check_rate('join_group', 8, interval '15 minutes');
  if exists (select 1 from public.profiles p where p.id = _uid and p.role = 'teacher') then
    raise exception 'join_group: teachers cannot join a class as a student';
  end if;
  p_code := upper(btrim(coalesce(p_code, '')));
  if p_code !~ '^[A-Z0-9]{4,12}$' then
    raise exception 'join_group: bad code';
  end if;
  select id, name into _gid, _name
    from public.groups where p_code = join_code;
  if _gid is null then raise exception 'join_group: no class with that code'; end if;
  perform set_config('app.allow_group_change', '1', true);
  update public.profiles set group_id = _gid where id = _uid;
  return jsonb_build_object('group_id', _gid, 'name', _name);
end;
$$;

grant execute on function public.join_group(text) to authenticated;
revoke all on function public.join_group(text) from public;
revoke all on function public.join_group(text) from anon;

-- Student/teacher: the current user's own group (students only — teachers
-- use teacher_groups). No join_code here: the code is the teacher's to
-- hand out, not a field students should see again.
create or replace function public.my_group()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_build_object('id', g.id, 'name', g.name),
    'null'::jsonb
  )
  from public.profiles p
  left join public.groups g on g.id = p.group_id
  where p.id = (select auth.uid());
$$;

grant execute on function public.my_group() to authenticated;
revoke all on function public.my_group() from public;
revoke all on function public.my_group() from anon;

-- Teacher: all of the current teacher's groups.
create or replace function public.teacher_groups()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'join_code', g.join_code)
              order by g.created_at),
    '[]'::jsonb
  )
  from public.groups g
  where g.teacher_id = (select auth.uid())
    and (select private.is_teacher());
$$;

grant execute on function public.teacher_groups() to authenticated;
revoke all on function public.teacher_groups() from public;
revoke all on function public.teacher_groups() from anon;

-- Teacher: profiles with no group yet, so they can assign students.
-- Only name/avatar/id are exposed — nothing else. Teacher-gated: a
-- student must not be able to enumerate the class roster.
create or replace function public.ungrouped_students()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'avatar', p.avatar)
              order by p.created_at desc),
    '[]'::jsonb
  )
  from public.profiles p
  where p.group_id is null
    and p.role = 'student'
    and (select private.is_teacher());
$$;

grant execute on function public.ungrouped_students() to authenticated;
revoke all on function public.ungrouped_students() from public;
revoke all on function public.ungrouped_students() from anon;

-- Teacher: put a student into one of the teacher's own groups.
create or replace function public.assign_to_group(p_student_id uuid, p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.is_teacher()) is not true then
    raise exception 'assign_to_group: teachers only';
  end if;
  perform private.check_rate('assign_to_group', 40, interval '1 hour');
  if not exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.teacher_id = (select auth.uid())
  ) then
    raise exception 'assign_to_group: not your group';
  end if;
  if not exists (
    select 1 from public.profiles p where p.id = p_student_id and p.role = 'student'
  ) then
    raise exception 'assign_to_group: no such student';
  end if;
  perform set_config('app.allow_group_change', '1', true);
  update public.profiles set group_id = p_group_id where id = p_student_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.assign_to_group(uuid, uuid) to authenticated;
revoke all on function public.assign_to_group(uuid, uuid) from public;
revoke all on function public.assign_to_group(uuid, uuid) from anon;

-- ============================================================
-- TEACHER QUESTIONS (per class, per category)
-- Teachers write the quiz items students see. Students in that
-- class may READ them; only the class teacher may write.
-- If a class has no rows for a topic, the app falls back to the
-- built-in generators so demo/offline play still works.
-- ============================================================
create table if not exists public.teacher_questions (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null check (topic in ('division', 'multiplication', 'addition', 'subtraction')),
  level integer not null check (level between 1 and 5),
  prompt text not null check (char_length(prompt) between 1 and 280),
  answer numeric not null check (answer >= -1000000000 and answer <= 1000000000),
  options jsonb check (options is null or (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 6
  )),
  created_at timestamptz not null default now()
);
alter table public.teacher_questions drop constraint if exists teacher_questions_options_check;
alter table public.teacher_questions add constraint teacher_questions_options_check
  check (options is null or (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 6
  ));
alter table public.teacher_questions drop constraint if exists teacher_questions_answer_range;
alter table public.teacher_questions add constraint teacher_questions_answer_range
  check (answer >= -1000000000 and answer <= 1000000000);
create index if not exists teacher_questions_group_topic_idx
  on public.teacher_questions(group_id, topic, level);
create index if not exists teacher_questions_teacher_idx
  on public.teacher_questions(teacher_id);

alter table public.teacher_questions enable row level security;
alter table public.teacher_questions force row level security;

drop policy if exists "teacher_questions: teacher manage own class" on public.teacher_questions;
drop policy if exists "teacher_questions: teacher read class" on public.teacher_questions;
drop policy if exists "teacher_questions: teacher insert class" on public.teacher_questions;
drop policy if exists "teacher_questions: teacher delete class" on public.teacher_questions;
drop policy if exists "teacher_questions: student read class" on public.teacher_questions;

create policy "teacher_questions: teacher read class"
  on public.teacher_questions
  for select to authenticated
  using ((select private.is_teacher_of_group(group_id)));

create policy "teacher_questions: teacher insert class"
  on public.teacher_questions
  for insert to authenticated
  with check (
    (select private.is_teacher_of_group(group_id))
    and teacher_id = (select auth.uid())
  );

create policy "teacher_questions: teacher delete class"
  on public.teacher_questions
  for delete to authenticated
  using (
    (select private.is_teacher_of_group(group_id))
    and teacher_id = (select auth.uid())
  );

create policy "teacher_questions: student read class"
  on public.teacher_questions
  for select to authenticated
  using (group_id = (select private.my_group_id()));

-- ============================================================
-- ASSIGNMENTS (classwork, take-home, and term quizzes)
-- A teacher posts work for one class. Students in that class
-- read it and hand it in by finishing a session.
-- Completions are per student; teachers can see who has handed in.
--
-- Term quizzes (kind term_start / term_end): one mixed ÷ × + −
-- paper at the start of term and one at the end. Scores come
-- from submit_session (sessions.assignment_id), not client writes.
-- ============================================================
create table if not exists public.assignments (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null check (topic in ('division', 'multiplication', 'addition', 'subtraction', 'mixed')),
  kind text not null check (kind in ('classwork', 'homework', 'term_start', 'term_end')),
  title text not null check (char_length(title) between 1 and 80),
  note text check (note is null or char_length(note) <= 280),
  level integer not null default 1 check (level between 1 and 5),
  due_on date check (due_on is null or (due_on >= date '2020-01-01' and due_on <= date '2100-12-31')),
  created_at timestamptz not null default now()
);
create index if not exists assignments_group_idx
  on public.assignments(group_id, created_at desc);
create index if not exists assignments_teacher_idx
  on public.assignments(teacher_id);
-- one start-of-term and one end-of-term paper per class
create unique index if not exists assignments_one_term_quiz_idx
  on public.assignments(group_id, kind)
  where kind in ('term_start', 'term_end');

-- repair pre-existing assignments tables (create table if not exists
-- does not reshape check constraints)
alter table public.assignments drop constraint if exists assignments_topic_check;
alter table public.assignments add constraint assignments_topic_check
  check (topic in ('division', 'multiplication', 'addition', 'subtraction', 'mixed'));
alter table public.assignments drop constraint if exists assignments_kind_check;
alter table public.assignments add constraint assignments_kind_check
  check (kind in ('classwork', 'homework', 'term_start', 'term_end'));
alter table public.assignments drop constraint if exists assignments_due_on_range;
alter table public.assignments add constraint assignments_due_on_range
  check (due_on is null or (due_on >= date '2020-01-01' and due_on <= date '2100-12-31'));

-- tag which paper a session belongs to (set only by submit_session)
alter table public.sessions add column if not exists assignment_id bigint
  references public.assignments(id) on delete set null;
create index if not exists sessions_assignment_idx
  on public.sessions(assignment_id)
  where assignment_id is not null;

create table if not exists public.assignment_completions (
  assignment_id bigint not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (assignment_id, student_id)
);
create index if not exists assignment_completions_student_idx
  on public.assignment_completions(student_id);

alter table public.assignments enable row level security;
alter table public.assignments force row level security;
alter table public.assignment_completions enable row level security;
alter table public.assignment_completions force row level security;

drop policy if exists "assignments: teacher manage own class" on public.assignments;
drop policy if exists "assignments: teacher read class" on public.assignments;
drop policy if exists "assignments: teacher insert class" on public.assignments;
drop policy if exists "assignments: teacher delete class" on public.assignments;
drop policy if exists "assignments: student read class" on public.assignments;
drop policy if exists "assignment_completions: teacher read class" on public.assignment_completions;
drop policy if exists "assignment_completions: student own" on public.assignment_completions;
drop policy if exists "assignment_completions: student write classwork" on public.assignment_completions;
drop policy if exists "assignment_completions: student insert classwork" on public.assignment_completions;

create policy "assignments: teacher read class"
  on public.assignments
  for select to authenticated
  using ((select private.is_teacher_of_group(group_id)));

create policy "assignments: teacher insert class"
  on public.assignments
  for insert to authenticated
  with check (
    (select private.is_teacher_of_group(group_id))
    and teacher_id = (select auth.uid())
  );

create policy "assignments: teacher delete class"
  on public.assignments
  for delete to authenticated
  using (
    (select private.is_teacher_of_group(group_id))
    and teacher_id = (select auth.uid())
  );

create policy "assignments: student read class"
  on public.assignments
  for select to authenticated
  using (group_id = (select private.my_group_id()));

create policy "assignment_completions: teacher read class"
  on public.assignment_completions
  for select to authenticated
  using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and (select private.is_teacher_of_group(a.group_id))
    )
  );

create policy "assignment_completions: student own"
  on public.assignment_completions
  for select to authenticated
  using (student_id = (select auth.uid()));

-- classwork/homework hand-in: insert only (no update/delete). Term-quiz
-- completions are written only by submit_session.
create policy "assignment_completions: student insert classwork"
  on public.assignment_completions
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and a.kind in ('classwork', 'homework')
        and a.group_id = (select private.my_group_id())
    )
  );

create or replace function private.enforce_assignment_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.title := left(btrim(regexp_replace(coalesce(new.title, ''), '[[:space:]]+', ' ', 'g')), 80);
  if new.title = '' then
    raise exception 'assignments: title required';
  end if;
  if new.note is not null then
    new.note := nullif(left(btrim(new.note), 280), '');
  end if;
  new.level := least(5, greatest(1, coalesce(new.level, 1)));
  if new.topic not in ('division', 'multiplication', 'addition', 'subtraction', 'mixed') then
    raise exception 'assignments: bad topic';
  end if;
  if new.kind not in ('classwork', 'homework', 'term_start', 'term_end') then
    raise exception 'assignments: bad kind';
  end if;
  if new.due_on is not null and (new.due_on < date '2020-01-01' or new.due_on > date '2100-12-31') then
    raise exception 'assignments: bad due date';
  end if;
  if (select auth.role()) = 'authenticated' then
    if tg_op = 'INSERT' then
      new.teacher_id := (select auth.uid());
      new.created_at := now();
    else
      new.teacher_id := old.teacher_id;
      new.created_at := old.created_at;
      new.group_id := old.group_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_enforce_fields on public.assignments;
create trigger assignments_enforce_fields
  before insert or update on public.assignments
  for each row execute procedure private.enforce_assignment_fields();

create or replace function private.enforce_question_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.prompt := left(btrim(regexp_replace(coalesce(new.prompt, ''), '[[:space:]]+', ' ', 'g')), 280);
  if new.prompt = '' then
    raise exception 'teacher_questions: prompt required';
  end if;
  new.level := least(5, greatest(1, coalesce(new.level, 1)));
  if new.topic not in ('division', 'multiplication', 'addition', 'subtraction') then
    raise exception 'teacher_questions: bad topic';
  end if;
  if new.answer is null or new.answer < -1000000000 or new.answer > 1000000000 then
    raise exception 'teacher_questions: bad answer';
  end if;
  if new.options is not null then
    if jsonb_typeof(new.options) <> 'array' then
      new.options := null;
    else
      select coalesce(jsonb_agg(e.value), '[]'::jsonb) into new.options
        from jsonb_array_elements(new.options) e
        where jsonb_typeof(e.value) = 'number'
          and (e.value)::numeric between -1000000000 and 1000000000;
      if jsonb_array_length(new.options) < 2 or jsonb_array_length(new.options) > 6 then
        new.options := null;
      end if;
    end if;
  end if;
  if (select auth.role()) = 'authenticated' then
    if tg_op = 'INSERT' then
      new.teacher_id := (select auth.uid());
      new.created_at := now();
    else
      new.teacher_id := old.teacher_id;
      new.created_at := old.created_at;
      new.group_id := old.group_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists teacher_questions_enforce_fields on public.teacher_questions;
create trigger teacher_questions_enforce_fields
  before insert or update on public.teacher_questions
  for each row execute procedure private.enforce_question_fields();

create or replace function private.enforce_completion_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.role()) = 'authenticated' then
    if tg_op = 'INSERT' then
      new.student_id := (select auth.uid());
      new.completed_at := now();
    else
      new.student_id := old.student_id;
      new.assignment_id := old.assignment_id;
      new.completed_at := old.completed_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists assignment_completions_enforce_fields on public.assignment_completions;
create trigger assignment_completions_enforce_fields
  before insert or update on public.assignment_completions
  for each row execute procedure private.enforce_completion_fields();

create or replace function private.rate_assignments()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.role()) = 'authenticated' then
    perform private.check_rate('assignments', 20, interval '1 hour');
  end if;
  return new;
end;
$$;
drop trigger if exists assignments_rate on public.assignments;
create trigger assignments_rate
  before insert on public.assignments
  for each row execute procedure private.rate_assignments();

create or replace function private.rate_questions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.role()) = 'authenticated' then
    perform private.check_rate('teacher_questions', 60, interval '1 hour');
  end if;
  return new;
end;
$$;
drop trigger if exists teacher_questions_rate on public.teacher_questions;
create trigger teacher_questions_rate
  before insert on public.teacher_questions
  for each row execute procedure private.rate_questions();

create or replace function private.rate_completions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.role()) = 'authenticated' then
    perform private.check_rate('assignment_completions', 20, interval '1 hour');
  end if;
  return new;
end;
$$;
drop trigger if exists assignment_completions_rate on public.assignment_completions;
create trigger assignment_completions_rate
  before insert on public.assignment_completions
  for each row execute procedure private.rate_completions();

create or replace function private.rate_profile_writes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.role()) = 'authenticated' then
    perform private.check_rate('profiles', 20, interval '1 hour');
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_rate on public.profiles;
create trigger profiles_rate
  before update of name, avatar on public.profiles
  for each row execute procedure private.rate_profile_writes();

-- ============================================================
-- API PRIVILEGES
-- SQL Editor creates objects as postgres. Grant the authenticated
-- role exactly what the apps need; RLS still filters every row.
-- anon may SELECT profiles only so the signed-out health probe works
-- (policies are `to authenticated`, so the result is always empty).
-- ============================================================
grant usage on schema public to authenticated;

-- Name/avatar only on REST. points/level/streak are frozen by the
-- trigger and written only by submit_session. Groups are created via
-- create_group, never by a direct insert.
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant insert (id, name, avatar) on public.profiles to authenticated;
grant update (name, avatar) on public.profiles to authenticated;

revoke insert, update, delete on public.groups from authenticated;
grant select on public.groups to authenticated;
grant select on public.sessions to authenticated;
grant select on public.concept_struggles to authenticated;
revoke insert, update, delete on public.teacher_questions from authenticated;
grant select, delete on public.teacher_questions to authenticated;
grant insert (group_id, topic, level, prompt, answer, options) on public.teacher_questions to authenticated;

revoke insert, update, delete on public.assignments from authenticated;
grant select, delete on public.assignments to authenticated;
grant insert (group_id, topic, kind, title, note, level, due_on) on public.assignments to authenticated;

revoke insert, update, delete on public.assignment_completions from authenticated;
grant select on public.assignment_completions to authenticated;
grant insert (assignment_id) on public.assignment_completions to authenticated;
grant select on public.student_totals to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on public.profiles from public;
revoke all on public.groups from public;
revoke all on public.sessions from public;
revoke all on public.concept_struggles from public;
revoke all on public.teacher_questions from public;
revoke all on public.assignments from public;
revoke all on public.assignment_completions from public;
revoke all on public.student_totals from public;

-- The login screen probes public.profiles while signed out (anon).
-- GRANT SELECT lets that probe succeed; RLS still returns zero rows
-- because every policy is `to authenticated`. Do NOT revoke this.
grant select on public.profiles to anon;

revoke all on public.groups from anon;
revoke all on public.sessions from anon;
revoke all on public.concept_struggles from anon;
revoke all on public.teacher_questions from anon;
revoke all on public.assignments from anon;
revoke all on public.assignment_completions from anon;
revoke all on public.student_totals from anon;

-- ============================================================
-- REALTIME
-- Teacher dashboards subscribe to class changes so they update the
-- moment a student's submit_session lands — no polling, no manual
-- refresh. The dashboards use events only as a *trigger* to refetch
-- the aggregate views; they never stream rows into client state.
-- RLS filters realtime broadcasts per subscriber, so teachers see
-- the whole class and students see only their own rows.
-- ============================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessions') then
      alter publication supabase_realtime add table public.sessions;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'concept_struggles') then
      alter publication supabase_realtime add table public.concept_struggles;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
      alter publication supabase_realtime add table public.profiles;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'groups') then
      alter publication supabase_realtime add table public.groups;
    end if;
  end if;
end $$;
