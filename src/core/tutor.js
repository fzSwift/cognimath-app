/* ============================================================
   CogniMath — tutor.js (Expo port)
   The "AI tutor": builds step-by-step worked solutions from a
   question's structured `meta`, plus one-line hints and
   concept labels for the teacher dashboard.

   Variety: each question kind has SEVERAL real solution
   strategies (counting up, multiplication facts, repeated
   subtraction, sharing, splitting tens/ones, doubling, the ×9
   trick…). The same question ALWAYS gets the same strategy
   (consistent for learning, reproducible), but different
   questions rotate through the options so explanations don't
   feel scripted. All strategies are pure template math — no LLM.
   ============================================================ */

import { LEVEL_NAMES, TOPICS } from "./data.js";

/** @typedef {import("../../../shared/domain").QuestionMeta} QuestionMeta */
/** @typedef {{ t: string; f?: string }} TutorStep */
/** @typedef {(m: any, a: number) => TutorStep[] | null} Strategy */

/* Step format: { t: "explanation text", f: "formula line (optional)" } */

/* fnv-1a — deterministic pick so a given question maps to one strategy */
/** @param {...unknown} parts */
function seedFor(...parts) {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  }
  return h >>> 0;
}

/* Try variants from a question-seeded index, wrapping around; a variant
   returns null when its strategy doesn't apply (e.g. splitting needs a
   factor ≥ 10), so an inapplicable pick falls through to the next. */
/**
 * @param {(string | number | undefined)[]} seedParts
 * @param {Strategy[]} variants
 * @param {any} m
 * @param {number} a
 * @returns {TutorStep[]}
 */
function pick(seedParts, variants, m, a) {
  const n = variants.length;
  const start = seedFor(...seedParts) % n;
  for (let i = 0; i < n; i++) {
    const steps = variants[(start + i) % n](m, a);
    if (steps) return steps;
  }
  return [{ t: `The correct answer is ${a}.` }];
}

/* ---------- division strategies ---------- */

/** @type {Strategy} */
const divFit = (m, a) => {
  const x = m.x, y = m.y;
  const terms = [];
  for (let i = 1; i <= a && i <= 5; i++) terms.push(y * i);
  const rest = a > 5 ? " … " + x : "";
  return [
    { t: `We need to find how many ${y}s fit into ${x}.` },
    { t: `Count up in ${y}s: ${terms.join(", ")}${rest}` },
    { t: `We reach ${x} after ${a} jumps.`, f: `${y} × ${a} = ${x}` },
    { t: `So the answer is:`, f: `${x} ÷ ${y} = ${a}` },
    { t: `Check: ${a} × ${y} = ${x} ✓` },
  ];
};

/** @type {Strategy} */
const divFacts = (m, a) => {
  const x = m.x, y = m.y;
  return [
    { t: `Division is the reverse of multiplication — ask the opposite:`, f: `${y} × ? = ${x}` },
    { t: `You already know that ${y} × ${a} = ${x}.` },
    { t: `If ${y} groups of ${a} make ${x}, then ${x} split into ${y}s gives ${a}.`, f: `${x} ÷ ${y} = ${a}` },
    { t: `Check: ${a} × ${y} = ${x} ✓` },
  ];
};

/** @type {Strategy} */
const divSubtract = (m, a) => {
  const x = m.x, y = m.y;
  const shown = [];
  let v = x;
  for (let i = 0; i < a && i < 3; i++) { v -= y; shown.push(v); }
  const tail = a > 3 ? ` → … → 0` : "";
  return [
    { t: `Start at ${x} and take away ${y} each time:`, f: `${x} → ${shown.join(" → ")}${tail}` },
    { t: `It takes ${a} subtractions to reach 0.` },
    { t: `So ${x} holds ${a} groups of ${y}:`, f: `${x} ÷ ${y} = ${a}` },
    { t: `Check: ${a} × ${y} = ${x} ✓` },
  ];
};

/** @type {Strategy} */
const divShare = (m, a) => {
  const x = m.x, y = m.y;
  return [
    { t: `${x} ÷ ${y} means sharing ${x} into ${y} equal groups.` },
    { t: `Share them out one by one until all ${x} are gone.` },
    { t: `Each of the ${y} groups ends up with ${a}.` },
    { t: `So:`, f: `${x} ÷ ${y} = ${a}` },
    { t: `Check: ${y} groups of ${a} make ${x} ✓` },
  ];
};

/* ---------- multiplication strategies ---------- */

