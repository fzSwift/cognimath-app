/* ============================================================
   CogniMath — engine.js (Expo port)
   Adaptive difficulty (§3.7.2), scoring/retries, streaks,
   mastery tracking and persistence (encrypted at rest via vault.js —
   Keychain/Keystore wrapping key, ciphertext in AsyncStorage).
   ============================================================ */

/** @typedef {import("../../../shared/domain").AnswerCode} AnswerCode */
/** @typedef {import("../../../shared/domain").BankQuestion} BankQuestion */
/** @typedef {import("../../../shared/domain").ConceptKey} ConceptKey */
/** @typedef {import("../../../shared/domain").ConceptTally} ConceptTally */
/** @typedef {import("../../../shared/domain").LeaderboardRow} LeaderboardRow */
/** @typedef {import("../../../shared/domain").LevelProgress} LevelProgress */
/** @typedef {import("../../../shared/domain").Question} Question */
/** @typedef {import("../../../shared/domain").SaveData} SaveData */
/** @typedef {import("../../../shared/domain").Session} Session */
/** @typedef {import("../../../shared/domain").SessionQuestion} SessionQuestion */
/** @typedef {import("../../../shared/domain").SessionResult} SessionResult */
/** @typedef {import("../../../shared/domain").SessionStruggleTally} SessionStruggleTally */
/** @typedef {import("../../../shared/domain").SimilarQuestion} SimilarQuestion */
/** @typedef {import("../../../shared/domain").SessionTopicId} SessionTopicId */
/** @typedef {import("../../../shared/domain").Topic} Topic */
/** @typedef {import("../../../shared/domain").TopicId} TopicId */
/** @typedef {import("../../../shared/domain").User} User */
/** @typedef {import("../../../shared/domain").WireQuestion} WireQuestion */

/**
 * answerQuestion's return: discriminated on ok.
 * Correct: full points (×2 when combo ≥ 3) or 40% on retry.
 * Wrong: points 0. `mult`/`retry` distinguish the two correct cases.
 * @typedef {{ ok: true; points: number; combo?: number; mult?: number; retry?: boolean } | { ok: false; points: number }} AnswerResult
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { isSealed, open, seal } from "../lib/vault";
import {
  AVATAR_POOL, BADGES, POINTS_BY_LEVEL,
  QUESTIONS_PER_SESSION, TEACHER_CREDS, TOPICS, badgeCheck, genQuestion, shuffle,
} from "./data.js";

/** @type {TopicId[]} */
const MIXED_TOPICS = ["division", "multiplication", "addition", "subtraction"];

const SAVE_KEY = "cognimath_save_v1";
/** @type {SaveData | null} */
let SAVE = null;

/* Storage: AsyncStorage is async, but the rest of the engine reads SAVE
   synchronously. We prime the cache before first render (loadSaveAsync)
   and fire-and-forget writes on persist(). The blob is sealed so a
   device backup of AsyncStorage is not readable JSON. */
/** @returns {Promise<SaveData>} */
export async function loadSaveAsync() {
  try {
    const raw = await AsyncStorage.getItem(SAVE_KEY);
    const json = raw != null ? await open(raw) : null;
    const parsed = json ? JSON.parse(json) : { users: {} };
    SAVE = parsed; // assign BEFORE persist(): persist() re-seals the current SAVE
    if (raw && !isSealed(raw) && parsed.users) persist();
  } catch (e) {
    SAVE = { users: {} };
  }
  if (!SAVE) SAVE = { users: {} };
  if (!SAVE.users) SAVE.users = {};
  return SAVE;
}

/** @returns {SaveData} */
export function loadSave() {
  if (!SAVE) SAVE = { users: {} };
  if (!SAVE.users) SAVE.users = {};
  return SAVE;
}

export function persist() {
  if (!SAVE) return;
  const json = JSON.stringify(SAVE);
  seal(json).then(enc => AsyncStorage.setItem(SAVE_KEY, enc)).catch(() => {});
}

