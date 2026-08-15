/* CogniMath rate-limit patch. Safe to re-run. Do not run schema.sql.

   Per-user caps on class joins, class creates, and REST writes.
   Quiz submits were already capped (30/hour, 100/day). Paste this
   whole file into the SQL Editor. */

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
