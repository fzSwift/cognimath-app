/* ============================================================
   CogniMath — QuestionsCard.js
   Teacher writes quiz items per class + category. Students in
   that class play these instead of the built-in generators.
   ============================================================ */

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { C, FONT } from "../theme";
import { TOPICS } from "../core/data";
import {
  addTeacherQuestion, deleteTeacherQuestion, fetchTeacherGroups, fetchTeacherQuestions,
} from "../core/sync";

export default function QuestionsCard() {
  const [groups, setGroups] = useState([]);
  const [selGroup, setSelGroup] = useState(null);
  const [topicId, setTopicId] = useState(TOPICS[0].id);
  const [level, setLevel] = useState(1);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [wrongs, setWrongs] = useState("");
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading"); // loading | nosession | empty-groups | ready | error
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const topic = TOPICS.find(t => t.id === topicId) || TOPICS[0];

  const loadRows = useCallback(async () => {
    if (!selGroup) return;
    const { rows: list, error } = await fetchTeacherQuestions(selGroup);
    if (error) {
      const missing = error.code === "PGRST205" || error.status === 404 || /does not exist/i.test(error.message || "");
      setState(missing ? "error" : "ready");
      setNote(missing
        ? "Run supabase/schema.sql in the SQL Editor to add the questions table, then come back."
        : (error.message || "Couldn't load questions."));
      setRows([]);
      return;
    }
    setNote(null);
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
    setNote(null);
    const distractors = wrongs.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    const { error } = await addTeacherQuestion({
      groupId: selGroup,
      topic: topicId,
      level,
      prompt,
      answer,
      wrongs: distractors,
    });
    setBusy(false);
    if (error) {
      const missing = /does not exist|PGRST205/i.test(error.message || "");
      setNote(missing
        ? "Run supabase/schema.sql in the SQL Editor to add the questions table."
        : (error.message || "Couldn't save."));
      return;
    }
    setPrompt("");
    setAnswer("");
    setWrongs("");
    await loadRows();
  }

  async function remove(id) {
    const { error } = await deleteTeacherQuestion(id);
    if (error) { setNote(error.message); return; }
    setRows(r => r.filter(q => q.id !== id));
  }

  const shown = rows.filter(q => q.topic === topicId);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>📝 Class questions <Text style={styles.sub}>per category</Text></Text>
      <Text style={styles.hint}>
        Write the questions your class will see for Division, Multiplication, Addition and Subtraction.
        If a category is empty, students get the built-in practice questions instead.
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
        <Text style={styles.hint}>Create a class first (or sign in with your teacher cloud account) — questions belong to one class.</Text>
      ) : (
        <>
          <View style={styles.chipRow}>
            {TOPICS.map(t => (
              <Pressable
                key={t.id}
                onPress={() => { setTopicId(t.id); setLevel(1); }}
                style={[styles.chip, topicId === t.id && styles.chipOn]}
              >
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

          <Text style={styles.label}>Question</Text>
          <TextInput
            style={styles.input}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="e.g. 12 + 8 = ?"
            placeholderTextColor="#B5A98F"
            maxLength={280}
          />
          <Text style={styles.label}>Answer (number)</Text>
          <TextInput
            style={styles.input}
            value={answer}
            onChangeText={setAnswer}
            placeholder="20"
            placeholderTextColor="#B5A98F"
            keyboardType="numeric"
            maxLength={16}
          />
          <Text style={styles.label}>Wrong options (optional)</Text>
          <TextInput
            style={styles.input}
            value={wrongs}
            onChangeText={setWrongs}
            placeholder="18, 21, 28  — leave blank for typed answer"
            placeholderTextColor="#B5A98F"
            maxLength={80}
          />
          <Pressable
            style={({ pressed }) => [styles.saveBtn, (busy || !prompt.trim() || !answer) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
            onPress={save}
            disabled={busy || !prompt.trim() || !answer}
          >
            {busy ? <ActivityIndicator color="#0E3A27" /> : <Text style={styles.saveTxt}>Add to {topic.name}</Text>}
          </Pressable>
          {note ? <Text style={styles.warn}>{note}</Text> : null}

          <Text style={styles.listTitle}>{topic.name} · {shown.length} question{shown.length === 1 ? "" : "s"}</Text>
          {shown.length === 0 ? (
            <Text style={styles.hint}>None yet — students will get generated {topic.name.toLowerCase()} questions until you add some.</Text>
          ) : shown.map(q => (
            <View key={q.id} style={styles.qRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.qPrompt}>{q.prompt}</Text>
                <Text style={styles.qMeta}>L{q.level} · answer {q.answer}{q.options ? " · multiple choice" : ""}</Text>
              </View>
              <Pressable onPress={() => remove(q.id)} hitSlop={8}>
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
