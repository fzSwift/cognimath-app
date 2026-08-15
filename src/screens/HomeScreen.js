/* ============================================================
   CogniMath — HomeScreen.js (§3.11.2 lesson selection)
   The workbook page: handwritten greeting, ruled stat cards,
   a chalkboard of today's sums, paper topic index cards.
   ============================================================ */

import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen, Pill } from "../components/ui";
import WorkList from "../components/WorkList";
import { useApp } from "../AppContext";
import { colStyle, useLayout } from "../layout";
import { Stamp } from "../components/Motion";
import { C, FONT } from "../theme";
import { BADGES, TOPICS } from "../core/data";
import { levelProgress, topicOverallStars } from "../core/engine";
import { fetchClassAssignments } from "../core/sync";

export default function HomeScreen() {
  const { user, go, play } = useApp();
  const { compact, topicCols } = useLayout();
  const u = user;
  const totalStars = TOPICS.reduce((s, t) => s + topicOverallStars(u, t.id), 0);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
  const [work, setWork] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!u || !u.supabaseId) return;
      const rows = await fetchClassAssignments();
      if (alive) setWork(rows);
    })();
    return () => { alive = false; };
  }, [u?.supabaseId]);

  const classwork = work.filter(a => a.kind === "classwork");
  const homework = work.filter(a => a.kind === "homework");
  const termQuizzes = work.filter(a => a.kind === "term_start" || a.kind === "term_end");

  function startWork(a) {
    const topic = a.kind === "term_start" || a.kind === "term_end" ? "mixed" : a.topic;
    play(topic, a.level, { assignmentId: a.id });
  }

  return (
    <Screen>
      <View style={[styles.head, compact && { flexWrap: "wrap" }]}>
        <Pressable
          onPress={() => go("profile")}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.75 }]}
        >
          <Text style={{ fontSize: 27 }}>{u.avatar}</Text>
          <View style={styles.avatarBadge}><Text style={styles.avatarBadgeTxt}>✎</Text></View>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name}>Hi, {u.name}!</Text>
          <Text style={styles.date}>{today} · time to practise</Text>
        </View>
        <Pill tone="gold">⭐ {u.level}</Pill>
        <Pill tone="pink">🔥 {u.streak}</Pill>
      </View>

      <View style={styles.statStrip}>
        <View style={styles.stat}><Text style={styles.statB}>{u.points.toLocaleString()}</Text><Text style={styles.statS}>points</Text></View>
        <View style={styles.stat}><Text style={styles.statB}>{totalStars}</Text><Text style={styles.statS}>stars</Text></View>
        <View style={styles.stat}><Text style={styles.statB}>{u.badges.length}/{BADGES.length}</Text><Text style={styles.statS}>badges</Text></View>
      </View>

      <Stamp>
      <View style={styles.boardCard} accessibilityLabel="Chalkboard with today's sums">
        <Text style={styles.boardTitle}>Today’s sums</Text>
        <View style={[styles.chalkRow, compact && { flexWrap: "wrap" }]}>
          <View style={styles.chalkSum}>
            <Text style={styles.chalkOp}>➗</Text>
            <Text style={styles.chalkEq}>12 ÷ 3</Text>
          </View>
          <View style={styles.chalkSum}>
            <Text style={styles.chalkOp}>✖️</Text>
            <Text style={styles.chalkEq}>4 × 5</Text>
          </View>
          <View style={styles.chalkSum}>
            <Text style={styles.chalkOp}>➕</Text>
            <Text style={styles.chalkEq}>8 + 7</Text>
          </View>
          <View style={styles.chalkSum}>
            <Text style={styles.chalkOp}>➖</Text>
            <Text style={styles.chalkEq}>9 − 2</Text>
          </View>
        </View>
      </View>
      </Stamp>

      <WorkList title="Term quiz" items={termQuizzes} onPlay={startWork} />
      <WorkList title="Classwork" items={classwork} onPlay={startWork} />
      <WorkList title="Take-home" items={homework} onPlay={startWork} />

      <Text style={styles.section}>Choose a topic</Text>
      <View style={styles.topicGrid}>
        {TOPICS.map((t, i) => {
          const done = Array.from({ length: t.levels }, (_, l) => levelProgress(u, t.id, l + 1).completed).filter(Boolean).length;
          const pct = Math.round((done / t.levels) * 100);
          return (
            <Stamp key={t.id} delay={80 + i * 70} style={colStyle(topicCols)}>
            <Pressable
              onPress={() => go("topic", { topicId: t.id })}
              accessibilityRole="button"
              accessibilityLabel={`${t.name}, ${done} of ${t.levels} levels`}
              style={({ pressed }) => [styles.topicCard, {
                borderTopColor: t.grad[0],
              }, pressed && { transform: [{ scale: 0.97 }] }]}
            >
              <View style={[styles.topicIco, { borderColor: `${t.grad[0]}66` }]}><Text style={{ fontSize: 24 }}>{t.icon}</Text></View>
              <Text style={styles.topicName}>{t.name}</Text>
              <View style={styles.topicBar}>
                <View style={[styles.topicFill, { width: `${pct}%`, backgroundColor: t.grad[0] }]} />
              </View>
              <Text style={styles.topicMeta}>{done}/{t.levels} levels · {topicOverallStars(u, t.id)} ★</Text>
              <View style={[styles.topicPlay, { backgroundColor: t.grad[0] }]}><Text style={styles.topicPlayTxt}>Play ▶</Text></View>
            </Pressable>
            </Stamp>
          );
        })}
      </View>

      <Pressable style={({ pressed }) => [styles.teaser, pressed && { opacity: 0.85 }]} onPress={() => go("leaderboard")}>
        <Text style={{ fontSize: 26 }}>🏆</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.teaserTitle}>Class leaderboard</Text>
          <Text style={styles.teaserTxt}>Your class only — other classes can't see you</Text>
        </View>
        <Text style={{ fontSize: 20, color: C.muted }}>›</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  avatar: {
    width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(240,180,41,0.22)", borderColor: C.gold, borderWidth: 2.5,
  },
  avatarBadge: {
    position: "absolute", right: -4, bottom: -4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: C.margin, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: C.card,
  },
  avatarBadgeTxt: { color: "#FFF", fontSize: 11, fontFamily: FONT.bodyBold, lineHeight: 13 },
  name: { fontFamily: FONT.display, fontSize: 30, color: C.ink, lineHeight: 34, flexShrink: 1 },
  date: { fontFamily: FONT.body, fontSize: 12.5, color: C.muted },
  statStrip: { flexDirection: "row", gap: 10, marginBottom: 14, flexWrap: "wrap" },
  stat: {
    flex: 1, minWidth: 88, alignItems: "center", gap: 1, paddingVertical: 12,
    backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1,
    borderLeftWidth: 3, borderLeftColor: C.margin,
    borderRadius: 14,
    shadowColor: "#33302B", shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  statB: { fontFamily: FONT.headBold, fontSize: 19, color: C.ink },
  statS: { fontFamily: FONT.bodyBold, fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  boardCard: {
    marginBottom: 14,
    backgroundColor: C.board, borderColor: "#C89B5A", borderWidth: 3, borderRadius: 18,
    paddingVertical: 14, paddingHorizontal: 12, transform: [{ rotate: "-0.6deg" }],
    shadowColor: "#33302B", shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  boardTitle: {
    fontFamily: FONT.display, fontSize: 22, color: C.chalk,
    textAlign: "center", marginBottom: 10, lineHeight: 26,
  },
  chalkRow: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  chalkSum: {
    flex: 1, minWidth: 72, alignItems: "center", gap: 4, paddingVertical: 8,
    backgroundColor: C.boardDark, borderRadius: 12,
  },
  chalkOp: { fontSize: 22 },
  chalkEq: { fontFamily: FONT.display, fontSize: 16, color: C.chalk, lineHeight: 20 },
  section: { fontFamily: FONT.display, fontSize: 24, color: C.ink, marginBottom: 10 },
  topicGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 14 },
  topicCard: {
    width: "100%",
    gap: 6, borderRadius: 16, padding: 14,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBrd,
    borderTopWidth: 4, overflow: "hidden",
    shadowColor: "#33302B", shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  topicIco: {
    width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center",
    backgroundColor: "#FBF6E9", borderWidth: 2,
  },
  topicName: { fontFamily: FONT.head, fontSize: 15.5, color: C.ink },
  topicBar: { height: 6, borderRadius: 99, backgroundColor: "rgba(51,48,43,0.12)", overflow: "hidden", width: "100%" },
  topicFill: { height: 6, borderRadius: 99 },
  topicMeta: { fontFamily: FONT.body, fontSize: 11, color: C.muted },
  topicPlay: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  topicPlayTxt: { fontFamily: FONT.bodyBold, fontSize: 12, color: "#2E2413" },
  teaser: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.card, borderColor: C.cardBrd,
    borderWidth: 1, borderLeftWidth: 3, borderLeftColor: C.margin,
    borderRadius: 16, padding: 14,
  },
  teaserTitle: { fontFamily: FONT.head, fontSize: 15, color: C.ink },
  teaserTxt: { fontFamily: FONT.body, fontSize: 12, color: C.muted },
});