/** @param {string} username @returns {User} */
export function defaultUser(username) {
  return {
    username, name: username, avatar: AVATAR_POOL[Math.floor(Math.random() * AVATAR_POOL.length)],
    points: 0, level: 1, streak: 0, lastDay: null,
    badges: [], topics: {}, history: [], best: {}, played: 0,
    concepts: {}, // concept-key -> {attempts, wrongFirst, wrongFinal, timeouts, sessions}
  };
}

/** @param {string} username @returns {User} */
export function getUser(username) {
  const save = loadSave();
  if (!save.users[username]) { save.users[username] = defaultUser(username); persist(); }
  return save.users[username];
}

/* Pure availability check — use BEFORE renameUser so a rename is never
   applied before the user confirms (the save store is keyed by name, so
   a collision would clobber the other student's entry). */
/** @param {string} name @returns {boolean} */
export function nameAvailable(name) {
  return !loadSave().users[name];
}

/* Rename a saved user: the save store is keyed by name, so a rename has
   to MOVE the entry (leaderboards + lookups follow the key). Returns null
   when the old user is missing or the new name is taken. */
/** @param {string} oldName @param {string} newName @returns {User | null} */
export function renameUser(oldName, newName) {
  const save = loadSave();
  if (!save.users[oldName] || save.users[newName]) return null;
  const u = save.users[oldName];
  u.username = newName;
  u.name = newName;
  save.users[newName] = u;
  delete save.users[oldName];
  persist();
  return u;
}

/* ---------- Mastery & unlocks (§3.11.2: progressive lesson locking) ---------- */
/** @param {User} user @param {string} topicId @param {number} level @returns {LevelProgress} */
export function levelProgress(user, topicId, level) {
  const t = (user.topics && user.topics[topicId]) || {};
  return t[level] || { stars: 0, accuracy: 0, completed: false, attempts: 0, best: 0 };
}

/** @param {User} user @param {string} topicId @param {number} level @returns {boolean} */
export function isUnlocked(user, topicId, level) {
  if (level <= 1) return true;
  return levelProgress(user, topicId, level - 1).completed;
}

/** @param {User} user @param {string} topicId @returns {number} */
export function topicOverallStars(user, topicId) {
  const topic = TOPICS.find(t => t.id === topicId);
  if (!topic) return 0; // defensive: unknown topic can't have stars
  let stars = 0;
  for (let l = 1; l <= topic.levels; l++) stars += levelProgress(user, topicId, l).stars;
  return stars;
}

/* ---------- Session ----------
   Questions are built lazily at the CURRENT adaptive difficulty,
   so a level bump (or drop) mid-session changes the next question. */
/**
 * @param {User} user
 * @param {SessionTopicId} topicId
 * @param {number} level
 * @param {BankQuestion[]} [bank]
 * @param {number | null} [assignmentId]
 * @returns {Session}
 */
export function startSession(user, topicId, level, bank = [], assignmentId = null) {
  const frozen = topicId === "mixed";
  /** @type {Session} */
  const session = {
    topicId, level, diff: level, // adaptive difficulty starts at chosen level
    frozenDiff: frozen,          // term quizzes stay at one level so before/after match
    questions: [], idx: 0,
    points: 0, firstTryCorrect: 0, correct: 0, wrong: 0, retries: 0,
    combo: 0, maxCombo: 0, last5: [], streak: 0,
    struggles: {}, // concept-key -> session struggle tallies
    bank: frozen ? [] : (Array.isArray(bank) ? bank : []),
    assignmentId: assignmentId || null,
  };
  if (frozen) {
    for (let i = 0; i < QUESTIONS_PER_SESSION; i++) {
      const tid = MIXED_TOPICS[i % MIXED_TOPICS.length];
      const q = genQuestion(tid, level);
      session.questions.push({
        ...q,
        topicId: tid,
        diff: level,
        status: "pending",
        points: POINTS_BY_LEVEL[Math.min(level, 5)] || 10,
      });
    }
  } else {
    ensureQuestion(session);
  }
  return session;
}

