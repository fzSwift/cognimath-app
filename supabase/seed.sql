-- ============================================================
-- CogniMath — demo seed
-- Run AFTER schema.sql in the SQL Editor (Dashboard → SQL Editor).
-- Safe to re-run: it deletes previous @cognimath.demo accounts first.
--
-- Password for every seeded account:  Cognimath1!
--
-- Teachers (sign in on teacher-web or the Expo teacher login):
--   ama.mensah@cognimath.demo      P4 Gold    code CLASS1
--   kojo.asante@cognimath.demo     P5 Blue    code CLASS2
--   efua.boateng@cognimath.demo    P3 Red     code CLASS3
--   yaw.owusu@cognimath.demo       P6 Green   code CLASS4
--   abena.sarpong@cognimath.demo   P2 Yellow  code CLASS5
--
-- Students (4 per class, fresh accounts — no sessions, nothing handed in):
--   ama.p4@cognimath.demo … through papa.p2@cognimath.demo.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  _pwd text := extensions.crypt('Cognimath1!', extensions.gen_salt('bf'));
  _instance uuid := '00000000-0000-0000-0000-000000000000';
  _uid uuid;
  _tid uuid;
  _gid uuid;
  _i int;
  _cw_topics text[] := array['division', 'multiplication', 'addition', 'subtraction', 'division'];
  _hw_topics text[] := array['multiplication', 'addition', 'subtraction', 'division', 'addition'];
  _teachers text[][] := array[
    array['ama.mensah@cognimath.demo',    'Ama Mensah',    '🦉', 'P4 Gold'],
    array['kojo.asante@cognimath.demo',   'Kojo Asante',   '🦁', 'P5 Blue'],
    array['efua.boateng@cognimath.demo',  'Efua Boateng',  '🐯', 'P3 Red'],
    array['yaw.owusu@cognimath.demo',     'Yaw Owusu',     '🐼', 'P6 Green'],
    array['abena.sarpong@cognimath.demo', 'Abena Sarpong', '🦊', 'P2 Yellow']
  ];
  _students text[][] := array[
    -- class 1 (P4 Gold)
    array['ama.p4@cognimath.demo',    'Ama',    '🦊'],
    array['kofi.p4@cognimath.demo',   'Kofi',   '🐯'],
    array['esi.p4@cognimath.demo',    'Esi',    '🦄'],
    array['yaw.p4@cognimath.demo',    'Yaw',    '🐼'],
    -- class 2 (P5 Blue)
    array['adjoa.p5@cognimath.demo',  'Adjoa',  '🦁'],
    array['kwame.p5@cognimath.demo',  'Kwame',  '🐸'],
    array['akosua.p5@cognimath.demo', 'Akosua', '🐨'],
    array['fiifi.p5@cognimath.demo',  'Fiifi',  '🐙'],
    -- class 3 (P3 Red)
    array['aba.p3@cognimath.demo',    'Aba',    '🐹'],
    array['kojo.p3@cognimath.demo',   'Kojo',   '🦉'],
    array['nana.p3@cognimath.demo',   'Nana',   '🦁'],
    array['afia.p3@cognimath.demo',   'Afia',   '🦊'],
    -- class 4 (P6 Green)
    array['kwesi.p6@cognimath.demo',  'Kwesi',  '🐯'],
    array['serwaa.p6@cognimath.demo', 'Serwaa', '🦄'],
    array['kweku.p6@cognimath.demo',  'Kweku',  '🐼'],
    array['efua.p6@cognimath.demo',   'Efua',   '🐸'],
    -- class 5 (P2 Yellow)
    array['panyin.p2@cognimath.demo', 'Panyin', '🐨'],
    array['kakra.p2@cognimath.demo',  'Kakra',  '🐙'],
    array['maame.p2@cognimath.demo',  'Maame',  '🐹'],
    array['papa.p2@cognimath.demo',   'Papa',   '🦉']
  ];
  _teacher_ids uuid[] := '{}';
  _group_ids uuid[] := '{}';
  _codes text[] := array['CLASS1', 'CLASS2', 'CLASS3', 'CLASS4', 'CLASS5'];
