/* CogniMath field-tamper patch. Safe to re-run. Do not run schema.sql.

   Server-owned columns (ids, timestamps, teacher_id, student_id) are
   overwritten on write. REST cannot set them. Paste this whole file
   into the SQL Editor. */

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

revoke insert, update, delete on public.teacher_questions from authenticated;
grant select, delete on public.teacher_questions to authenticated;
grant insert (group_id, topic, level, prompt, answer, options) on public.teacher_questions to authenticated;

revoke insert, update, delete on public.assignments from authenticated;
grant select, delete on public.assignments to authenticated;
grant insert (group_id, topic, kind, title, note, level, due_on) on public.assignments to authenticated;

revoke insert, update, delete on public.assignment_completions from authenticated;
grant select on public.assignment_completions to authenticated;
grant insert (assignment_id) on public.assignment_completions to authenticated;