/** @type {Strategy} */
const mulCount = (m, a) => {
  const x = m.x, y = m.y;
  const terms = [];
  for (let i = 1; i <= y && i <= 6; i++) terms.push(x * i);
  const rest = y > 6 ? " … " + a : "";
  return [
    { t: `We are adding ${x} together ${y} times (or ${y} groups of ${x}).` },
    { t: `Count up in ${x}s: ${terms.join(", ")}${rest}` },
    { t: `After ${y} jumps we reach ${a}.` },
    { t: `So:`, f: `${x} × ${y} = ${a}` },
    { t: `Check: count back down to zero in ${x}s ✓` },
  ];
};

/** @type {Strategy} */
const mulSplit = (m, a) => {
  const x = m.x, y = m.y;
  const big = Math.max(x, y), small = Math.min(x, y);
  const tens = Math.floor(big / 10) * 10;
  const ones = big % 10;
  if (tens === 0) return null; // nothing to split
  const part1 = ones ? `${tens} × ${small} = ${tens * small}   and   ${ones} × ${small} = ${ones * small}` : `${tens} × ${small} = ${tens * small}`;
  const parts2 = ones ? `${tens * small} + ${ones * small} = ${a}` : `${tens * small} = ${a}`;
  return [
    { t: `Split ${big} into tens and ones:`, f: ones ? `${big} = ${tens} + ${ones}` : `${big} = ${tens}` },
    { t: `Multiply each part by ${small}:`, f: part1 },
    { t: `Add the results:`, f: parts2 },
    { t: `So:`, f: `${x} × ${y} = ${a}` },
    { t: `Check: ${a} ÷ ${small} = ${big} ✓` },
  ];
};

/** @type {Strategy} */
const mulDouble = (m, a) => {
  const x = m.x, y = m.y;
  const n = y === 2 ? 1 : y === 4 ? 2 : y === 8 ? 3 : null;
  if (!n) return null;
  const chain = [];
  let v = x;
  chain.push(v);
  for (let i = 0; i < n; i++) { v *= 2; chain.push(v); }
  const word = n === 1 ? "one double" : n === 2 ? "double, then double again" : "double, double, double";
  return [
    { t: `Multiplying by ${y} is the same as ${word}.` },
    { t: `Follow the doubles:`, f: chain.join(" → ") },
    { t: `So:`, f: `${x} × ${y} = ${a}` },
    { t: `Check: ${a} ÷ ${y} = ${x} ✓` },
  ];
};

/** @type {Strategy} */
const mulNines = (m, a) => {
  const x = m.x, y = m.y;
  const base = y === 9 ? x : x === 9 ? y : null;
  if (base == null) return null;
  return [
    { t: `The ×9 trick: 10 groups minus 1 group.`, f: `${base} × 10 = ${base * 10}` },
    { t: `Take one group away:`, f: `${base * 10} − ${base} = ${a}` },
    { t: `So:`, f: `${x} × ${y} = ${a}` },
    { t: `Check: ${a} ÷ 9 = ${base} ✓` },
  ];
};

/** @type {Strategy} */
const mulSwap = (m, a) => {
  const x = m.x, y = m.y;
  if (x === y) return null;
  const small = Math.min(x, y), big = Math.max(x, y);
  return [
    { t: `Multiplying works either way round — swap the numbers:`, f: `${x} × ${y} = ${y} × ${x}` },
    { t: `Count up in ${small}s ${big} times: ${small}, ${small * 2}, ${small * 3} … ${a}` },
    { t: `So:`, f: `${x} × ${y} = ${a}` },
    { t: `Check: ${a} ÷ ${small} = ${big} ✓` },
  ];
};

/* ---------- addition strategies ---------- */

/** @type {Strategy} */
const addCount = (m, a) => {
  const x = m.x, y = m.y;
  return [
    { t: `Start at ${x} and count on ${y} more.` },
    { t: `${x} … plus ${y} lands on ${a}.`, f: `${x} + ${y} = ${a}` },
    { t: `Check: ${a} − ${y} = ${x} ✓` },
  ];
};

/** @type {Strategy} */
const addSplit = (m, a) => {
  const x = m.x, y = m.y;
  if (y < 10) return null;
  const tens = Math.floor(y / 10) * 10, ones = y - tens;
  return [
    { t: `Split ${y} into ${tens} and ${ones} to make adding easier.` },
    { t: `First:`, f: `${x} + ${tens} = ${x + tens}` },
    { t: `Then add the ones:`, f: `${x + tens} + ${ones} = ${a}` },
    { t: `So:`, f: `${x} + ${y} = ${a}` },
  ];
};

/** @type {Strategy} */
const addFacts = (m, a) => [
  { t: `Addition is putting two amounts together.`, f: `${m.x} + ${m.y}` },
  { t: `The total is ${a}.`, f: `${m.x} + ${m.y} = ${a}` },
  { t: `Check: ${a} − ${m.x} = ${m.y} ✓` },
];

