/* ============================================================
   CogniMath — core/sync.js
   Bridges the offline engine to Supabase. Every function is a
   safe no-op (returns null) until the anon key is configured in
   src/config.js and supabase/schema.sql has been run.
   ============================================================ */

import * as Crypto from "expo-crypto";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import * as V from "../lib/validate";
import { shuffle } from "./data";
import { getUser, persist } from "./engine";

function fail(r) { return { error: { message: r.error } }; }

/* Resolve the client lazily — the SDK is dynamically imported so it can
   be split out of the web boot bundle. Returns null when offline. */
async function getClient() {
  if (!isSupabaseConfigured) return null;
  return getSupabase();
}

function captchaFail(error) {
  if (error && /captcha/i.test(error.message || "")) {
    return { message: "Couldn't verify you're a person — try the check again." };
  }
  return error;
}

/* ---------- Auth ---------- */

/* Cloud readiness probe: tells the login screen whether the schema is
   applied. Distinguishes "tables missing" (schema.sql not run) from
   real errors so the user gets the exact fix instead of a cryptic
   GoTrue message. */
export async function checkCloudHealth() {
  const supabase = await getClient();
  if (!supabase) return { ready: false, reason: "not-configured" };
  try {
    const { error } = await Promise.race([
      supabase.from("profiles").select("id").limit(1),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
    ]);
    if (!error) return { ready: true };
    if (error.code === "PGRST205" || error.status === 404 || /does not exist/i.test(error.message || "")) {
      return { ready: false, reason: "schema-missing" };
    }
    return { ready: false, reason: "error", message: error.message };
  } catch (e) {
    return { ready: false, reason: "error", message: e.message };
  }
}

/* Create a Supabase account. A NEW account returns { needsSetup: true }
   instead of finalizing — the post-signup screen collects the display
   name + avatar so profiles are never auto-named from the email. An
   existing email returns an error pointing at Sign in. */
export async function supabaseSignUp(email, password, name, captchaToken) {
  const supabase = await getClient();
  if (!supabase) return { user: null, error: null }; // offline mode
  const addr = V.email(email);
  if (!addr.ok) return { user: null, error: { message: addr.error } };
  const pw = V.password(password);
  if (!pw.ok) return { user: null, error: { message: pw.error } };
  const options = {};
  if (name) {
    const n = V.displayName(name);
    if (!n.ok) return { user: null, error: { message: n.error } };
    options.data = { name: n.value };
  }
  if (captchaToken) options.captchaToken = captchaToken;
  const { data, error } = await supabase.auth.signUp({
    email: addr.value,
    password: pw.value,
    options: Object.keys(options).length ? options : undefined,
  });
  if (error) {
    // GoTrue hides the real cause (the profile trigger fails on missing tables)
    if (/database error saving new user/i.test(error.message)) {
      return {
        user: null,
        error: { message: "Couldn't create your account — your cloud tables aren't set up yet. Run supabase/schema.sql in the Supabase SQL Editor, then try again." },
      };
    }
    return { user: null, error: captchaFail(error) };
  }
  if (data.session) return { user: null, needsSetup: true };
  const identities = data.user && data.user.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    return { user: null, error: { message: "That email already has an account — use Sign in instead." } };
  }
  return { user: null, error: { message: "Check your inbox to confirm your email, then sign in." } };
}

/* Finish onboarding after the setup screen: save the chosen name + avatar
   to the auth metadata, then finalize (local engine user + profile upsert).
   Called with no args from "Not now" — falls back to the email-derived
   name and a random avatar. */
export async function completeSignupProfile(name, avatar) {
  const supabase = await getClient();
  if (!supabase) return { user: null, error: { message: "Cloud isn't configured yet." } };
  const { data: auth } = await supabase.auth.getUser();
  const email = (auth.user && auth.user.email) || "";
  const patch = {};
  if (name) {
    const n = V.displayName(name);
    if (!n.ok) return { user: null, error: { message: n.error } };
    patch.name = n.value;
  }
  if (avatar) {
    const a = V.avatar(avatar);
    if (!a.ok) return { user: null, error: { message: a.error } };
    patch.avatar = a.value;
  }
  if (Object.keys(patch).length) {
    const { error } = await supabase.auth.updateUser({ data: patch });
    if (error) return { user: null, error };
  }
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return { user: null, error: { message: "Your session expired — sign in again." } };
  return finalizeAuth(s.session);
}