/* Concept a question belongs to: e.g. "division:4" */
/** @param {Session} session @param {SessionQuestion} q @returns {ConceptKey} */
export function conceptKey(session, q) {
  const topic = (q && q.topicId) || session.topicId;
  return `${topic}:${(q && q.diff) || session.diff}`;
}

/** @param {Session} session @param {SessionQuestion} q @param {keyof SessionStruggleTally} field */
export function bumpStruggle(session, q, field) {
  const k = conceptKey(session, q);
  if (!session.struggles[k]) session.struggles[k] = { attempts: 0, wrongFirst: 0, wrongFinal: 0, timeouts: 0 };
  session.struggles[k][field]++;
}

/** @param {Session} session @param {string} [avoidQ] @returns {SessionQuestion | null} */
function pickBankQuestion(session, avoidQ) {
  const bank = session.bank || [];
  if (!bank.length) return null;
  const atDiff = bank.filter(q => Number(q.diff) === Number(session.diff));
  const pool = atDiff.length ? atDiff : bank;
  const ordered = shuffle(pool);
  const chosen = ordered.find(q => q.q !== avoidQ) || ordered[0];
  if (!chosen) return null;
  return {
    q: chosen.q,
    a: chosen.a,
    options: chosen.options && chosen.options.length ? chosen.options : undefined,
    meta: chosen.meta || { kind: "set" },
    diff: session.diff,
    status: "pending",
    points: POINTS_BY_LEVEL[Math.min(session.diff, 5)] || 10,
  };
}

/** @param {Session} session */
function ensureQuestion(session) {
  let guard = 0;
  while (session.questions.length <= session.idx && guard++ < 200) {
    const prev = session.questions[session.questions.length - 1];
    const fromTeacher = pickBankQuestion(session, prev && prev.q);
    if (fromTeacher) {
      session.questions.push(fromTeacher);
      continue;
    }
    const q = genQuestion(session.topicId, session.diff);
    if (prev && prev.q === q.q) continue; // avoid immediate repeat
    session.questions.push({ ...q, diff: session.diff, status: "pending", points: POINTS_BY_LEVEL[Math.min(session.diff, 5)] || 10 });
  }
}

/* Adaptive difficulty (§3.7.2): high accuracy → harder, low → easier.
   Uses the LAST 5 answered questions as the moving window. */
/** @param {Session} session @returns {{ dir: "up" | "down"; diff: number } | null} */
export function adaptDifficulty(session) {
  if (session.frozenDiff) return null;
  const w = session.last5.slice(-5);
  if (w.length < 5) return null;
  const acc = w.reduce((s, v) => s + v, 0) / w.length;
  const topic = TOPICS.find(t => t.id === session.topicId);
  const max = (topic && topic.levels) || 5;
  if (acc >= 0.8 && session.diff < max) { session.diff++; return { dir: "up", diff: session.diff }; }
  if (acc <= 0.4 && session.diff > 1) { session.diff--; return { dir: "down", diff: session.diff }; }
  return null;
}

/* ---------- Answer handling ----------
   Returns { ok, points, combo, retryAllowed }
   First-try correct: full points (×2 when combo ≥ 3).
   Correct after retry: 40% of points. Timeout/wrong: 0.   */
/** @param {Session} session @param {string | number} submitted @returns {AnswerResult} */
export function answerQuestion(session, submitted) {
  const q = session.questions[session.idx];
  const correct = Math.abs(parseFloat(String(submitted)) - q.a) < 1e-6;
  bumpStruggle(session, q, "attempts");
  if (correct) {
    if (q.status === "pending") {
      q.firstTry = true; // server-side scoring replays from per-question outcomes
      session.combo++;
      session.maxCombo = Math.max(session.maxCombo, session.combo);
      session.firstTryCorrect++;
      session.correct++;
      const mult = session.combo >= 3 ? 2 : 1;
      const pts = q.points * mult;
      session.points += pts;
      session.last5.push(1);
      q.status = "correct";
      return { ok: true, points: pts, combo: session.combo, mult };
    }
    // retry success
    session.correct++;
    session.retries++;
    const pts = Math.round(q.points * 0.4);
    session.points += pts;
    q.status = "correct";
    session.last5.push(0.5);
    return { ok: true, points: pts, retry: true };
  }
  if (q.status === "pending") {
    q.status = "tried"; // allow retry
    bumpStruggle(session, q, "wrongFirst");
  } else {
    bumpStruggle(session, q, "wrongFinal"); // retry was wrong too
  }
  return { ok: false, points: 0 };
}