/* ---------- subtraction strategies ---------- */

/** @type {Strategy} */
const subCount = (m, a) => [
  { t: `Start at ${m.x} and count back ${m.y}.` },
  { t: `You land on ${a}.`, f: `${m.x} − ${m.y} = ${a}` },
  { t: `Check: ${a} + ${m.y} = ${m.x} ✓` },
];

/** @type {Strategy} */
const subFacts = (m, a) => [
  { t: `Subtraction asks: what is left when we take ${m.y} from ${m.x}?` },
  { t: `The difference is ${a}.`, f: `${m.x} − ${m.y} = ${a}` },
  { t: `Check with addition:`, f: `${a} + ${m.y} = ${m.x} ✓` },
];

/** @type {Strategy} */
const subAddCheck = (m, a) => [
  { t: `Think of the addition fact that matches:`, f: `${a} + ${m.y} = ${m.x}` },
  { t: `If ${a} plus ${m.y} makes ${m.x}, then ${m.x} take away ${m.y} is ${a}.` },
  { t: `So:`, f: `${m.x} − ${m.y} = ${a}` },
];

/* ---------- algebra strategies ---------- */

/**
 * @param {{ type?: string; a: number; b: number; c?: number }} m
 * @param {number} x
 * @returns {TutorStep[]}
 */
function algBody(m, x) {
  if (m.type === "x+a=b") {
    return [
      { t: `x has +${m.a}, so subtract ${m.a} from BOTH sides:`, f: `x + ${m.a} − ${m.a} = ${m.b} − ${m.a}` },
      { t: `The +${m.a} and −${m.a} cancel on the left:`, f: `x = ${x}` },
      { t: `Check: ${x} + ${m.a} = ${m.b} ✓` },
    ];
  }
  if (m.type === "x−a=b") {
    return [
      { t: `x has −${m.a}, so add ${m.a} to BOTH sides:`, f: `x − ${m.a} + ${m.a} = ${m.b} + ${m.a}` },
      { t: `The −${m.a} and +${m.a} cancel:`, f: `x = ${x}` },
      { t: `Check: ${x} − ${m.a} = ${m.b} ✓` },
    ];
  }
  if (m.type === "a−x=c") {
    return [
      { t: `x is being subtracted from ${m.a} — swap it around:`, f: `${m.a} − x = ${m.c}  →  x = ${m.a} − ${m.c}` },
      { t: `So:`, f: `x = ${x}` },
      { t: `Check: ${m.a} − ${x} = ${m.c} ✓` },
    ];
  }
  return [
    { t: `x is multiplied by ${m.a} — divide BOTH sides:`, f: `${m.a} × x ÷ ${m.a} = ${m.b} ÷ ${m.a}` },
    { t: `The ${m.a}s cancel on the left:`, f: `x = ${x}` },
    { t: `Check: ${m.a} × ${x} = ${m.b} ✓` },
  ];
}

/** @type {Strategy} */
const algPlain = (m, a) => [{ t: `We want to get the unknown x all by itself.` }, ...algBody(m, a)];

/** @type {Strategy} */
const algBalance = (m, a) => [
  { t: `Think of the equation as a balance scale — do the SAME to both sides to keep it level.` },
  ...algBody(m, a),
];

/** @type {Strategy} */
const algMachine = (m, a) => [
  { t: `Think of x going through a machine. To get x back, we do the OPPOSITE of what the machine did.` },
  ...algBody(m, a),
];

/* ---------- word-problem strategies ---------- */

/**
 * @param {{ op: "div" | "mul" | "add" | "sub"; n1: number; n2: number; unit: string; group?: string; groupS?: string }} m
 * @param {number} a
 * @returns {TutorStep[]}
 */
