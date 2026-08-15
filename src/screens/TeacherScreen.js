/* ============================================================
   CogniMath — TeacherScreen.js
   Live class + posted work, then the 4-week pilot study report.
   ============================================================ */

import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Screen } from "../components/ui";
import { Bars, Legend, Lines, Scatter } from "../components/Charts";
import LiveClassCard from "../components/LiveClassCard";
import QuestionsCard from "../components/QuestionsCard";
import AssignmentsCard from "../components/AssignmentsCard";
import TermQuizzesCard from "../components/TermQuizzesCard";
import StruggleCard from "../components/StruggleCard";
import { useApp } from "../AppContext";
import { C, FONT } from "../theme";
import { CLASS_STATS, MOCK_STUDENTS } from "../core/data";

export default function TeacherScreen() {
  const { logout } = useApp();
  const cs = CLASS_STATS;
  const rows = MOCK_STUDENTS.map(m => ({ ...m, imp: m.post - m.pre }));
  const avgImp = Math.round(rows.reduce((s, r) => s + r.imp, 0) / rows.length);

  return (
    <Screen>
      <View style={styles.head}>
        <Pressable style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]} onPress={logout}>
          <Text style={styles.iconBtnTxt}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>👩‍🏫 Teacher Dashboard</Text>
          <Text style={styles.sub}>Live class, then the 4-week study sample</Text>
        </View>
      </View>

      <LiveClassCard />

      <QuestionsCard />

      <AssignmentsCard />

      <TermQuizzesCard />

      <View style={styles.studyHero}>
        <Text style={styles.studyKicker}>Class study · {cs.grades} · {cs.weeks} weeks · {cs.n} students</Text>
        <View style={styles.studyMark}>
          <Text style={styles.studyGain}>+{Math.round(cs.posttest - cs.pretest)}<Text style={styles.studyGainUnit}> points</Text></Text>
          <Text style={styles.studyFromTo}>{cs.pretest}% to {cs.posttest}%</Text>
        </View>
        <Text style={styles.studyLead}>Average score after short daily quizzes. These figures are the study sample — not this week’s live class.</Text>
        <View style={styles.kpiGrid}>
          <View style={styles.kpi}><Text style={styles.kpiB}>{cs.engagement.values[0]}</Text><Text style={styles.kpiS}>Mins / session</Text></View>
          <View style={styles.kpi}><Text style={styles.kpiB}>{cs.engagement.values[1]}</Text><Text style={styles.kpiS}>Problems each time</Text></View>
          <View style={styles.kpi}><Text style={styles.kpiB}>{cs.engagement.values[2]}</Text><Text style={styles.kpiS}>Sessions / week</Text></View>
          <View style={styles.kpi}><Text style={styles.kpiB}>{cs.engagement.values[3]}</Text><Text style={styles.kpiS}>Levels in {cs.weeks} weeks</Text></View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Where they stumbled</Text>
        <Text style={[styles.note, { marginTop: 0 }]}>Share of missed answers among the five named sample students. Division needed the most extra teaching.</Text>
        {cs.topics.map(t => (
          <View key={t.id} style={styles.topicRow}>
            <Text style={styles.topicName}>{t.icon} {t.name}</Text>
            <View style={styles.track}>
              {t.miss == null ? (
                <View style={styles.trackEmpty} />
              ) : (
                <View style={[styles.trackFill, {
                  width: `${t.miss}%`,
                  backgroundColor: t.miss >= 38 ? C.coral : t.miss >= 30 ? C.gold : C.mint,
                }]} />
              )}
            </View>
            <Text style={styles.topicPct}>{t.miss == null ? "—" : `${t.miss}%`}</Text>
          </View>
        ))}
        <Text style={styles.note}>Subtraction had too few recorded misses in the sample to rank.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Before and after, by class</Text>
        <Lines
          labels={cs.classes.labels}
          series={[
            { name: "Before", color: C.orange, values: cs.classes.pre },
            { name: "After", color: C.mint, values: cs.classes.post },
          ]}
        />
        <Legend items={[{ name: "Before", color: C.orange }, { name: "After", color: C.mint }]} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>How they practised</Text>
        <Bars
          labels={cs.engagement.labels}
          values={cs.engagement.values}
          colors={[C.gold, C.coral, C.sky, C.mint]}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Accuracy vs practice</Text>
        <Scatter
          points={rows.map(r => ({ x: r.problems, y: r.accuracy, label: r.name }))}
          xLabel="Problems tried"
          yLabel="Accuracy %"
        />
        <Text style={styles.note}>Each dot is one student in the sample. More practice lined up with higher accuracy.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pilot register <Text style={styles.sub2}>study sample</Text></Text>
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
          <View style={{ minWidth: 520, flex: 1 }}>
        <View style={[styles.stuRow, styles.stuHead]}>
          {["Student", "Pre", "Post", "Δ", "Acc", "Lvl"].map(h => (
            <Text key={h} style={styles.stuHeadTxt}>{h}</Text>
          ))}
        </View>
        {rows.map(r => (
          <View key={r.id} style={[styles.stuRow, r.imp < avgImp && styles.stuWarn]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flex: 1.6 }}>
              <Text style={{ fontSize: 16 }}>{r.avatar}</Text>
              <Text style={styles.stuName} numberOfLines={1}>{r.name}</Text>
            </View>
            <Text style={styles.stuCell}>{r.pre}%</Text>
            <Text style={[styles.stuCell, { color: C.mint }]}>{r.post}%</Text>
            <Text style={[styles.stuCell, r.imp >= avgImp && { color: C.mint }]}>+{r.imp}</Text>
            <Text style={styles.stuCell}>{r.accuracy}%</Text>
            <Text style={styles.stuCell}>{r.levels}</Text>
          </View>
        ))}
          </View>
        </ScrollView>
        <Text style={styles.note}>⚠ Highlighted students improved less than the class average (+{avgImp}%) — flag for extra support.</Text>
      </View>

      <StruggleCard />

      <Pressable style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.85 }]} onPress={logout}>
        <Text style={styles.btnGhostTxt}>← Back</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.14)", borderWidth: 1,
  },
  iconBtnTxt: { fontFamily: FONT.head, fontSize: 17, color: C.txt },
  title: { fontFamily: FONT.headBold, fontSize: 19, color: C.txt },
  sub: { fontFamily: FONT.body, fontSize: 11.5, color: C.muted },
  studyHero: {
    backgroundColor: C.board, borderRadius: 16, padding: 16, marginBottom: 14,
  },
  studyKicker: { fontFamily: FONT.bodyBold, fontSize: 10, color: C.gold, letterSpacing: 1.2, textTransform: "uppercase" },
  studyMark: { flexDirection: "row", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginTop: 4 },
  studyGain: { fontFamily: FONT.display, fontSize: 42, color: C.gold, lineHeight: 46 },
  studyGainUnit: { fontFamily: FONT.display, fontSize: 20, color: C.chalk },
  studyFromTo: { fontFamily: FONT.display, fontSize: 20, color: C.chalk },
  studyLead: { fontFamily: FONT.body, fontSize: 13, color: C.chalk, opacity: 0.82, lineHeight: 18, marginTop: 6 },
  sub2: { fontSize: 10.5, color: C.muted, fontFamily: FONT.bodyBold },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, marginBottom: 0 },
  kpi: {
    width: "47%", flexGrow: 1, alignItems: "center", gap: 1, paddingVertical: 10,
    backgroundColor: "rgba(251,244,227,0.08)", borderColor: "rgba(251,244,227,0.16)", borderWidth: 1, borderRadius: 12,
  },
  kpiB: { fontFamily: FONT.headBold, fontSize: 20, color: C.chalk },
  kpiS: { fontFamily: FONT.bodyBold, fontSize: 9, color: C.chalk, opacity: 0.65, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" },
  topicRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  topicName: { fontFamily: FONT.head, fontSize: 13, color: C.txt, flexBasis: 96, flexGrow: 0, flexShrink: 1, minWidth: 72 },
  topicPct: { fontFamily: FONT.headBold, fontSize: 13, color: C.txt, width: 36, textAlign: "right" },
  track: { flex: 1, height: 10, borderRadius: 999, backgroundColor: C.tile, borderColor: C.tileBrd, borderWidth: 1, overflow: "hidden" },
  trackFill: { height: "100%", borderRadius: 999 },
  trackEmpty: { flex: 1, height: "100%", backgroundColor: "rgba(138,127,106,0.18)" },
  card: {
    backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1,
    borderRadius: 20, padding: 16, marginBottom: 14,
  },
  cardTitle: { fontFamily: FONT.head, fontSize: 15.5, color: C.txt, marginBottom: 12 },
  stuRow: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.03)", marginBottom: 5,
    minWidth: 480,
  },
  stuHead: { backgroundColor: "transparent" },
  stuHeadTxt: {
    flex: 1, fontFamily: FONT.bodyBold, fontSize: 9, color: C.muted,
    textTransform: "uppercase", textAlign: "center",
  },
  stuWarn: { backgroundColor: "rgba(255,107,107,0.1)", borderLeftWidth: 3, borderLeftColor: C.coral },
  stuName: { fontFamily: FONT.body, fontSize: 12, color: C.txt, flexShrink: 1 },
  stuCell: { flex: 1, fontFamily: FONT.body, fontSize: 12, color: C.txt, textAlign: "center" },
  note: { fontFamily: FONT.body, fontSize: 11.5, color: C.muted, lineHeight: 16, marginTop: 10 },
  btnGhost: {
    borderRadius: 16, paddingVertical: 13, alignItems: "center", marginBottom: 20,
    backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)", borderWidth: 1,
  },
  btnGhostTxt: { fontFamily: FONT.headBold, fontSize: 15, color: C.txt },
});
