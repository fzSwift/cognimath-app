/* ============================================================
   CogniMath — TopicScreen.js
   Topic detail + progressive lesson locking (§3.11.2)
   ============================================================ */

import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen, Stars } from "../components/ui";
import WorkList from "../components/WorkList";
import { useApp } from "../AppContext";
import { C, FONT } from "../theme";
import { LEVEL_NAMES, POINTS_BY_LEVEL, TOPICS } from "../core/data";
import { isUnlocked, levelProgress } from "../core/engine";
import { fetchClassAssignments } from "../core/sync";

export default function TopicScreen() {
  const { user, params, play, go } = useApp();
  const u = user;
  const topicId = params.topicId;
  const t = TOPICS.find(x => x.id === topicId);
  const [work, setWork] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!u || !u.supabaseId) return;
      const rows = await fetchClassAssignments();
      if (alive) setWork(rows.filter(a => a.topic === topicId));
    })();
    return () => { alive = false; };
  }, [u?.supabaseId, topicId]);

  if (!t) return null;
  const allDone = Array.from({ length: t.levels }, (_, l) => levelProgress(u, t.id, l + 1).completed).every(Boolean);
  const classwork = work.filter(a => a.kind === "classwork");
  const homework = work.filter(a => a.kind === "homework");

  return (
    <Screen>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to home" style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]} onPress={() => go("home")}>
          <Text style={styles.iconBtnTxt}>←</Text>
        </Pressable>
        <View style={[styles.topicIco, { backgroundColor: t.grad[0] }]}><Text style={{ fontSize: 20 }}>{t.icon}</Text></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>{t.name}</Text>
          <Text style={styles.blurb}>{t.blurb}</Text>
        </View>
      </View>

      {allDone ? (
        <View style={styles.mastered}>
          <Text style={styles.masteredTxt}>🎉 Topic mastered! All {t.levels} levels complete.</Text>
        </View>
      ) : null}

      <WorkList title="Classwork" items={classwork} onPlay={a => play(a.topic, a.level, { assignmentId: a.id })} />
      <WorkList title="Take-home" items={homework} onPlay={a => play(a.topic, a.level, { assignmentId: a.id })} />

      <View style={{ gap: 10 }}>
        {Array.from({ length: t.levels }, (_, i) => {
          const lvl = i + 1;
          const locked = !isUnlocked(u, t.id, lvl);
          const prog = levelProgress(u, t.id, lvl);
          return (
            <View key={lvl} style={[styles.levelCard, locked && { opacity: 0.55 }]}>
              <View style={styles.levelLeft}>
                <View style={[styles.levelNum, locked && styles.levelNumLocked]}>
                  <Text style={[styles.levelNumTxt, locked && { color: C.muted }]}>{locked ? "🔒" : lvl}</Text>
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={styles.levelName}>{LEVEL_NAMES[t.id][i]}</Text>
                  <Text style={styles.levelSub}>
                    {prog.completed ? `${prog.accuracy}% best · ${prog.attempts}× played` : `+${POINTS_BY_LEVEL[lvl]} pts per question`}
                  </Text>
                  {prog.completed ? <Stars n={prog.stars} size={13} /> : null}
                </View>
              </View>
              {locked ? (
                <Text style={styles.lockedTag}>Finish level {lvl - 1} to unlock</Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={prog.completed ? `Replay ${LEVEL_NAMES[t.id][i]}` : `Play ${LEVEL_NAMES[t.id][i]}`}
                  style={({ pressed }) => [styles.playBtn, prog.completed && styles.replayBtn, pressed && { opacity: 0.85 }]}
                  onPress={() => play(t.id, lvl)}
                >
                  <Text style={[styles.playTxt, prog.completed && { color: C.txt }]}>{prog.completed ? "Replay" : "Play"}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.14)", borderWidth: 1,
  },
  iconBtnTxt: { fontFamily: FONT.head, fontSize: 17, color: C.txt },
  topicIco: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: FONT.headBold, fontSize: 19, color: C.txt },
  blurb: { fontFamily: FONT.body, fontSize: 11.5, color: C.muted, marginTop: 2 },
  mastered: {
    backgroundColor: "rgba(6,214,160,0.18)", borderColor: "rgba(6,214,160,0.4)",
    borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 14,
  },
  masteredTxt: { fontFamily: FONT.bodyBold, fontSize: 13.5, color: C.mint },
  levelCard: {
    flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap",
    backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1, borderRadius: 18, padding: 13,
  },
  levelLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 180 },
  levelNum: {
    width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center",
    backgroundColor: C.gold, shadowColor: "#ff8a3d", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  levelNumLocked: { backgroundColor: "rgba(255,255,255,0.08)", shadowOpacity: 0 },
  levelNumTxt: { fontFamily: FONT.headBold, fontSize: 19, color: C.darkInk },
  levelName: { fontFamily: FONT.head, fontSize: 14.5, color: C.txt },
  levelSub: { fontFamily: FONT.body, fontSize: 11, color: C.muted },
  lockedTag: { fontFamily: FONT.bodyBold, fontSize: 10.5, color: C.muted, maxWidth: 90, textAlign: "right" },
  playBtn: {
    backgroundColor: C.gold, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 9,
    shadowColor: "#ff8a3d", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  replayBtn: { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)", borderWidth: 1, shadowOpacity: 0 },
  playTxt: { fontFamily: FONT.headBold, fontSize: 14, color: C.darkInk },
});
