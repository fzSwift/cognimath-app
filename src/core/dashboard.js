/* ============================================================
   CogniMath — dashboard.js (Expo port)
   Aggregate per-concept struggle data across the whole class
   (mock students from the pilot + real students using the app),
   plus the "live" flag that surfaces real students' struggles
   above seeded pilot data.
   ============================================================ */

import { MOCK_STUDENTS, TEACHER_CREDS } from "./data.js";
import { loadSave } from "./engine.js";

export function classConceptStats() {
  const acc = {};
  const add = (name, concepts) => {
    if (!concepts) return;
    for (const k in concepts) {
      const s = concepts[k];
      if (!s || !s.attempts) continue;
      if (!acc[k]) acc[k] = { attempts: 0, wrongFirst: 0, wrongFinal: 0, timeouts: 0, students: [] };
      const a = acc[k];
      a.attempts += s.attempts; a.wrongFirst += s.wrongFirst;
      a.wrongFinal += s.wrongFinal; a.timeouts += s.timeouts;
      if (s.wrongFinal / s.attempts >= 0.4) a.students.push(name);
    }
  };
  MOCK_STUDENTS.forEach(m => add(m.name, m.concepts));
  for (const id in loadSave().users) {
    const u = loadSave().users[id];
    if (u.username !== TEACHER_CREDS.username) add(u.name, u.concepts);
  }
  return acc;
}

/* Ranked rows for the "Concepts students struggle with" card:
   real (non-mock) student flags rank on top, then by final misses. */
export function struggleRows() {
  const stats = classConceptStats();
  const realNames = Object.values(loadSave().users)
    .filter(u => u.username !== TEACHER_CREDS.username)
    .map(u => u.name);
  return Object.keys(stats)
    .map(k => {
      const s = stats[k];
      const students = s.students || [];
      return {
        key: k,
        attempts: s.attempts || 0,
        wrongFinal: s.wrongFinal || 0,
        timeouts: s.timeouts || 0,
        rate: s.attempts ? s.wrongFinal / s.attempts : 0,
        students,
        live: students.some(n => realNames.includes(n)),
      };
    })
    .sort((a, b) => (b.live - a.live) || b.wrongFinal - a.wrongFinal || b.rate - a.rate)
    .slice(0, 5);
}