export async function supabaseSignIn(email, password, captchaToken) {
  const supabase = await getClient();
  if (!supabase) return { user: null, error: null };
  const addr = V.email(email);
  if (!addr.ok) return { user: null, error: { message: addr.error } };
  const pw = V.password(password, { min: 1 });
  if (!pw.ok) return { user: null, error: { message: pw.error } };
  const { data, error } = await supabase.auth.signInWithPassword({
    email: addr.value,
    password: pw.value,
    options: captchaToken ? { captchaToken } : undefined,
  });
  if (error) return { user: null, error: captchaFail(error) };
  return finalizeAuth(data.session);
}

export async function supabaseSignOut() {
  const supabase = await getClient();
  if (!supabase) return;
  await supabase.auth.signOut();
}

/* Classmate-name check: is `name` already used by another student's
   profile (cloud roster)? Fails OPEN on error (no schema / network) —
   a check we can't run must never block a rename. Excludes the
   student's own id and teachers. */
export async function checkProfileNameTaken(name, excludeId) {
  const supabase = await getClient();
  if (!supabase || !excludeId) return { taken: false, error: null };
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("name", name)
      .neq("role", "teacher")
      .neq("id", excludeId)
      .limit(5);
    if (error) return { taken: false, error };
    return { taken: (data || []).length > 0, error: null };
  } catch (e) {
    return { taken: false, error: e };
  }
}

/* Edit the student's profile later (profile screen). Saves to auth
   metadata + the profiles row for cloud accounts; offline demo users
   (no supabaseId) update only the local save. The caller is responsible
   for the local rename (engine.renameUser) — this function just applies
   the name/avatar to the user object and syncs it up. */
export async function updateCloudProfile(localUser, name, avatar) {
  if (name) {
    const n = V.displayName(name);
    if (!n.ok) return { user: null, error: { message: n.error } };
    name = n.value;
  }
  if (avatar) {
    const a = V.avatar(avatar);
    if (!a.ok) return { user: null, error: { message: a.error } };
    avatar = a.value;
  }
  if (!localUser.supabaseId) {
    if (name) localUser.name = name;
    if (avatar) localUser.avatar = avatar;
    persist();
    return { user: localUser, error: null };
  }
  const supabase = await getClient();
  if (!supabase) return { user: null, error: { message: "Cloud isn't configured yet." } };
  const patch = {};
  if (name) patch.name = name;
  if (avatar) patch.avatar = avatar;
  if (Object.keys(patch).length) {
    const { error } = await supabase.auth.updateUser({ data: patch });
    if (error) return { user: null, error };
  }
  if (name) localUser.name = name;
  if (avatar) localUser.avatar = avatar;
  persist();
  const err = await upsertProfile(localUser.supabaseId, localUser);
  if (err) return { user: null, error: err };
  return { user: localUser, error: null };
}

/* Send a password-reset email via Supabase's flow. Returns success even
   when the address doesn't exist (Supabase does this to avoid leaking
   which accounts exist), so the client shows the same message either way. */
export async function sendPasswordResetEmail(email, redirectTo, captchaToken) {
  const supabase = await getClient();
  if (!supabase) return { sent: false, error: { message: "Cloud isn't configured yet." } };
  const addr = V.email(email);
  if (!addr.ok) return { sent: false, error: { message: addr.error } };
  const opts = {};
  if (redirectTo) opts.redirectTo = redirectTo;
  if (captchaToken) opts.captchaToken = captchaToken;
  const { error } = await supabase.auth.resetPasswordForEmail(addr.value, Object.keys(opts).length ? opts : undefined);
  if (error) return { sent: false, error: captchaFail(error) };
  return { sent: true, error: null };
}

/* Set a new password from a PASSWORD_RECOVERY session (the session
   Supabase creates when the user clicks the email link). */
