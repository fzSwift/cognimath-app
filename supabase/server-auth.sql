/* CogniMath server-auth patch. Safe to re-run. Do not run schema.sql.

   Students can no longer REST-write points/level/streak. submit_session
   requires a signed-in student JWT, recomputes scores, then updates the
   profile. Paste this whole file into the SQL Editor. */

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

grant execute on function public.create_group(text) to authenticated;
revoke all on function public.create_group(text) from public;
revoke all on function public.create_group(text) from anon;

grant execute on function public.join_group(text) to authenticated;
revoke all on function public.join_group(text) from public;
revoke all on function public.join_group(text) from anon;

grant execute on function public.my_group() to authenticated;
revoke all on function public.my_group() from public;
revoke all on function public.my_group() from anon;

grant execute on function public.teacher_groups() to authenticated;
revoke all on function public.teacher_groups() from public;
revoke all on function public.teacher_groups() from anon;

grant execute on function public.ungrouped_students() to authenticated;
revoke all on function public.ungrouped_students() from public;
revoke all on function public.ungrouped_students() from anon;

grant execute on function public.assign_to_group(uuid, uuid) to authenticated;
revoke all on function public.assign_to_group(uuid, uuid) from public;
revoke all on function public.assign_to_group(uuid, uuid) from anon;

revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant insert (id, name, avatar) on public.profiles to authenticated;
grant update (name, avatar) on public.profiles to authenticated;

revoke insert, update, delete on public.groups from authenticated;
grant select on public.groups to authenticated;

do $$
begin
  perform set_config('app.allow_score_update', '1', true);
  update public.profiles p
    set points = t.pts,
        level = least(99, 1 + (t.pts / 500))
    from (
      select student_id, coalesce(sum(points), 0)::int as pts
      from public.sessions
      group by student_id
    ) t
    where p.id = t.student_id;
end $$;
