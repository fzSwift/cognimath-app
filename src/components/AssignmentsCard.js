/* ============================================================
   CogniMath — AssignmentsCard.js
   Teacher posts classwork or take-home work under a topic.
   ============================================================ */

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { C, FONT } from "../theme";
import { TOPICS } from "../core/data";
import {
  addAssignment, deleteAssignment, fetchTeacherAssignments, fetchTeacherGroups,
} from "../core/sync";

export default function AssignmentsCard() {
  const [groups, setGroups] = useState([]);
  const [selGroup, setSelGroup] = useState(null);
  const [topicId, setTopicId] = useState(TOPICS[0].id);
  const [kind, setKind] = useState("classwork");
  const [level, setLevel] = useState(1);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const topic = TOPICS.find(t => t.id === topicId) || TOPICS[0];

  const loadRows = useCallback(async () => {
    if (!selGroup) return;
    const { rows: list, error } = await fetchTeacherAssignments(selGroup);
    if (error) {
      const missing = error.code === "PGRST205" || error.status === 404 || /does not exist/i.test(error.message || "");
      setState(missing ? "error" : "ready");
      setMsg(missing
        ? "Run supabase/schema.sql in the SQL Editor to add assignments, then come back."
        : (error.message || "Couldn't load work."));
      setRows([]);
      return;
    }
    setMsg(null);
    setRows(list);
    setState("ready");
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

  useEffect(() => { if (selGroup) loadRows(); }, [selGroup, loadRows]);

  async function save() {
    if (busy || !selGroup) return;
    setBusy(true);
    setMsg(null);
    const { error } = await addAssignment({
      groupId: selGroup,
      topic: topicId,
      kind,
      title,
      note,
      level,
      dueOn: kind === "homework" && dueOn.trim() ? dueOn.trim() : null,
    });
    setBusy(false);
    if (error) {
      setMsg(error.message || "Couldn't post.");
      return;
    }
    setTitle("");
    setNote("");
    setDueOn("");
    await loadRows();
  }

  async function remove(id) {
    const { error } = await deleteAssignment(id);
    if (error) { setMsg(error.message); return; }
    setRows(r => r.filter(a => a.id !== id));
  }

  const shown = rows.filter(a => a.topic === topicId && (a.kind === "classwork" || a.kind === "homework"));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>📚 Classwork & take-home <Text style={styles.sub}>per topic</Text></Text>
      <Text style={styles.hint}>
        Post classwork for the lesson, or a take-home assignment. Students see it on Home under that topic and hand it in by playing the session.
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
        <Text style={styles.hint}>Create a class first — work is posted to one class.</Text>
      ) : (
        <>
          <View style={styles.chipRow}>
            <Pressable onPress={() => setKind("classwork")} style={[styles.chip, kind === "classwork" && styles.chipOn]}>
              <Text style={[styles.chipTxt, kind === "classwork" && styles.chipTxtOn]}>🏫 Classwork</Text>
            </Pressable>
            <Pressable onPress={() => setKind("homework")} style={[styles.chip, kind === "homework" && styles.chipOn]}>
              <Text style={[styles.chipTxt, kind === "homework" && styles.chipTxtOn]}>🏠 Take-home</Text>
            </Pressable>
          </View>
          <View style={styles.chipRow}>
            {TOPICS.map(t => (
              <Pressable key={t.id} onPress={() => { setTopicId(t.id); setLevel(1); }} style={[styles.chip, topicId === t.id && styles.chipOn]}>
                <Text style={[styles.chipTxt, topicId === t.id && styles.chipTxtOn]}>{t.icon} {t.name}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.chipRow}>
            {Array.from({ length: topic.levels }, (_, i) => i + 1).map(l => (
              <Pressable key={l} onPress={() => setLevel(l)} style={[styles.lvl, level === l && styles.lvlOn]}>
                <Text style={[styles.lvlTxt, level === l && styles.lvlTxtOn]}>L{l}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Title</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={kind === "homework" ? "e.g. Addition take-home" : "e.g. Division classwork"} placeholderTextColor="#B5A98F" maxLength={80} />
          <Text style={styles.label}>Note for the class (optional)</Text>
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Finish all 10 questions tonight" placeholderTextColor="#B5A98F" maxLength={280} />
          {kind === "homework" ? (
            <>
              <Text style={styles.label}>Due date (optional)</Text>
              <TextInput style={styles.input} value={dueOn} onChangeText={setDueOn} placeholder="YYYY-MM-DD" placeholderTextColor="#B5A98F" autoCapitalize="none" maxLength={10} keyboardType="numbers-and-punctuation" />
            </>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.saveBtn, busy && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
            onPress={save}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#0E3A27" /> : <Text style={styles.saveTxt}>Post {kind === "homework" ? "take-home" : "classwork"}</Text>}
          </Pressable>
          {msg ? <Text style={styles.warn}>{msg}</Text> : null}

          <Text style={styles.listTitle}>{topic.name} · {shown.length} posted</Text>
          {shown.length === 0 ? (
            <Text style={styles.hint}>Nothing posted for {topic.name} yet.</Text>
          ) : shown.map(a => (
            <View key={a.id} style={styles.qRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.qPrompt}>{a.kind === "homework" ? "🏠" : "🏫"} {a.title}</Text>
                <Text style={styles.qMeta}>
                  L{a.level}{a.due_on ? ` · due ${a.due_on}` : ""} · {a.handedIn} handed in
                </Text>
              </View>
              <Pressable onPress={() => remove(a.id)} hitSlop={8}>
                <Text style={styles.del}>Delete</Text>
              </Pressable>
            </View>
          ))}
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
  label: { fontFamily: FONT.bodyBold, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 4 },
  input: {
    fontFamily: FONT.body, fontSize: 15, color: C.ink,
    backgroundColor: "#FBF6E9", borderColor: C.cardBrd,
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  saveBtn: {
    backgroundColor: C.mint, borderRadius: 12, paddingVertical: 12, alignItems: "center", minHeight: 44, justifyContent: "center",
  },
  saveTxt: { fontFamily: FONT.headBold, fontSize: 14, color: "#0E3A27" },
  warn: { fontFamily: FONT.body, fontSize: 12, color: C.coral, lineHeight: 16 },
  listTitle: { fontFamily: FONT.head, fontSize: 13.5, color: C.txt, marginTop: 8 },
  qRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#FBF6E9", borderRadius: 12, padding: 10,
  },
  qPrompt: { fontFamily: FONT.bodyBold, fontSize: 13.5, color: C.ink },
  qMeta: { fontFamily: FONT.body, fontSize: 11, color: C.muted, marginTop: 2 },
  del: { fontFamily: FONT.bodyBold, fontSize: 12, color: C.coral },
});
