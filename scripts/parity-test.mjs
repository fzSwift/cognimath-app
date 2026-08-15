/* Parity test — the submit_session RPC (SQL in supabase/schema.sql) must
   recompute EXACTLY what engine.js produced, or honest sessions get
   rejected / scored differently. This drives the real engine over
   randomized session traces and asserts the independent JS replay (a 1:1
   port of the SQL) matches. Run AFTER changing engine.js scoring or the
   RPC:

     npm run test:parity        # runs scripts/run-parity.mjs (bundle + this + cleanup)

   The runner bundles engine.js with three native stubs (async-storage,
   react-native, expo-secure-store) and a createRequire banner so Node
   never loads RN's Flow-typed ESM entry.
*/

import { startSession, answerQuestion, timeoutQuestion, nextQuestion, endSession, getUser } from "./engine-bundled.mjs";

const SESSION_LEN = 10; // QUESTIONS_PER_SESSION (core/data.js)

/* Deterministic PRNG (mulberry32) */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 1:1 port of the SQL replay in schema.sql (submit_session) */
function replay(questions) {
  const P = { 1: 10, 2: 15, 3: 20, 4: 25, 5: 30 };
  let points = 0, correct = 0, first = 0, retries = 0, combo = 0, maxCombo = 0, total = 0;
  for (const q of questions) {
    total++;
    if (q.s === "t") combo = 0;
    else if (q.s === "c") {
      correct++; first++; combo++; maxCombo = Math.max(maxCombo, combo);
      points += P[Math.min(q.d, 5)] * (combo >= 3 ? 2 : 1);
    } else if (q.s === "r") {
      correct++; retries++;
      points += Math.round(P[Math.min(q.d, 5)] * 0.4);
    }
  }
  const frac = first / Math.max(total, 1);
  const acc = Math.round(frac * 100 * 100) / 100; // numeric(5,2)
  const stars = frac >= 0.9 ? 3 : frac >= 0.7 ? 2 : frac >= 0.5 ? 1 : 0;
  return { points, correct, first, retries, maxCombo, acc, stars };
}

const rand = rng(20260813);
const TOPICS = ["division", "multiplication", "addition", "subtraction"];
const pick = arr => arr[Math.floor(rand() * arr.length)];

let failures = 0, trials = 0;
const check = (label, a, b) => {
  if (a !== b) { failures++; console.log(`  ✗ ${label}: engine=${a} replay=${b}`); }
};

for (let t = 0; t < 400; t++) {
  const topic = pick(TOPICS);
  const level = 1 + Math.floor(rand() * 3);
  const user = getUser(`stu-${t}`);
  const session = startSession(user, topic, level);
  const expectedCodes = [];

  for (let i = 0; i < SESSION_LEN; i++) {
    const q = session.questions[session.idx];
    const fu = !!q.followUp;      // follow-up slots start as 'tried': a correct
    const roll = rand();          // answer scores 'r', a skip scores 'w'
    if (roll < 0.18) {            // timeout
      timeoutQuestion(session);
      expectedCodes.push("t");
      nextQuestion(session);
    } else if (roll < 0.42) {     // correct (first-try on a fresh question, retry on a follow-up)
      answerQuestion(session, q.a);
      expectedCodes.push(fu ? "r" : "c");
      nextQuestion(session);
    } else if (roll < 0.62) {     // correct after one miss
      answerQuestion(session, q.a + 1);
      answerQuestion(session, q.a);
      expectedCodes.push("r");
      nextQuestion(session);
    } else if (roll < 0.84) {     // wrong twice, moves on (stays 'tried' → 'w')
      answerQuestion(session, q.a + 1);
      answerQuestion(session, q.a + 1);
      expectedCodes.push("w");
      nextQuestion(session);
    } else {                      // skipped, moves on (pending on fresh, 'w' on follow-up)
      expectedCodes.push(fu ? "w" : "p");
      nextQuestion(session);
    }
  }

  const { result } = endSession(user, session);
  trials++;

  /* 1. The per-question status mapping must match what actually happened */
  result.questions.forEach((rq, i) => check(`q${i} code`, rq.s, expectedCodes[i]));

  /* 2. The SQL replay of result.questions must reproduce every engine score */
  const r = replay(result.questions);
  check("points", result.points, r.points);
  check("correct", result.correct, r.correct);
  check("firstTryCorrect", result.firstTryCorrect, r.first);
  check("retries", result.retries, r.retries);
  check("maxCombo", result.maxCombo, r.maxCombo);
  check("accuracy", Math.round(result.accuracy * 10000) / 100, r.acc);
  check("stars", result.stars, r.stars);
}

console.log(`\n${trials} randomized sessions, ${failures} mismatches`);
process.exit(failures ? 1 : 0);