begin
  -- ---------- wipe a previous seed (not real accounts) ----------
  perform set_config('app.allow_group_change', '1', true);
  update public.profiles p
     set group_id = null
   where p.id in (select u.id from auth.users u where u.email like '%@cognimath.demo');
  delete from public.groups g
   where g.teacher_id in (select u.id from auth.users u where u.email like '%@cognimath.demo');
  delete from auth.identities i
   where i.user_id in (select u.id from auth.users u where u.email like '%@cognimath.demo');
  delete from auth.users where email like '%@cognimath.demo';

  -- ---------- teachers ----------
  for _i in 1 .. array_length(_teachers, 1) loop
    _uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      _instance, _uid, 'authenticated', 'authenticated',
      _teachers[_i][1], _pwd,
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', _teachers[_i][2], 'avatar', _teachers[_i][3], 'seed', 'cognimath-demo'),
      now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), _uid,
      jsonb_build_object('sub', _uid::text, 'email', _teachers[_i][1], 'email_verified', true),
      'email', _uid::text,
      now(), now(), now()
    );
    -- trigger already inserted a student profile; promote + name it
    update public.profiles
       set role = 'teacher',
           name = _teachers[_i][2],
           avatar = _teachers[_i][3],
           points = 0,
           level = 1,
           streak = 0
     where id = _uid;
    _teacher_ids := array_append(_teacher_ids, _uid);

    insert into public.groups (name, teacher_id, join_code)
    values (_teachers[_i][4], _uid, _codes[_i])
    returning id into _gid;
    _group_ids := array_append(_group_ids, _gid);
  end loop;

  -- ---------- students (4 per class) ----------
  for _i in 1 .. array_length(_students, 1) loop
    _uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      _instance, _uid, 'authenticated', 'authenticated',
      _students[_i][1], _pwd,
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', _students[_i][2], 'avatar', _students[_i][3], 'seed', 'cognimath-demo'),
      now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), _uid,
      jsonb_build_object('sub', _uid::text, 'email', _students[_i][1], 'email_verified', true),
      'email', _uid::text,
      now(), now(), now()
    );

    _gid := _group_ids[1 + ((_i - 1) / 4)];
    perform set_config('app.allow_group_change', '1', true);
    update public.profiles
       set name = _students[_i][2],
           avatar = _students[_i][3],
           role = 'student',
           group_id = _gid,
           points = 0,
           level = 1,
           streak = 0
     where id = _uid;
  end loop;

  -- ---------- 1 classwork + 1 take-home per teacher ----------
  for _i in 1 .. 5 loop
    _tid := _teacher_ids[_i];
    _gid := _group_ids[_i];

    insert into public.assignments (
      group_id, teacher_id, topic, kind, title, note, level, due_on
    ) values (
      _gid, _tid, _cw_topics[_i], 'classwork',
      initcap(_cw_topics[_i]) || ' classwork',
      'Finish all 10 questions in class.',
      2, null
    );

    insert into public.assignments (
      group_id, teacher_id, topic, kind, title, note, level, due_on
    ) values (
      _gid, _tid, _hw_topics[_i], 'homework',
      initcap(_hw_topics[_i]) || ' take-home',
      'Complete tonight. Show your working.',
      1, (current_date + 7)
    );

    insert into public.assignments (
      group_id, teacher_id, topic, kind, title, note, level, due_on
    ) values (
      _gid, _tid, 'mixed', 'term_start',
      'Start of term quiz',
      'A short mix of division, multiplication, addition and subtraction. One try.',
      2, null
    );
  end loop;

  raise notice 'Seeded 5 teachers + 20 students. Password: Cognimath1!';
  raise notice 'Teacher login: ama.mensah@cognimath.demo (class code CLASS1) … abena.sarpong@cognimath.demo (CLASS5)';
  raise notice 'Student login example: ama.p4@cognimath.demo';
end $$;
