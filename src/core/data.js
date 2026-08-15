/* ============================================================
   CogniMath — data.js (Expo port)
   Topics, question banks (Appendix C), mock students, badges
   ============================================================ */

/** @typedef {import("../../../shared/domain").Topic} Topic */
/** @typedef {import("../../../shared/domain").TopicId} TopicId */
/** @typedef {import("../../../shared/domain").SessionTopicId} SessionTopicId */
/** @typedef {import("../../../shared/domain").Question} Question */
/** @typedef {import("../../../shared/domain").User} User */
/** @typedef {import("../../../shared/domain").MockStudent} MockStudent */
/** @typedef {import("../../../shared/domain").ClassStats} ClassStats */
/** @typedef {import("../../../shared/domain").Badge} Badge */

/** @type {Topic[]} */
export const TOPICS = [
  {
    id: "division", name: "Division", icon: "➗", tag: "÷", color: "#FFB84D",
    grad: ["#FFB84D", "#FF8A3D"],
    blurb: "Share numbers equally. 5 levels — from basics to bigger numbers.",
    levels: 5,
  },
  {
    id: "multiplication", name: "Multiplication", icon: "✖️", tag: "×", color: "#FF6B6B",
    grad: ["#FF6B6B", "#EE5A24"],
    blurb: "Times tables made fast and fun.",
    levels: 3,
  },
  {
    id: "addition", name: "Addition", icon: "➕", tag: "+", color: "#4CC9F0",
    grad: ["#4CC9F0", "#3A86FF"],
    blurb: "Put numbers together — from small sums to bigger totals.",
    levels: 3,
  },
  {
    id: "subtraction", name: "Subtraction", icon: "➖", tag: "−", color: "#06D6A0",
    grad: ["#06D6A0", "#118AB2"],
    blurb: "Take away and find what's left.",
    levels: 3,
  },
];

/** @type {Record<number, number>} */
export const POINTS_BY_LEVEL = { 1: 10, 2: 15, 3: 20, 4: 25, 5: 30 };
/** @type {number} */
export const QUESTIONS_PER_SESSION = 10;
/** @type {number} */
export const TIMER_SECONDS = 25;

/* Human-friendly level names (also used to label concepts on the dashboard) */
/** Level names indexed by topic id — also indexed with arbitrary strings in conceptLabel, so string keys. */
/** @type {Record<string, string[]>} */
export const LEVEL_NAMES = {
  division: ["Easy Division", "Middle Division", "Division Challenge", "Big Numbers", "Real-Life Division"],
  multiplication: ["Times Tables", "Big Times", "Super Multiply"],
  addition: ["Small Sums", "Bigger Totals", "Addition Challenge"],
  subtraction: ["Take Away", "Bigger Differences", "Subtraction Challenge"],
};

/* ---------- helpers ---------- */
/** @param {number} min @param {number} max @returns {number} */
export function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
/** @template T @param {T[]} arr @returns {T[]} */
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** @template T @param {T[]} arr @returns {T} */
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* Multiple-choice options around a correct answer */
/** @param {number} correct @param {number} [spread] @param {number} [min] @returns {number[]} */
export function mcOptions(correct, spread = 2, min = 1) {
  const opts = new Set([correct]);
  let guard = 0;
  while (opts.size < 4 && guard++ < 50) {
    const d = randInt(-spread, spread);
    const v = correct + d;
    if (v >= min && v !== correct) opts.add(v);
  }
  return shuffle([...opts]);
}

/* ---------- DIVISION generator (Appendix C levels 1, 2, 4, 5) ----------
   Every question carries `meta` so the AI tutor can build a real
   step-by-step solution from the actual numbers. */
