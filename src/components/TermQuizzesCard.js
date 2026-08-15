/* ============================================================
   CogniMath — TermQuizzesCard.js
   Teacher posts a start-of-term and end-of-term mixed quiz.
   Scores feed the pilot study (first finish is the mark).
   ============================================================ */

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { C, FONT } from "../theme";
import {
  addTermQuiz, deleteAssignment, fetchTeacherGroups, fetchTermQuizReport,
} from "../core/sync";

export default function TermQuizzesCard() {
  const [groups, setGroups] = useState([]);
  const [selGroup, setSelGroup] = useState(null);
  const [report, setReport] = useState(null);
  const [level, setLevel] = useState(2);
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    if (!selGroup) return;
    const r = await fetchTermQuizReport(selGroup);
    if (r.error && (r.error.code === "PGRST205" || r.error.status === 404 || /does not exist|assignment_id/i.test(r.error.message || ""))) {
      setState("error");
      setMsg("Run supabase/schema.sql in the SQL Editor to add term quizzes, then come back.");
      setReport(r);
      return;
    }
    setMsg(r.error ? (r.error.message || "Couldn't load.") : null);
    setReport(r);
    setState("ready");
    if (r.start && r.start.level) setLevel(r.start.level);
  }, [selGroup]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const gs = await fetchTeacherGroups();
      if (!alive) return;
      if (!gs.length) { setState("empty-groups"); return; }
      setGroups(gs);
      setSelGroup(gs[0].id);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => { if (selGroup) load(); }, [selGroup, load]);

  async function post(kind) {
    if (busy || !selGroup) return;
    setBusy(kind);
    setMsg(null);
    const { error } = await addTermQuiz({ groupId: selGroup, kind, level });
    setBusy(null);
    if (error) { setMsg(error.message || "Couldn't post."); return; }
    await load();
  }

  async function remove(id) {
    const { error } = await deleteAssignment(id);
    if (error) { setMsg(error.message); return; }
    await load();
  }

  const start = report && report.start;
  const end = report && report.end;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>📋 Term quizzes <Text style={styles.sub}>pilot study</Text></Text>
      <Text style={styles.hint}>
        Start of term, then the same mix at the end. Students see it on Home. One try — the first finish is the mark.
      </Text>

      {groups.length > 1 ? (
        <View style={styles.chipRow}>
          {groups.map(g => (
            <Pressable key={g.id} onPress={() => setSelGroup(g.id)} style={[styles.chip, selGroup === g.id && styles.chipOn]}>
              <Text style={[styles.chipTxt, selGroup === g.id && styles.chipTxtOn]}>{g.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : groups.length === 1 ? (
        <Text style={styles.className}>🏫 {groups[0].name}</Text>
      ) : null}

      {state === "loading" ? (
        <ActivityIndicator color={C.gold} style={{ marginTop: 10 }} />
      ) : state === "empty-groups" ? (
        <Text style={styles.hint}>Create a class first.</Text>
      ) : (
        <>
          <View style={styles.chipRow}>
            {[1, 2, 3].map(l => (
              <Pressable key={l} onPress={() => setLevel(l)} disabled={!!(start || end)} style={[styles.lvl, level === l && styles.lvlOn, (start || end) && { opacity: 0.5 }]}>
                <Text style={[styles.lvlTxt, level === l && styles.lvlTxtOn]}>L{l}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.paper}>
            <Text style={styles.paperTitle}>📋 Start of term</Text>
            {start ? (
              <>
                <Text style={styles.hint}>Level {start.level} · {start.handedIn || 0} handed in</Text>
                <Pressable onPress={() => remove(start.id)} hitSlop={8}><Text style={styles.del}>Delete</Text></Pressable>
              </>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.saveBtn, busy && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
                onPress={() => post("term_start")}
                disabled={!!busy}
              >
                {busy === "term_start" ? <ActivityIndicator color="#0E3A27" /> : <Text style={styles.saveTxt}>Post start-of-term quiz</Text>}
              </Pressable>
            )}
          </View>

          <View style={styles.paper}>
            <Text style={styles.paperTitle}>🏁 End of term</Text>
            {end ? (
              <>
                <Text style={styles.hint}>Level {end.level} · {end.handedIn || 0} handed in</Text>
                <Pressable onPress={() => remove(end.id)} hitSlop={8}><Text style={styles.del}>Delete</Text></Pressable>
              </>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.saveBtn, busy && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
                onPress={() => post("term_end")}
                disabled={!!busy}
              >
                {busy === "term_end" ? <ActivityIndicator color="#0E3A27" /> : <Text style={styles.saveTxt}>Post end-of-term quiz</Text>}
              </Pressable>
            )}
          </View>

          {report && (report.nPre > 0 || report.nPost > 0) ? (
            <Text style={styles.marks}>
              Class average: {report.pretest != null ? `${report.pretest}%` : "—"} → {report.posttest != null ? `${report.posttest}%` : "—"}
              {report.pretest != null && report.posttest != null ? `  (+${Math.round(report.posttest - report.pretest)})` : ""}
            </Text>
          ) : null}

          {msg ? <Text style={styles.warn}>{msg}</Text> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1,
    borderLeftWidth: 3, borderLeftColor: C.margin,
    borderRadius: 20, padding: 16, marginBottom: 14, gap: 8,
  },
  title: { fontFamily: FONT.head, fontSize: 15.5, color: C.txt },
  sub: { fontSize: 10.5, color: C.muted, fontFamily: FONT.bodyBold },
  hint: { fontFamily: FONT.body, fontSize: 12, color: C.muted, lineHeight: 17 },
  className: { fontFamily: FONT.bodyBold, fontSize: 12, color: C.mint },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: "#FBF6E9", borderColor: C.cardBrd, borderWidth: 1,
  },
  chipOn: { backgroundColor: "rgba(240,180,41,0.28)", borderColor: C.gold },
  chipTxt: { fontFamily: FONT.bodyBold, fontSize: 12, color: C.ink },
  chipTxtOn: { color: C.darkInk },
  lvl: {
    width: 36, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 10,
    backgroundColor: "#FBF6E9", borderColor: C.cardBrd, borderWidth: 1,
  },
  lvlOn: { backgroundColor: C.board, borderColor: C.board },
  lvlTxt: { fontFamily: FONT.bodyBold, fontSize: 12, color: C.ink },
  lvlTxtOn: { color: C.chalk },
  paper: {
    backgroundColor: "#FBF6E9", borderRadius: 12, padding: 12, gap: 6,
  },
  paperTitle: { fontFamily: FONT.head, fontSize: 14, color: C.txt },
  saveBtn: {
    backgroundColor: C.mint, borderRadius: 12, paddingVertical: 10, alignItems: "center", minHeight: 40, justifyContent: "center",
  },
  saveTxt: { fontFamily: FONT.headBold, fontSize: 13.5, color: "#0E3A27" },
  del: { fontFamily: FONT.bodyBold, fontSize: 12, color: C.coral },
  marks: { fontFamily: FONT.head, fontSize: 14, color: C.txt, marginTop: 4 },
  warn: { fontFamily: FONT.body, fontSize: 12, color: C.coral, lineHeight: 16 },
});