export async function resetPassword(newPassword) {
  const supabase = await getClient();
  if (!supabase) return { error: { message: "Cloud isn't configured yet." } };
  const pw = V.password(newPassword);
  if (!pw.ok) return { error: { message: pw.error } };
  const { error } = await supabase.auth.updateUser({ password: pw.value });
  return { error };
}

/* Subscribe to auth events — used to catch PASSWORD_RECOVERY when the
   user lands back in the app from the reset-email link. Returns an
   unsubscribe function (no-op when offline). */
export async function onAuthStateChange(cb) {
  const supabase = await getClient();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange(cb);
  return () => { data.subscription.unsubscribe(); };
}

/* Rehydrate a persisted cloud session without a password. Reads the
   local JWT (no extra GoTrue round-trip) then the profiles row for role.
   Does not upsert — a refresh must not rewrite scores. */
export async function restoreSession() {
  const supabase = await getClient();
  if (!supabase) return { user: null };
  try {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return { user: null };
    const authUser = s.session.user;
    const meta = authUser.user_metadata || {};
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, name, avatar")
      .eq("id", authUser.id)
      .maybeSingle();
    if (profile && profile.role === "teacher") {
      return {
        user: {
          name: profile.name || meta.name || "Teacher",
          avatar: profile.avatar || meta.avatar || "👩‍🏫",
          supabaseId: authUser.id,
          supabaseEmail: authUser.email,
          supabaseRole: "teacher",
        },
      };
    }
    if (!meta.name && !(profile && profile.name)) return { user: null, needsSetup: true };
    const name = meta.name || profile.name || authUser.email.split("@")[0];
    const localUser = getUser(name);
    localUser.avatar = (profile && profile.avatar) || meta.avatar || localUser.avatar;
    localUser.supabaseId = authUser.id;
    localUser.supabaseEmail = authUser.email;
    if (profile && profile.role) localUser.supabaseRole = profile.role;
    persist();
    return { user: localUser };
  } catch (e) {
    return { user: null };
  }
}

/* After an auth session is established: upsert the local engine user
   and link it to the Supabase identity so results can be synced. */
async function finalizeAuth(session) {
  const authUser = session.user;
  const meta = authUser.user_metadata || {};
  const name = meta.name || authUser.email.split("@")[0];
  const localUser = getUser(name);
  // the chosen avatar (if any) wins over the random pool pick
  localUser.avatar = meta.avatar || localUser.avatar;
  localUser.supabaseId = authUser.id;
  localUser.supabaseEmail = authUser.email;
  persist();
  await upsertProfile(authUser.id, localUser);
  return { user: localUser, error: null };
}

async function upsertProfile(supabaseId, localUser) {
  const supabase = await getClient();
  if (!supabase) return null;
  // name/avatar only — points/level/streak are written by submit_session
  const { error } = await supabase.from("profiles").upsert({
    id: supabaseId,
    name: localUser.name,
    avatar: localUser.avatar,
  });
  if (error) return error;
  // carry the role (teacher/student) back so the app can route correctly
  const { data } = await supabase.from("profiles").select("role").eq("id", supabaseId).maybeSingle();
  if (data) localUser.supabaseRole = data.role;
  return null;
}

/* ---------- Progress sync ----------
   After a session ends, upload the per-question outcomes + struggle
   tallies. submit_session (a security-definer RPC in the DB) recomputes
   points/stars/accuracy server-side, inserts the session + struggles,
   and writes profile points/level/streak. The client never dictates
   scores (VULN-001). Fire-and-forget: failures never break the local game. */
export async function syncSessionResult(localUser, session, result) {
  const supabase = await getClient();
  if (!supabase || !localUser || !localUser.supabaseId) return;
  const studentId = localUser.supabaseId;
  // one idempotency key per session: retries/double-fires dedupe server-side
  if (!session.clientSessionId) session.clientSessionId = Crypto.randomUUID();
  const struggles = [];
  for (const ck in session.struggles) {
    const s = session.struggles[ck];
    struggles.push({
      concept: ck,
      attempts: s.attempts,
      wrong_first: s.wrongFirst,
      wrong_final: s.wrongFinal,
      timeouts: s.timeouts,
    });
  }
  const { error } = await supabase.rpc("submit_session", {
    p_student_id: studentId,
    p_topic: result.topicId,
    p_level: result.level,
    p_diff: result.diff,
    p_questions: result.questions,
    p_client_session_id: session.clientSessionId,
    p_struggles: struggles,
    p_assignment_id: session.assignmentId || null,
  });
  if (error) return error;
  return null;
}

