/* CogniMath record-access patch. Safe to re-run. Do not run schema.sql.

   Quiz sessions and struggle rows are visible only to that student's
   teacher. Students keep the class leaderboard (profiles) and their
   own assignment hand-ins. Paste this whole file into the SQL Editor. */

drop policy if exists "groups: teacher manages own" on public.groups;
drop policy if exists "groups: teacher read own" on public.groups;
create policy "groups: teacher read own" on public.groups
  for select to authenticated
  using ((select private.is_teacher()) and teacher_id = (select auth.uid()));

drop policy if exists "profiles: select own, groupmates, or group teacher" on public.profiles;
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

drop policy if exists "sessions: select own or group teacher" on public.sessions;
drop policy if exists "sessions: select own or teacher" on public.sessions;
drop policy if exists "sessions: teacher reads class" on public.sessions;
create policy "sessions: teacher reads class" on public.sessions
  for select to authenticated
  using ((select private.is_teacher_of_student(student_id)));

drop policy if exists "struggles: select own or group teacher" on public.concept_struggles;
drop policy if exists "struggles: select own or teacher" on public.concept_struggles;
drop policy if exists "struggles: teacher reads class" on public.concept_struggles;
create policy "struggles: teacher reads class" on public.concept_struggles
  for select to authenticated
  using ((select private.is_teacher_of_student(student_id)));

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

drop policy if exists "assignments: teacher manage own class" on public.assignments;
drop policy if exists "assignments: teacher read class" on public.assignments;
drop policy if exists "assignments: teacher insert class" on public.assignments;
drop policy if exists "assignments: teacher delete class" on public.assignments;
drop policy if exists "assignments: student read class" on public.assignments;

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

drop policy if exists "assignment_completions: teacher read class" on public.assignment_completions;
drop policy if exists "assignment_completions: student own" on public.assignment_completions;
drop policy if exists "assignment_completions: student write classwork" on public.assignment_completions;
drop policy if exists "assignment_completions: student insert classwork" on public.assignment_completions;

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

revoke update on public.teacher_questions from authenticated;
grant select, insert, delete on public.teacher_questions to authenticated;
revoke update on public.assignments from authenticated;
grant select, insert, delete on public.assignments to authenticated;
revoke update, delete on public.assignment_completions from authenticated;
grant select, insert on public.assignment_completions to authenticated;

revoke all on public.profiles from public;
revoke all on public.groups from public;
revoke all on public.sessions from public;
revoke all on public.concept_struggles from public;
revoke all on public.teacher_questions from public;
revoke all on public.assignments from public;
revoke all on public.assignment_completions from public;
revoke all on public.student_totals from public;