function wordBody(m, a) {
  const { op, n1, n2, unit, group, groupS } = m;
  const sym = op === "div" ? "÷" : op === "mul" ? "×" : op === "add" ? "+" : "−";
  const n2s = n2.toLocaleString(), n1s = n1.toLocaleString(), ans = a.toLocaleString();
  const steps = [];
  if (op === "div") {
    steps.push({ t: `Sharing ${group || "things"} equally means DIVIDE.`, f: `${n1s} ÷ ${n2s}` });
    steps.push({ t: `Each ${groupS || "part"} gets the same amount:`, f: `${n1s} ÷ ${n2s} = ${ans}` });
    steps.push({ t: `Answer: each ${groupS || "part"} gets ${ans} ${unit}${a > 1 ? "s" : ""}.` });
  } else if (op === "mul") {
    steps.push({ t: `${n1} equal ${group || "groups"} of ${n2} each means MULTIPLY.`, f: `${n1s} × ${n2s}` });
    steps.push({ t: `Total:`, f: `${n1s} × ${n2s} = ${ans}` });
    steps.push({ t: `Answer: ${ans} ${unit}${a > 1 ? "s" : ""}.` });
  } else if (op === "add") {
    steps.push({ t: `"More / join / altogether" means ADD.`, f: `${n1s} + ${n2s}` });
    steps.push({ t: `Total:`, f: `${n1s} + ${n2s} = ${ans}` });
    steps.push({ t: `Answer: ${ans} ${unit}${a > 1 ? "s" : ""}.` });
  } else {
    steps.push({ t: `"Left / gives away / sells" means SUBTRACT.`, f: `${n1s} − ${n2s}` });
    steps.push({ t: `Remaining:`, f: `${n1s} − ${n2s} = ${ans}` });
    steps.push({ t: `Answer: ${ans} ${unit}${a > 1 ? "s" : ""} left.` });
  }
  steps.push({ t: `Sense-check: ${ans} ${unit}${a > 1 ? "s" : ""} fits the story ✓` });
  return steps;
}

/** @type {Strategy} */
const wPlain = (m, a) => [
  { t: `Read the story and pick out the numbers:`, f: `${m.n1.toLocaleString()} and ${m.n2.toLocaleString()}` },
  ...wordBody(m, a),
];

/** @type {Strategy} */
const wFind = (m, a) => [
  { t: `What is the story asking us to find? Spot the action word — that picks the operation.` },
  ...wordBody(m, a),
];

/** @type {Strategy} */
const wTurn = (m, a) => {
  const sym = m.op === "div" ? "÷" : m.op === "mul" ? "×" : m.op === "add" ? "+" : "−";
  return [
    { t: `Translate the story into a number sentence:`, f: `${m.n1.toLocaleString()} ${sym} ${m.n2.toLocaleString()}` },
    ...wordBody(m, a),
  ];
};

/* ---------- public API ---------- */

/** @param {{ meta?: QuestionMeta; a: number }} q @returns {TutorStep[]} */
export function tutorSteps(q) {
  const m = q.meta || {};
  const a = q.a;

  switch (m.kind) {
    case "div":
      return pick([m.kind, m.x, m.y, a], [divFit, divFacts, divSubtract, divShare], m, a);
    case "mul":
      return pick([m.kind, m.x, m.y, a], [mulCount, mulSplit, mulDouble, mulNines, mulSwap], m, a);
    case "add":
      return pick([m.kind, m.x, m.y, a], [addCount, addSplit, addFacts], m, a);
    case "sub":
      return pick([m.kind, m.x, m.y, a], [subCount, subFacts, subAddCheck], m, a);
    case "alg":
      return pick([m.kind, m.type, m.a, m.b, m.c, a], [algPlain, algBalance, algMachine], m, a);
    case "word":
      return pick([m.kind, m.op, m.n1, m.n2, a], [wPlain, wFind, wTurn], m, a);
    default:
      return [{ t: `The correct answer is ${a}.` }];
  }
}

/* One-line reinforcement shown when a student fixes a question on retry */
/** @param {{ meta?: QuestionMeta; a: number }} q @returns {string} */
export function tutorHint(q) {
  const m = q.meta || {};
  if (m.kind === "div") return `Remember: ${m.x} ÷ ${m.y} = ${m.a} because ${m.y} × ${m.a} = ${m.x}.`;
  if (m.kind === "mul") return `Remember: ${m.x} × ${m.y} = ${m.a}.`;
  if (m.kind === "add") return `Remember: ${m.x} + ${m.y} = ${m.a}.`;
  if (m.kind === "sub") return `Remember: ${m.x} − ${m.y} = ${m.a}. Check: ${m.a} + ${m.y} = ${m.x}.`;
  if (m.kind === "alg") return `Get x alone: x = ${m.x}. Check: ${m.x} works in the equation ✓`;
  if (m.kind === "word") {
    const sym = m.op === "div" ? "÷" : m.op === "mul" ? "×" : m.op === "add" ? "+" : "−";
    return `Key move: ${m.n1} ${sym} ${m.n2} = ${q.a}.`;
  }
  return `The answer is ${q.a}.`;
}

/* Human label for a concept key like "division:4" */
/** @param {string} key @returns {string} */
export function conceptLabel(key) {
  const [topicId, diff] = key.split(":");
  const t = TOPICS.find(x => x.id === topicId);
  if (!t) return key;
  const name = LEVEL_NAMES[topicId] && LEVEL_NAMES[topicId][Number(diff) - 1];
  return `${t.icon} ${t.name} — ${name || "Level " + diff}`;
}