/* ---------- Groups (classes) ---------- */

/* Student: join a class by its 6-char code. Returns { group, error }. */
export async function joinClass(code) {
  const supabase = await getClient();
  if (!supabase) return { group: null, error: { message: "Cloud isn't configured yet." } };
  const c = V.joinCode(code);
  if (!c.ok) return { group: null, error: { message: c.error } };
  const { data, error } = await supabase.rpc("join_group", { p_code: c.value });
  if (error) return { group: null, error };
  return { group: data, error: null };
}

/* Student: their own class ({ id, name }) or null when ungrouped. */
export async function fetchMyGroup() {
  const supabase = await getClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_group");
  if (error || !data) return null;
  return data;
}

/* Teacher: all of the current teacher's classes (for the live card). */
export async function fetchTeacherGroups() {
  const supabase = await getClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("teacher_groups");
  if (error || !Array.isArray(data)) return [];
  return data;
}

function mapTeacherQuestion(row) {
  const a = Number(row.answer);
  let options;
  if (Array.isArray(row.options) && row.options.length) {
    const nums = row.options.map(Number).filter(n => Number.isFinite(n));
    if (!nums.includes(a)) nums.unshift(a);
    options = shuffle(nums).slice(0, 4);
  }
  return {
    q: row.prompt,
    a,
    options,
    diff: Number(row.level) || 1,
    meta: { kind: "set", topic: row.topic },
  };
}

/* Student: teacher-set questions for this class + topic. Empty array
   when offline, ungrouped, or the teacher hasn't written any yet —
   the engine then uses the built-in generators. */
export async function fetchClassQuestions(topicId) {
  const supabase = await getClient();
  const top = V.topic(topicId);
  if (!supabase || !top.ok) return [];
  topicId = top.value;
  const group = await fetchMyGroup();
  if (!group || !group.id) return [];
  const { data, error } = await supabase
    .from("teacher_questions")
    .select("id, topic, level, prompt, answer, options")
    .eq("group_id", group.id)
    .eq("topic", topicId)
    .order("level", { ascending: true })
    .limit(200);
  if (error || !Array.isArray(data)) return [];
  return data.map(mapTeacherQuestion);
}

/* Teacher: all questions for one class, newest first. */
export async function fetchTeacherQuestions(groupId) {
  const supabase = await getClient();
  if (!supabase || !groupId) return { rows: [], error: null };
  const { data, error } = await supabase
    .from("teacher_questions")
    .select("id, group_id, topic, level, prompt, answer, options, created_at")
    .eq("group_id", groupId)
    .order("topic", { ascending: true })
    .order("level", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { rows: [], error };
  return { rows: data || [], error: null };
}

/* Teacher: add a question to a class bank. `wrongs` is an optional
   list of distractors for multiple choice. */
export async function addTeacherQuestion({ groupId, topic, level, prompt, answer, wrongs }) {
  const supabase = await getClient();
  if (!supabase) return { error: { message: "Cloud isn't configured yet." } };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: { message: "Sign in with your teacher account first." } };
  const gid = V.uuid(groupId);
  if (!gid.ok) return fail(gid);
  const top = V.topic(topic);
  if (!top.ok) return fail(top);
  const lv = V.level(level);
  if (!lv.ok) return fail(lv);
  const text = V.prompt(prompt);
  if (!text.ok) return fail(text);
  const a = V.answerNum(answer);
  if (!a.ok) return fail(a);
  const wr = V.distractors(wrongs, a.value);
  if (!wr.ok) return fail(wr);
  let options = null;
  if (wr.value.length) options = shuffle([a.value, ...wr.value]).slice(0, 4);
  const { data, error } = await supabase
    .from("teacher_questions")
    .insert({
      group_id: gid.value,
      topic: top.value,
      level: lv.value,
      prompt: text.value,
      answer: a.value,
      options,
    })
    .select("id")
    .maybeSingle();
  return { id: data && data.id, error };
}