/* A question resolved by the timer running out */
/** @param {Session} session */
export function timeoutQuestion(session) {
  const q = session.questions[session.idx];
  if (q.status === "pending" || q.status === "tried") {
    q.status = "wrong";
    session.wrong++;
    session.combo = 0;
    session.last5.push(0);
    bumpStruggle(session, q, "attempts");
    bumpStruggle(session, q, "wrongFinal");
    bumpStruggle(session, q, "timeouts");
  }
}

/* ---------- Follow-up practice questions ----------
   After a question is finally missed (retry failed, give-up, or timeout)
   the NEXT slot becomes a fresh SIMILAR question — same concept (same
   diff, same kind/type/op where the generator can produce it) but new
   numbers, so the student re-attempts the skill immediately. The
   follow-up starts in the "tried" state, so a correct answer scores as a
   retry (40% points, 'r' status): first-try accuracy is never inflated
   by a re-attempt of a concept the student just missed. A missed
   follow-up never chains into another one — one practice shot, then move
   on. Follow-ups replace the next slot, so a session always has exactly
   QUESTIONS_PER_SESSION questions (the server's 20-question replay cap
   and the dashboard's accuracy denominator both stay intact). */
/** @param {Session} session @param {SessionQuestion} ref @returns {SimilarQuestion} */
function makeSimilarQuestion(session, ref) {
  const fromBank = pickBankQuestion(session, ref && ref.q);
  if (fromBank) return fromBank;
  const diff = ref.diff || session.diff;
  const tid = (ref && ref.topicId) || (session.topicId === "mixed" ? "addition" : session.topicId);
  /* Bank metas are open-ended (teacher-authored), so shape-matching stays loose. */
  /** @type {any} */
  const meta = ref.meta || {};
  /** @type {(m: any) => boolean} */
  const sameShape = m =>
    (!meta.kind || m.kind === meta.kind) &&
    (!meta.op || m.op === meta.op) &&
    (!meta.type || m.type === meta.type);
  let other = null;
  for (let i = 0; i < 10; i++) {
    const cand = genQuestion(tid, diff);
    if (cand.q === ref.q) continue; // never the identical question
    other = other || cand;
    if (sameShape(cand.meta || {})) return { ...cand, topicId: tid }; // same kind, different numbers
  }
  return { ...(other || genQuestion(tid, diff)), topicId: tid };
}

/* True when the current question was finally missed and qualifies for a
   follow-up practice question on the next slot. */
/** @param {Session} session @returns {boolean} */
export function followUpPending(session) {
  const q = session.questions[session.idx];
  return !!q && q.status === "wrong" && !q.followUp && session.idx < QUESTIONS_PER_SESSION - 1;
}

/** @param {Session} session @returns {boolean} */
export function nextQuestion(session) {
  const prev = session.questions[session.idx];
  const followUp = !!prev && prev.status === "wrong" && !prev.followUp;
  session.idx++;
  if (session.idx >= QUESTIONS_PER_SESSION) return false;
  ensureQuestion(session);
  if (followUp) {
    const fu = makeSimilarQuestion(session, prev);
    session.questions[session.idx] = {
      ...fu,
      diff: prev.diff,   // same concept → same struggle bucket + tutor strategy
      status: "tried",  // counts as a retry: 40% points, 'r' status, no first-try inflation
      points: prev.points,
      followUp: true,
    };
  } else {
    session.questions[session.idx].status = "pending";
  }
  return true;
}

