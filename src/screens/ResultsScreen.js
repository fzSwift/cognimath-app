/* ============================================================
   CogniMath — ResultsScreen.js (§3.11.4)
   ============================================================ */

import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen, Card, Stars } from "../components/ui";
import { Donut } from "../components/Charts";
import Confetti from "../components/Confetti";
import { useApp } from "../AppContext";
import { C, FONT } from "../theme";
import { BADGES, GENTLE, LEVEL_NAMES, PRAISE, QUESTIONS_PER_SESSION, TOPICS, pick } from "../core/data";
import { playFx } from "../core/sound";
import { Rise, Stamp, useCountUp } from "../components/Motion";

export default function ResultsScreen() {
  const { params, go, play } = useApp();
  const { result, earned = [], isRecord = false } = params;
  const mixed = result.topicId === "mixed";
  const t = TOPICS.find(x => x.id === result.topicId);
  const nextLevel = !mixed && t && result.level < t.levels;
  const unlockedNext = result.completed && nextLevel;
  const pct = Math.round(result.accuracy * 100);
  const msg = pct >= 70 ? pick(PRAISE) : pick(GENTLE);
  const pointsUp = useCountUp(result.points);
  const [burst, setBurst] = useState(result.stars >= 2 ? 28 : 0);
  useEffect(() => {
    if (result.stars >= 2) playFx("win");
    else if (earned.length) playFx("badge");
  }, []);
  useEffect(() => {
    if (!burst) return undefined;
    const t = setTimeout(() => setBurst(0), 3600);
    return () => clearTimeout(t);
  }, [burst]);

  return (
    <Screen style={{ paddingBottom: 40 }}>
      <Confetti burst={burst} />
      <Stamp>
      <View style={styles.hero}>
        <Text style={[styles.title, result.completed && { color: C.gold }]}>
        {result.completed ? (mixed ? "Quiz complete! 🎉" : "Level Complete! 🎉") : "Keep Practicing! 💪"}
        </Text>
        {isRecord ? <View style={styles.record}><Text style={styles.recordTxt}>🏅 New record!</Text></View> : null}
        <View style={{ position: "relative", alignItems: "center", marginTop: 6 }}>
          <Donut percent={result.accuracy} color={pct >= 70 ? C.mint : pct >= 50 ? C.gold : C.coral} />
          <View style={styles.donutLabel}>
            <Text style={styles.donutPct}>{pct}%</Text>
            <Text style={styles.donutCap}>accuracy</Text>
          </View>
        </View>
        <Stars n={result.stars} size={34} pop />
        <Text style={styles.points}><Text style={{ color: C.gold }}>+{pointsUp}</Text> points earned</Text>
      </View>
      </Stamp>

      <Rise delay={120}>
      <View style={styles.statGrid}>
        <View style={styles.stat}><Text style={styles.statB}>{result.firstTryCorrect}/{QUESTIONS_PER_SESSION}</Text><Text style={styles.statS}>first-try correct</Text></View>
        <View style={styles.stat}><Text style={styles.statB}>{result.retries}</Text><Text style={styles.statS}>retries</Text></View>
        <View style={styles.stat}><Text style={styles.statB}>×{result.maxCombo}</Text><Text style={styles.statS}>best combo</Text></View>
        <View style={styles.stat}><Text style={styles.statB}>{result.diff === result.level ? "—" : "L" + result.diff}</Text><Text style={styles.statS}>finish difficulty</Text></View>
      </View>
      </Rise>

      <View style={styles.praise}><Text style={styles.praiseTxt}>{msg}</Text></View>

      {earned.length ? (
        <View style={{ marginBottom: 14 }}>
          <Text style={styles.badgeTitle}>New badge{earned.length > 1 ? "s" : ""} unlocked!</Text>
          {earned.map(id => {
            const b = BADGES.find(x => x.id === id);
            return (
              <View key={id} style={styles.badgeRow}>
                <Text style={{ fontSize: 26 }}>{b.icon}</Text>
                <View>
                  <Text style={styles.badgeName}>{b.name}</Text>
                  <Text style={styles.badgeDesc}>{b.desc}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        {mixed ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel="Play this level again" style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.85 }]} onPress={() => play(result.topicId, result.level)}>
            <Text style={styles.btnGhostTxt}>↻ Play again</Text>
          </Pressable>
        )}
        {unlockedNext ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Next: ${LEVEL_NAMES[t.id][result.level]}`} style={({ pressed }) => [styles.btnGold, pressed && { opacity: 0.9 }]} onPress={() => play(result.topicId, result.level + 1)}>
            <Text style={styles.btnGoldTxt}>Next: {LEVEL_NAMES[t.id][result.level]} ➜</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Back to home" style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.85 }]} onPress={() => go("home")}>
          <Text style={styles.btnGhostTxt}>🏠 Home</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center", gap: 12, paddingVertical: 26,
    backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1, borderRadius: 26,
    marginBottom: 14,
  },
  title: { fontFamily: FONT.headBold, fontSize: 26, color: C.txt, textAlign: "center", paddingHorizontal: 8 },
  record: {
    backgroundColor: "rgba(255,209,102,0.14)", borderColor: "rgba(255,209,102,0.4)",
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  recordTxt: { fontFamily: FONT.bodyBold, fontSize: 11, color: C.gold },
  donutLabel: { position: "absolute", alignItems: "center", justifyContent: "center", top: 0, bottom: 0 },
  donutPct: { fontFamily: FONT.headBold, fontSize: 34, color: C.txt },
  donutCap: { fontFamily: FONT.bodyBold, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 },
  points: { fontFamily: FONT.head, fontSize: 16, color: C.txt },
  statGrid: { flexDirection: "row", gap: 9, marginBottom: 14, flexWrap: "wrap" },
  stat: { flex: 1, minWidth: 72, alignItems: "center", gap: 1, paddingVertical: 12, backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1, borderRadius: 16 },
  statB: { fontFamily: FONT.headBold, fontSize: 15, color: C.txt },
  statS: { fontFamily: FONT.bodyBold, fontSize: 9, color: C.muted, textTransform: "uppercase", textAlign: "center", letterSpacing: 0.4 },
  praise: {
    backgroundColor: "rgba(76,201,240,0.12)", borderColor: "rgba(76,201,240,0.3)",
    borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14,
  },
  praiseTxt: { fontFamily: FONT.body, fontSize: 13.5, color: C.txt, textAlign: "center", lineHeight: 20 },
  badgeTitle: { fontFamily: FONT.head, fontSize: 15, color: C.txt, marginBottom: 10 },
  badgeRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(255,209,102,0.14)", borderColor: "rgba(255,209,102,0.4)",
    borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 9,
  },
  badgeName: { fontFamily: FONT.head, fontSize: 13.5, color: C.txt },
  badgeDesc: { fontFamily: FONT.body, fontSize: 11, color: C.muted },
  btnGhost: {
    borderRadius: 16, paddingVertical: 13, alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)", borderWidth: 1,
  },
  btnGhostTxt: { fontFamily: FONT.headBold, fontSize: 16, color: C.txt },
  btnGold: { borderRadius: 16, paddingVertical: 13, alignItems: "center", backgroundColor: C.gold },
  btnGoldTxt: { fontFamily: FONT.headBold, fontSize: 16, color: C.darkInk },
});