export async function deleteTeacherQuestion(id) {
  const supabase = await getClient();
  const rid = V.rowId(id);
  if (!supabase || !rid.ok) return { error: { message: "Couldn't delete that question." } };
  const { error } = await supabase.from("teacher_questions").delete().eq("id", rid.value);
  return { error };
}

/* Student: classwork + take-home for their group. Each row includes
   whether THIS student has already handed it in (RLS scopes the embed). */
export async function fetchClassAssignments() {
  const supabase = await getClient();
  if (!supabase) return [];
  const group = await fetchMyGroup();
  if (!group || !group.id) return [];
  const { data, error } = await supabase
    .from("assignments")
    .select("id, topic, kind, title, note, level, due_on, created_at, assignment_completions(completed_at)")
    .eq("group_id", group.id)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error || !Array.isArray(data)) return [];
  return data.map(a => ({
    id: a.id,
    topic: a.topic,
    kind: a.kind,
    title: a.title,
    note: a.note,
    level: a.level,
    dueOn: a.due_on,
    done: Array.isArray(a.assignment_completions) && a.assignment_completions.length > 0,
  }));
}

export async function completeAssignment(assignmentId) {
  const supabase = await getClient();
  const rid = V.rowId(assignmentId);
  if (!supabase || !rid.ok) return { error: null };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: null };
  const { error } = await supabase.from("assignment_completions").insert(
    { assignment_id: rid.value }
  );
  if (error && (error.code === "23505" || /duplicate/i.test(error.message || ""))) return { error: null };
  return { error };
}

/* Teacher: assignments for one class, with a hand-in count. */
export async function fetchTeacherAssignments(groupId) {
  const supabase = await getClient();
  if (!supabase || !groupId) return { rows: [], error: null };
  const { data, error } = await supabase
    .from("assignments")
    .select("id, group_id, topic, kind, title, note, level, due_on, created_at, assignment_completions(student_id)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { rows: [], error };
  const rows = (data || []).map(a => ({
    ...a,
    handedIn: Array.isArray(a.assignment_completions) ? a.assignment_completions.length : 0,
  }));
  return { rows, error: null };
}

export async function addAssignment({ groupId, topic, kind, title, note, level, dueOn }) {
  const supabase = await getClient();
  if (!supabase) return { error: { message: "Cloud isn't configured yet." } };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: { message: "Sign in with your teacher account first." } };
  const gid = V.uuid(groupId);
  if (!gid.ok) return fail(gid);
  const top = V.topic(topic);
  if (!top.ok) return fail(top);
  const k = V.workKind(kind);
  if (!k.ok) return fail(k);
  const heading = V.assignmentTitle(title, k.value === "homework" ? "Take-home work" : "Classwork");
  if (!heading.ok) return fail(heading);
  const memo = V.assignmentNote(note);
  if (!memo.ok) return fail(memo);
  const lv = V.level(level);
  if (!lv.ok) return fail(lv);
  const due = V.dueDate(dueOn);
  if (!due.ok) return fail(due);
  const { error } = await supabase.from("assignments").insert({
    group_id: gid.value,
    topic: top.value,
    kind: k.value,
    title: heading.value,
    note: memo.value,
    level: lv.value,
    due_on: due.value,
  });
  return { error };
}

export async function addTermQuiz({ groupId, kind, level, note }) {
  const supabase = await getClient();
  if (!supabase) return { error: { message: "Cloud isn't configured yet." } };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: { message: "Sign in with your teacher account first." } };
  const gid = V.uuid(groupId);
  if (!gid.ok) return fail(gid);
  const k = V.termKind(kind);
  if (!k.ok) return fail(k);
  const lv = V.level(level);
  if (!lv.ok) return fail(lv);
  const memo = V.assignmentNote(note);
  if (!memo.ok) return fail(memo);
  const heading = k.value === "term_end" ? "End of term quiz" : "Start of term quiz";
  const { error } = await supabase.from("assignments").insert({
    group_id: gid.value,
    topic: "mixed",
    kind: k.value,
    title: heading,
    note: memo.value || (k.value === "term_end"
      ? "Same mix of sums as the start-of-term quiz. One try."
      : "A short mix of division, multiplication, addition and subtraction. One try."),
    level: lv.value,
    due_on: null,
  });
  if (error && (error.code === "23505" || /duplicate|unique/i.test(error.message || ""))) {
    return { error: { message: "This class already has that term quiz. Delete it first to post a new one." } };
  }
  return { error };
}