/** @param {number} diff @returns {Question} */
function genDivision(diff) {
  switch (diff) {
    case 1: { // ÷2 basics, multiple choice — Table 7
      const r = randInt(2, 10);
      const q = `${r * 2} ÷ 2 = ?`;
      return { q, a: r, options: mcOptions(r, 3, 1), meta: { kind: "div", x: r * 2, y: 2, a: r } };
    }
    case 2: { // divisors 6,7,8 — Table 8 style
      const d = pick([6, 7, 8]);
      const r = randInt(2, 9);
      return { q: `${d * r} ÷ ${d} = ?`, a: r, meta: { kind: "div", x: d * r, y: d, a: r } };
    }
    case 3: { // mixed divisors, bigger
      const d = pick([4, 5, 6, 7, 8, 9, 12]);
      const r = randInt(3, 12);
      return { q: `${d * r} ÷ ${d} = ?`, a: r, meta: { kind: "div", x: d * r, y: d, a: r } };
    }
    case 4: { // large friendly numbers — Table 9 style
      const table = [
        [1000, 25], [1200, 30], [2400, 60], [3600, 90],
        [1500, 30], [2000, 40], [4800, 80], [1400, 70], [8100, 90], [2500, 50],
      ];
      const [num, den] = pick(table);
      return { q: `${num} ÷ ${den} = ?`, a: num / den, meta: { kind: "div", x: num, y: den, a: num / den } };
    }
    default: { // level 5: word problems (Ghana context) — Table 10 style
      return pick([
        { q: "20 apples are shared equally among 4 children. How many does each get?", a: 5, meta: { kind: "word", op: "div", n1: 20, n2: 4, unit: "apple", group: "children", groupS: "child" } },
        { q: "100 cedis is shared equally by 5 children. How much does each get?", a: 20, meta: { kind: "word", op: "div", n1: 100, n2: 5, unit: "cedi", group: "children", groupS: "child" } },
        { q: "240 students are placed into 12 classes. How many students per class?", a: 20, meta: { kind: "word", op: "div", n1: 240, n2: 12, unit: "student", group: "classes", groupS: "class" } },
        { q: "36 mangoes are packed into boxes of 6. How many boxes are needed?", a: 6, meta: { kind: "word", op: "div", n1: 36, n2: 6, unit: "mango", group: "boxes", groupS: "box" } },
        { q: "A teacher gives 45 pencils to 9 students equally. How many pencils each?", a: 5, meta: { kind: "word", op: "div", n1: 45, n2: 9, unit: "pencil", group: "students", groupS: "student" } },
        { q: "3 friends share 27 plantain chips equally. How many chips does each get?", a: 9, meta: { kind: "word", op: "div", n1: 27, n2: 3, unit: "chip", group: "friends", groupS: "friend" } },
        { q: "1,200 cedis is shared among 6 traders. How much does each trader get?", a: 200, meta: { kind: "word", op: "div", n1: 1200, n2: 6, unit: "cedi", group: "traders", groupS: "trader" } },
        { q: "64 pupils are arranged into rows of 8. How many rows are there?", a: 8, meta: { kind: "word", op: "div", n1: 64, n2: 8, unit: "pupil", group: "rows", groupS: "row" } },
      ]);
    }
  }
}

/* ---------- MULTIPLICATION generator ---------- */
/** @param {number} diff @returns {Question} */
function genMultiplication(diff) {
  switch (diff) {
    case 1: {
      const a = randInt(2, 10), b = randInt(2, 5);
      const q = `${a} × ${b} = ?`;
      return { q, a: a * b, options: mcOptions(a * b, Math.max(3, Math.floor(a * b / 4)), 1), meta: { kind: "mul", x: a, y: b, a: a * b } };
    }
    case 2: {
      const a = randInt(6, 12), b = randInt(6, 9);
      return { q: `${a} × ${b} = ?`, a: a * b, meta: { kind: "mul", x: a, y: b, a: a * b } };
    }
    default: {
      const kind = randInt(1, 3);
      if (kind === 1) { const a = randInt(11, 19), b = randInt(2, 9); return { q: `${a} × ${b} = ?`, a: a * b, meta: { kind: "mul", x: a, y: b, a: a * b } }; }
      if (kind === 2) { const a = pick([20, 30, 40, 50, 60]), b = randInt(4, 12); return { q: `${a} × ${b} = ?`, a: a * b, meta: { kind: "mul", x: a, y: b, a: a * b } }; }
      const a = randInt(12, 25), b = randInt(12, 25); return { q: `${a} × ${b} = ?`, a: a * b, meta: { kind: "mul", x: a, y: b, a: a * b } };
    }
  }
}

/* ---------- ADDITION generator ---------- */
/** @param {number} diff @returns {Question} */
function genAddition(diff) {
  switch (diff) {
    case 1: {
      const x = randInt(1, 12), y = randInt(1, 12);
      const a = x + y;
      return { q: `${x} + ${y} = ?`, a, options: mcOptions(a, 3, 0), meta: { kind: "add", x, y, a } };
    }
    case 2: {
      const x = randInt(10, 40), y = randInt(10, 40);
      const a = x + y;
      return { q: `${x} + ${y} = ?`, a, meta: { kind: "add", x, y, a } };
    }
    default: {
      const x = randInt(40, 200), y = randInt(20, 150);
      const a = x + y;
      return { q: `${x} + ${y} = ?`, a, meta: { kind: "add", x, y, a } };
    }
  }
}

