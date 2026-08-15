/* Shared input checks. Keep in lockstep with teacher-web/src/lib/validate.js.
   The database still rejects bad rows; this is the client copy of the same
   rules so the UI can say why instead of a Postgres error. */

/**
 * Discriminated validation result: `{ ok: true, value }` or `{ ok: false, error }`.
 * @template T
 * @typedef {{ ok: true; value: T } | { ok: false; error: string }} Result
 */

/** @type {string[]} */
export const TOPICS = ["division", "multiplication", "addition", "subtraction"];
/** @type {string[]} */
export const TOPICS_MIXED = [...TOPICS, "mixed"];
/** @type {string[]} */
export const STUDENT_AVATARS = ["🦁", "🐯", "🦊", "🐼", "🐸", "🦄", "🐙", "🦉", "🐨", "🐹"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const JOIN_RE = /^[A-Z0-9]{4,12}$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const CTRL_RE = /[\u0000-\u001f]/;

/** @template T @param {T} value @returns {Result<T>} */
function ok(value) { return { ok: true, value }; }
/** @param {string} error @returns {Result<never>} */
function bad(error) { return { ok: false, error }; }

/** @param {unknown} s @returns {string} */
function collapse(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

/** @param {unknown} s @returns {Result<string>} */
export function email(s) {
  const value = String(s || "").trim().toLowerCase();
  if (!value) return bad("Enter your email.");
  if (value.length > 254) return bad("That email is too long.");
  if (!EMAIL_RE.test(value)) return bad("That email doesn't look right.");
  return ok(value);
}

/** @param {unknown} s @param {{ min?: number }} [opts] @returns {Result<string>} */
export function password(s, { min = 6 } = {}) {
  const value = String(s ?? "");
  if (value.length < min) {
    return bad(min <= 1 ? "Enter your password." : "Use at least 6 characters.");
  }
  if (value.length > 72) return bad("Use at most 72 characters.");
  return ok(value);
}

/** @param {unknown} s @returns {Result<string>} */
export function displayName(s) {
  const value = collapse(s);
  if (!value) return bad("Give yourself a name first.");
  if (value.length > 64) return bad("Keep the name to 64 characters.");
  if (CTRL_RE.test(value)) return bad("That name has characters we can't use.");
  return ok(value);
}

/** @param {unknown} s @param {{ teacher?: boolean }} [opts] @returns {Result<string>} */
export function avatar(s, { teacher } = {}) {
  const value = String(s || "").trim();
  if (!value) return bad("Pick an avatar.");
  if (teacher) {
    if (value.length > 16) return bad("Pick an avatar from the list.");
    return ok(value);
  }
  if (!STUDENT_AVATARS.includes(value)) return bad("Pick an avatar from the list.");
  return ok(value);
}

/** @param {unknown} s @returns {Result<string>} */
export function joinCode(s) {
  const value = String(s || "").trim().toUpperCase();
  if (!JOIN_RE.test(value)) return bad("Class codes are 4–12 letters or numbers.");
  return ok(value);
}

/** @param {unknown} s @returns {Result<string>} */
export function groupName(s) {
  const value = collapse(s);
  if (!value) return bad("Name the class first.");
  if (value.length > 60) return bad("Keep the class name to 60 characters.");
  if (CTRL_RE.test(value)) return bad("That name has characters we can't use.");
  return ok(value);
}

/** @param {unknown} s @param {string} [missing] @returns {Result<string>} */
export function uuid(s, missing = "That class is missing.") {
  const value = String(s || "").trim();
  if (!UUID_RE.test(value)) return bad(missing);
  return ok(value);
}

/** @param {unknown} s @returns {Result<number>} */
export function rowId(s) {
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) return bad("That item is missing.");
  return ok(n);
}

/** @param {unknown} s @param {{ mixed?: boolean }} [opts] @returns {Result<string>} */
export function topic(s, { mixed } = {}) {
  const value = String(s || "");
  const allowed = mixed ? TOPICS_MIXED : TOPICS;
  if (!allowed.includes(value)) return bad("Pick a topic.");
  return ok(value);
}

/** @param {unknown} n @returns {Result<number>} */
export function level(n) {
  const value = Number(n);
  if (!Number.isInteger(value) || value < 1 || value > 5) return bad("Level must be 1–5.");
  return ok(value);
}

/** @param {unknown} s @returns {Result<string>} */
export function prompt(s) {
  const value = collapse(s);
  if (!value) return bad("Write the question first.");
  if (value.length > 280) return bad("Keep the question to 280 characters.");
  if (CTRL_RE.test(value)) return bad("That question has characters we can't use.");
  return ok(value);
}

/** @param {unknown} s @returns {Result<number>} */
export function answerNum(s) {
  const t = String(s ?? "").trim();
  if (!t || !NUM_RE.test(t)) return bad("Answer must be a number.");
  const value = Number(t);
  if (!Number.isFinite(value) || Math.abs(value) > 1e9) return bad("That number is too big.");
  return ok(value);
}

/** @param {unknown} list @param {number} correct @returns {Result<number[]>} */
export function distractors(list, correct) {
  if (list == null || list === "") return ok([]);
  const raw = Array.isArray(list) ? list : String(list).split(/[,\s]+/);
  /** @type {number[]} */
  const nums = [];
  for (const x of raw) {
    const t = String(x).trim();
    if (!t) continue;
    if (!NUM_RE.test(t)) return bad("Wrong answers must be numbers.");
    const n = Number(t);
    if (!Number.isFinite(n) || Math.abs(n) > 1e9) return bad("That number is too big.");
    if (n !== correct && !nums.includes(n)) nums.push(n);
  }
  if (nums.length > 5) return bad("At most 5 wrong answers.");
  return ok(nums);
}

/** @param {unknown} s @param {string} fallback @returns {Result<string>} */
export function assignmentTitle(s, fallback) {
  const value = collapse(s);
  if (!value) return ok(fallback);
  if (value.length > 80) return bad("Keep the title to 80 characters.");
  if (CTRL_RE.test(value)) return bad("That title has characters we can't use.");
  return ok(value);
}

/** @param {unknown} s @returns {Result<string | null>} */
export function assignmentNote(s) {
  const value = String(s || "").trim();
  if (!value) return ok(null);
  if (value.length > 280) return bad("Keep the note to 280 characters.");
  if (CTRL_RE.test(value)) return bad("That note has characters we can't use.");
  return ok(value);
}

/** @param {unknown} s @returns {Result<string | null>} */
export function dueDate(s) {
  const value = String(s || "").trim();
  if (!value) return ok(null);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return bad("Due date must be YYYY-MM-DD.");
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return bad("That due date is not a real day.");
  }
  if (y < 2020 || y > 2100) return bad("That due date is out of range.");
  return ok(value);
}

/** @param {unknown} s @returns {Result<string>} */
export function workKind(s) {
  if (s === "homework" || s === "classwork") return ok(s);
  return bad("Pick classwork or take-home.");
}

/** @param {unknown} s @returns {Result<string>} */
export function termKind(s) {
  if (s === "term_end" || s === "term_start") return ok(s);
  return bad("Pick a start-of-term or end-of-term quiz.");
}

/** @param {unknown} s @returns {Result<string>} */
export function typedAnswer(s) {
  const t = String(s ?? "").replace(/[^0-9.\-]/g, "").slice(0, 12);
  if (!t || t === "-" || t === "." || t === "-.") return bad("Type an answer first.");
  if (!NUM_RE.test(t)) return bad("Use numbers only.");
  const value = Number(t);
  if (!Number.isFinite(value)) return bad("Use numbers only.");
  return ok(t);
}