/* First attempt per student per paper. Keep in lockstep with teacher-web api.js. */
export function aggregateTermQuiz(assignments, sessions, students) {
  const start = (assignments || []).find(a => a.kind === "term_start") || null;
  const end = (assignments || []).find(a => a.kind === "term_end") || null;
  const firstBy = {};
  (sessions || []).forEach(s => {
    const k = `${s.student_id}:${s.assignment_id}`;
    if (!firstBy[k] || s.played_at < firstBy[k].played_at) {
      firstBy[k] = { accuracy: Number(s.accuracy), played_at: s.played_at };
    }
  });
  const rows = (students || [])
    .filter(p => p.role !== "teacher")
    .map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar || "🦉",
      pre: start && firstBy[`${p.id}:${start.id}`] ? Math.round(firstBy[`${p.id}:${start.id}`].accuracy) : null,
      post: end && firstBy[`${p.id}:${end.id}`] ? Math.round(firstBy[`${p.id}:${end.id}`].accuracy) : null,
    }));
  const pres = rows.map(r => r.pre).filter(v => v != null);
  const posts = rows.map(r => r.post).filter(v => v != null);
  const avg = xs => xs.length ? Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 10) / 10 : null;
  return {
    start, end, students: rows,
    pretest: avg(pres), posttest: avg(posts),
    nPre: pres.length, nPost: posts.length,
  };
}

export async function fetchTermQuizReport(groupId, students) {
  const empty = { start: null, end: null, students: [], pretest: null, posttest: null, nPre: 0, nPost: 0, error: null };
  const supabase = await getClient();
  if (!supabase || !groupId) return empty;
  const [asgRes, rosterRes] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, kind, title, note, level, created_at, assignment_completions(student_id)")
      .eq("group_id", groupId)
      .in("kind", ["term_start", "term_end"]),
    students
      ? Promise.resolve({ data: students, error: null })
      : supabase.from("profiles").select("id, name, avatar, role").eq("group_id", groupId),
  ]);
  if (asgRes.error) return { ...empty, error: asgRes.error };
  const assignments = (asgRes.data || []).map(a => ({
    ...a,
    handedIn: Array.isArray(a.assignment_completions) ? a.assignment_completions.length : 0,
  }));
  const ids = assignments.map(a => a.id);
  let sessions = [];
  if (ids.length) {
    const { data: sess, error: e2 } = await supabase
      .from("sessions")
      .select("student_id, assignment_id, accuracy, played_at")
      .in("assignment_id", ids)
      .order("played_at", { ascending: true })
      .limit(500);
    if (e2) return { ...empty, start: assignments.find(a => a.kind === "term_start") || null, end: assignments.find(a => a.kind === "term_end") || null, error: e2 };
    sessions = sess || [];
  }
  return { ...aggregateTermQuiz(assignments, sessions, rosterRes.data || students || []), error: null };
}

export async function deleteAssignment(id) {
  const supabase = await getClient();
  const rid = V.rowId(id);
  if (!supabase || !rid.ok) return { error: { message: "Couldn't delete that." } };
  const { error } = await supabase.from("assignments").delete().eq("id", rid.value);
  return { error };
}

/* Class leaderboard: ONLY the student's own group. RLS already
   hides other classes; we also filter by group_id so a missing
   group never falls through to a global board. Distinct statuses
   so the screen can show "join a class" instead of other students. */
export async function fetchClassLeaderboard() {
  const supabase = await getClient();
  if (!supabase) return { status: "offline" };
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { status: "signed-out" };
    const group = await fetchMyGroup();
    if (!group || !group.id) return { status: "ungrouped" };
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, avatar, points, level, streak")
      .eq("group_id", group.id)
      .neq("role", "teacher")
      .order("points", { ascending: false })
      .limit(50);
    if (error) return { status: "error", error: error.message };
    return { status: "ok", group, rows: data || [] };
  } catch (e) {
    return { status: "error", error: e.message || "network error" };
  }
}