/* ---------- SUBTRACTION generator ---------- */
/** @param {number} diff @returns {Question} */
function genSubtraction(diff) {
  switch (diff) {
    case 1: {
      const y = randInt(1, 9), x = randInt(y, 18);
      const a = x - y;
      return { q: `${x} − ${y} = ?`, a, options: mcOptions(a, 3, 0), meta: { kind: "sub", x, y, a } };
    }
    case 2: {
      const y = randInt(10, 40), x = randInt(y + 5, 80);
      const a = x - y;
      return { q: `${x} − ${y} = ?`, a, meta: { kind: "sub", x, y, a } };
    }
    default: {
      const y = randInt(20, 120), x = randInt(y + 10, 250);
      const a = x - y;
      return { q: `${x} − ${y} = ?`, a, meta: { kind: "sub", x, y, a } };
    }
  }
}

/* Topic-level question source (used when the class has no teacher-set bank) */
/**
 * @param {SessionTopicId} topicId
 * @param {number} diff
 * @returns {Question}
 * (Unknown topics fall through to subtraction — matches runtime behavior.)
 */
export function genQuestion(topicId, diff) {
  const d = Math.min(Math.max(1, diff), 5);
  if (topicId === "division") return genDivision(d);
  if (topicId === "multiplication") return genMultiplication(Math.min(d, 3));
  if (topicId === "addition") return genAddition(Math.min(d, 3));
  return genSubtraction(Math.min(d, 3));
}

/* ---------- Mock students (Chapter 4 / Appendix A) ----------
   `concepts` = per-concept struggle stats {attempts, wrongFinal, timeouts}
   keyed `${topicId}:${level}` — mirrors what real students accumulate. */
/** @type {MockStudent[]} */
export const MOCK_STUDENTS = [
  { id: "AMA001", name: "Ama", avatar: "🦊", points: 1240, levels: 7, pre: 52, post: 70, accuracy: 72, sessions: 3, duration: 20, problems: 24, x: 24, y: 72, concepts: { "division:3": { attempts: 9, wrongFinal: 3 }, "division:5": { attempts: 6, wrongFinal: 3 } } },
  { id: "KOFI001", name: "Kofi", avatar: "🐯", points: 1520, levels: 8, pre: 58, post: 78, accuracy: 75, sessions: 5, duration: 25, problems: 30, x: 30, y: 75, concepts: { "division:2": { attempts: 8, wrongFinal: 2 }, "addition:1": { attempts: 7, wrongFinal: 3 } } },
  { id: "ESI001", name: "Esi", avatar: "🦄", points: 1760, levels: 9, pre: 61, post: 80, accuracy: 81, sessions: 5, duration: 28, problems: 35, x: 35, y: 81, concepts: { "division:5": { attempts: 5, wrongFinal: 1 }, "multiplication:2": { attempts: 6, wrongFinal: 2 } } },
  { id: "YAW001", name: "Yaw", avatar: "🐼", points: 980, levels: 6, pre: 49, post: 68, accuracy: 70, sessions: 2, duration: 18, problems: 20, x: 20, y: 70, concepts: { "division:4": { attempts: 10, wrongFinal: 6 }, "division:5": { attempts: 6, wrongFinal: 4 }, "addition:2": { attempts: 5, wrongFinal: 3 } } },
  { id: "ADJ001", name: "Adjoa", avatar: "🦁", points: 2050, levels: 10, pre: 65, post: 84, accuracy: 85, sessions: 6, duration: 30, problems: 40, x: 40, y: 85, concepts: { "addition:2": { attempts: 6, wrongFinal: 1 }, "division:4": { attempts: 8, wrongFinal: 2 } } },
];

/* Chapter 4 aggregate numbers for the dashboard */
/** @type {ClassStats} */
export const CLASS_STATS = {
  n: "20–40",
  weeks: 4,
  grades: "Primary 1–5",
  engagement: { labels: ["Session\n(min)", "Problems\nper session", "Voluntary\nsessions/wk", "Levels in\n4 weeks"], values: [22.4, 28.6, 4.1, 8.2] },
  pretest: 58.3, posttest: 76.5,
  classes: { labels: ["P1", "P2", "P3", "P4", "P5"], pre: [52, 55, 60, 62, 65], post: [70, 73, 78, 80, 83] },
  usage: { accuracy: 74, retries: 1.6, completion: 89 },
  /* Miss share from MOCK_STUDENTS concept rows (Appendix A), not the full n. */
  topics: [
    { id: "division", name: "Division", icon: "➗", miss: 41 },
    { id: "addition", name: "Addition", icon: "➕", miss: 39 },
    { id: "multiplication", name: "Multiplication", icon: "✖️", miss: 33 },
    { id: "subtraction", name: "Subtraction", icon: "➖", miss: null },
  ],
};

/* ---------- Badges ----------
   Checked at endSession from the user's history / totals. Keep ids
   stable — earned ids live in the local save and must keep matching. */