/* ---------- End of session ---------- */
/** @param {User} user @param {Session} session @returns {{ result: SessionResult; earned: string[]; isRecord: boolean }} */
export function endSession(user, session) {
  const total = session.questions.length;
  const accuracy = session.firstTryCorrect / total;
  const stars = accuracy >= 0.9 ? 3 : accuracy >= 0.7 ? 2 : accuracy >= 0.5 ? 1 : 0;
  const completed = accuracy >= 0.5;
  /** @type {SessionResult} */
  const result = {
    topicId: session.topicId, level: session.level, diff: session.diff,
    points: session.points, correct: session.correct, firstTryCorrect: session.firstTryCorrect,
    wrong: session.wrong, retries: session.retries, accuracy, stars, completed,
    maxCombo: session.maxCombo, date: todayKey(),
    // per-question outcomes for server-side scoring (submit_session RPC):
    //   s: p=pending(unanswered) c=first-try correct r=retry correct w=wrong t=timeout
    questions: session.questions.map(q => ({ d: q.diff, s: q.status === "pending" ? "p" : q.status === "tried" ? "w" : q.status === "wrong" ? "t" : q.firstTry ? "c" : "r" })),
  };

  // streak
  const today = todayKey();
  if (user.lastDay === today) { /* already counted today */ }
  else if (user.lastDay === yesterdayKey()) { user.streak++; }
  else { user.streak = 1; }
  user.lastDay = today;

  user.points += session.points;
  user.played++;
  user.history.push(result);
  let prev = /** @type {LevelProgress} */ ({ attempts: 0 });
  let prevBest = 0;
  if (result.topicId !== "mixed") {
    if (!user.topics[result.topicId]) user.topics[result.topicId] = {};
    prev = user.topics[result.topicId][result.level] || { stars: 0, accuracy: 0, completed: false, attempts: 0, best: 0 };
    user.topics[result.topicId][result.level] = {
      stars: Math.max(prev.stars, stars),
      accuracy: Math.round(Math.max(prev.accuracy, accuracy) * 100),
      completed: prev.completed || completed,
      attempts: prev.attempts + 1,
      best: Math.max(prev.best, session.points),
    };
    const key = `${result.topicId}-${result.level}`;
    prevBest = user.best[key] || 0;
    user.best[key] = Math.max(prevBest, session.points);
  }

  // merge per-concept struggle tallies into the student's long-term profile
  if (!user.concepts) user.concepts = {};
  for (const ck in session.struggles) {
    const s = session.struggles[ck];
    const p = user.concepts[ck] || { attempts: 0, wrongFirst: 0, wrongFinal: 0, timeouts: 0, sessions: 0 };
    p.attempts += s.attempts;
    p.wrongFirst += s.wrongFirst;
    p.wrongFinal += s.wrongFinal;
    p.timeouts += s.timeouts;
    p.sessions++;
    user.concepts[ck] = p;
  }

  const earned = BADGES.filter(b => !user.badges.includes(b.id) && badgeCheck(b.id, user)).map(b => b.id);
  user.badges.push(...earned);

  user.level = 1 + Math.floor(user.points / 500);
  persist();
  // "New record!" = this run beat the best of a PREVIOUS attempt on this level
  return { result, earned, isRecord: prev.attempts > 0 && session.points > prevBest };
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/* ---------- Leaderboard ----------
   Local/device list only (no mock classmates). The Ranks screen
   uses fetchClassLeaderboard — other classes are never mixed in. */
/** @param {boolean} [excludeTeacher] @returns {LeaderboardRow[]} */
export function leaderboard(excludeTeacher = true) {
  const save = loadSave();
  const rows = [];
  for (const id in save.users) {
    const u = save.users[id];
    if (excludeTeacher && u.username === TEACHER_CREDS.username) continue;
    rows.push({ id, name: u.name, avatar: u.avatar, points: u.points, level: u.level, played: u.played });
  }
  rows.sort((a, b) => b.points - a.points);
  return rows;
}