/* ---------- Teacher live data ----------
   Returns { students, totals, struggles } for the dashboard, null when
   Supabase isn't configured, or { noSession } when no teacher is signed in.
   Per-student numbers come from the student_totals view (aggregated in
   Postgres) instead of every raw session row; struggles are fetched raw
   because they're bounded (one row per student × concept) and the card
   needs per-student names. */
export async function fetchTeacherLive(groupId = null) {
  const supabase = await getClient();
  if (!supabase) return null;
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { noSession: true };
    let q = supabase
      .from("profiles")
      .select("id, name, avatar, points, level, streak, created_at, role, group_id")
      .order("points", { ascending: false })
      .limit(500);
    if (groupId) q = q.eq("group_id", groupId);
    const profiles = await q;
    if (profiles.error) return { error: profiles.error.message };
    const ids = (profiles.data || []).map(p => p.id);
    const [totals, struggles] = await Promise.all([
      ids.length
        ? supabase.from("student_totals").select("student_id, sessions, avg_accuracy, points, stars").in("student_id", ids)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? supabase.from("concept_struggles").select("student_id, concept, attempts, wrong_final, timeouts").in("student_id", ids).limit(2000)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const err = totals.error || struggles.error;
    if (err) return { error: err.message };
    return {
      students: profiles.data || [],
      totals: totals.data || [],
      struggles: struggles.data || [],
    };
  } catch (e) {
    return { error: e.message || "network error" };
  }
}

/* Realtime: fire onChange when class data changes (a student's
   submit_session lands, a profile updates on login). RLS scopes the
   stream per subscriber (teachers: whole class). Events are used only as
   a refetch trigger — the payload is ignored. Returns an unsubscribe
   function (no-op when offline/unconfigured). */
export async function subscribeTeacherLive(onChange) {
  const supabase = await getClient();
  if (!supabase) return () => {};
  const channel = supabase
    .channel("teacher-live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "sessions" }, onChange)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "concept_struggles" }, onChange)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "concept_struggles" }, onChange)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, onChange)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/* Aggregate live struggles per concept (mirrors the offline card).
   Students are pre-indexed so this is O(rows) instead of O(rows × students). */
export function aggregateLiveStruggles(live) {
  const byConcept = {};
  const names = {};
  (live.students || []).forEach(p => { names[p.id] = p.name; });
  (live.struggles || []).forEach(row => {
    const k = row.concept;
    if (!byConcept[k]) byConcept[k] = { attempts: 0, wrongFinal: 0, students: [] };
    byConcept[k].attempts += Number(row.attempts) || 0;
    byConcept[k].wrongFinal += Number(row.wrong_final) || 0;
    if (row.attempts && (Number(row.wrong_final) || 0) / row.attempts >= 0.4) {
      byConcept[k].students.push(names[row.student_id] || "Student");
    }
  });
  return Object.keys(byConcept)
    .map(k => ({ key: k, ...byConcept[k], rate: byConcept[k].attempts ? byConcept[k].wrongFinal / byConcept[k].attempts : 0 }))
    .sort((a, b) => b.wrongFinal - a.wrongFinal || b.rate - a.rate)
    .slice(0, 5);
}

/* Session counts + average accuracy per live student, from the
   student_totals view. Teachers are excluded (matches the web app). */
export function aggregateLiveStudents(live) {
  const totals = {};
  (live.totals || []).forEach(t => { totals[t.student_id] = t; });
  return (live.students || [])
    .filter(p => p.role !== "teacher")
    .map(p => {
      const t = totals[p.id] || {};
      return {
        id: p.id, name: p.name, avatar: p.avatar || "🦉", groupId: p.group_id || null,
        points: Number(t.points) || p.points || 0, level: p.level || 1, streak: p.streak || 0,
        sessions: Number(t.sessions) || 0,
        accuracy: t.sessions ? Math.round(Number(t.avg_accuracy)) : 0,
        stars: Number(t.stars) || 0,
      };
    })
    .filter(p => p.sessions > 0)
    .sort((a, b) => b.points - a.points);
}