/** @type {Badge[]} */
export const BADGES = [
  { id: "first", icon: "👣", name: "First Steps", desc: "Complete your first session" },
  { id: "sharp", icon: "🎯", name: "Sharp Shooter", desc: "Score 90%+ in a session" },
  { id: "perfect", icon: "💯", name: "Perfect! 100%", desc: "Answer everything first-try" },
  { id: "goldstar", icon: "⭐", name: "Gold Star", desc: "Earn 3 stars in one session" },
  { id: "combo5", icon: "⚡", name: "Combo Kid", desc: "Hit a 5-in-a-row combo" },
  { id: "bounce", icon: "💪", name: "Bounce Back", desc: "Finish a session after a retry" },
  { id: "streak3", icon: "🔥", name: "On Fire", desc: "Reach a 3-day streak" },
  { id: "streak7", icon: "🕯️", name: "Week Warrior", desc: "Keep a 7-day streak" },
  { id: "sessions10", icon: "📅", name: "Regular", desc: "Play 10 sessions" },
  { id: "collector", icon: "💰", name: "Point Collector", desc: "Earn 500 total points" },
  { id: "thousand", icon: "💎", name: "Treasure Chest", desc: "Earn 1,000 total points" },
  { id: "explorer", icon: "🧭", name: "Topic Explorer", desc: "Try every topic at least once" },
  { id: "division-master", icon: "👑", name: "Division Master", desc: "Complete all Division levels" },
  { id: "times-master", icon: "✖️", name: "Times Table Star", desc: "Complete all Multiplication levels" },
  { id: "addition-star", icon: "➕", name: "Addition Star", desc: "Complete all Addition levels" },
  { id: "subtraction-star", icon: "➖", name: "Take-Away Star", desc: "Complete all Subtraction levels" },
  { id: "scholar", icon: "📚", name: "Class Scholar", desc: "Clear every level of every topic" },
];

/** @param {User} user @param {string} topicId @returns {boolean} */
function topicCleared(user, topicId) {
  const topic = TOPICS.find(t => t.id === topicId);
  const t = user.topics && user.topics[topicId];
  if (!topic || !t) return false;
  for (let l = 1; l <= topic.levels; l++) {
    if (!t[l] || !t[l].completed) return false;
  }
  return true;
}

/** @param {string} id @param {User} user @returns {boolean} */
export function badgeCheck(id, user) {
  const hist = user.history || [];
  const acc = hist.map(h => h.accuracy);
  switch (id) {
    case "first": return hist.length >= 1;
    case "sharp": return acc.some(a => a >= 0.9);
    case "perfect": return acc.some(a => a >= 0.999);
    case "goldstar": return hist.some(h => h.stars >= 3);
    case "combo5": return hist.some(h => (h.maxCombo || 0) >= 5);
    case "bounce": return hist.some(h => h.completed && h.retries > 0);
    case "streak3": return user.streak >= 3;
    case "streak7": return user.streak >= 7;
    case "sessions10": return hist.length >= 10 || (user.played || 0) >= 10;
    case "collector": return user.points >= 500;
    case "thousand": return user.points >= 1000;
    case "explorer": return TOPICS.every(t => user.topics && user.topics[t.id]);
    case "division-master": return topicCleared(user, "division");
    case "times-master": return topicCleared(user, "multiplication");
    case "addition-star": return topicCleared(user, "addition");
    case "subtraction-star": return topicCleared(user, "subtraction");
    case "scholar": return TOPICS.every(t => topicCleared(user, t.id));
  }
  return false;
}

/* ---------- Rotating motivational messages (Results screen) ---------- */
/** @type {string[]} */
export const PRAISE = [
  "Brilliant work! Your brain just got stronger. 🧠💪",
  "Keep it up! Every question is a step to mastery.",
  "Wow! You are becoming a Maths Star. ⭐",
  "Practice makes progress — and you just made a lot!",
  "Nice job! Mistakes are proof you're trying. Keep going!",
  "You've got the power! Let's climb the leaderboard. 🏆",
];
/** @type {string[]} */
export const GENTLE = [
  "Good try! Let's review and try again — you've got this. 💪",
  "Not yet! Every master was once a beginner.",
  "Practice a little more and you'll smash this level.",
  "You're learning every time. Come back and beat your score!",
];

/** @type {string[]} */
export const AVATAR_POOL = ["🦁", "🐯", "🦊", "🐼", "🐸", "🦄", "🐙", "🦉", "🐨", "🐹"];

/* ---------- Demo credentials ---------- */
/** @type {{ username: string; password: string }} */
export const TEACHER_CREDS = { username: "teacher", password: "cognimath" };
