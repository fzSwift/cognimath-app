/* CogniMath term-quizzes patch. Safe to re-run. Do not run schema.sql. */

alter table public.assignments drop constraint if exists assignments_topic_check;
alter table public.assignments add constraint assignments_topic_check
  check (topic in ('division', 'multiplication', 'addition', 'subtraction', 'mixed'));

alter table public.assignments drop constraint if exists assignments_kind_check;
alter table public.assignments add constraint assignments_kind_check
  check (kind in ('classwork', 'homework', 'term_start', 'term_end'));

create unique index if not exists assignments_one_term_quiz_idx
  on public.assignments(group_id, kind)
  where kind in ('term_start', 'term_end');

alter table public.sessions add column if not exists assignment_id bigint
  references public.assignments(id) on delete set null;
create index if not exists sessions_assignment_idx
  on public.sessions(assignment_id)
  where assignment_id is not null;

drop policy if exists "assignments: student read class" on public.assignments;
create policy "assignments: student read class"
  on public.assignments
  for select to authenticated
  using (group_id = (select private.my_group_id()));

drop policy if exists "assignment_completions: student own" on public.assignment_completions;
drop policy if exists "assignment_completions: student write classwork" on public.assignment_completions;
drop policy if exists "assignment_completions: student insert classwork" on public.assignment_completions;

create policy "assignment_completions: student own"
  on public.assignment_completions
  for select to authenticated
  using (student_id = (select auth.uid()));

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

drop function if exists public.submit_session(uuid, text, int, int, jsonb, uuid, jsonb);

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

  select id into _existing
    from public.sessions
    where client_session_id = p_client_session_id
    limit 1;
  if _existing is not null then
    return jsonb_build_object('session_id', _existing, 'duplicate', true);
  end if;

  if (select count(*) from public.sessions
      where student_id = p_student_id
        and played_at > now() - interval '1 hour'
        and client_session_id is distinct from p_client_session_id) >= 30 then
    raise exception 'submit_session: rate limit - too many sessions this hour';
  end if;
  if (select count(*) from public.sessions
      where student_id = p_student_id
        and played_at > now() - interval '1 day'
        and client_session_id is distinct from p_client_session_id) >= 100 then
    raise exception 'submit_session: rate limit - too many sessions today';
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

  for qq in select * from jsonb_array_elements(p_questions) loop
    _total := _total + 1;
    _s := qq->>'s';
    _d := (qq->>'d')::int;
    if _s is null or _s not in ('p','c','r','w','t') or _d is null or _d < 1 or _d > 5 then
      raise exception 'submit_session: bad question payload';
    end if;
    if _s = 't' then
      _combo := 0;
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
