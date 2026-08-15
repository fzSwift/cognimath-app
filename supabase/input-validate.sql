/* CogniMath input-validate patch. Safe to re-run. Do not run schema.sql.

   Tightens what REST and RPCs will accept: trim/length, allowlists,
   numeric ranges, join-code format. Paste this whole file into the
   SQL Editor after rate-limit.sql. */

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

update public.teacher_questions
  set options = null
  where options is not null
    and (jsonb_typeof(options) <> 'array'
      or jsonb_array_length(options) < 2
      or jsonb_array_length(options) > 6);

update public.assignments
  set due_on = null
  where due_on is not null
    and (due_on < date '2020-01-01' or due_on > date '2100-12-31');

alter table public.groups drop constraint if exists groups_join_code_fmt;
alter table public.groups add constraint groups_join_code_fmt
  check (join_code ~ '^[A-Z0-9]{4,12}$');

alter table public.teacher_questions drop constraint if exists teacher_questions_options_check;
alter table public.teacher_questions add constraint teacher_questions_options_check
  check (options is null or (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 6
  ));
alter table public.teacher_questions drop constraint if exists teacher_questions_answer_range;
alter table public.teacher_questions add constraint teacher_questions_answer_range
  check (answer >= -1000000000 and answer <= 1000000000);

alter table public.assignments drop constraint if exists assignments_due_on_range;
alter table public.assignments add constraint assignments_due_on_range
  check (due_on is null or (due_on >= date '2020-01-01' and due_on <= date '2100-12-31'));
