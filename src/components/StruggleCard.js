/* ============================================================
   CogniMath — StruggleCard.js
   "Concepts students struggle with" — the AI tutor's findings,
   ranked by misses with live tags for real students' struggles.
   ============================================================ */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { C, FONT } from "../theme";
import { conceptLabel } from "../core/tutor";
import { struggleRows } from "../core/dashboard";

export default function StruggleCard() {
  const rows = struggleRows();
  if (!rows.length) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>🧠 Concepts students struggle with</Text>
        <Text style={styles.note}>No struggle data yet — as students answer, the AI tutor tracks which concepts they miss and flags them here.</Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <Text style={styles.title}>🧠 Concepts students struggle with</Text>
      {rows.map(r => {
        const pct = Math.round(r.rate * 100);
        const cls = pct >= 40 ? "hot" : pct >= 25 ? "warm" : "cool";
        const barColor = cls === "hot" ? C.coral : cls === "warm" ? C.gold : C.mint;
        const pillBg = cls === "hot" ? "rgba(255,107,107,0.16)" : cls === "warm" ? "rgba(255,209,102,0.14)" : "rgba(6,214,160,0.14)";
        const pillBd = cls === "hot" ? "rgba(255,107,107,0.45)" : cls === "warm" ? "rgba(255,209,102,0.4)" : "rgba(6,214,160,0.4)";
        const pillTx = cls === "hot" ? C.coral : cls === "warm" ? C.gold : C.mint;
        return (
          <View key={r.key} style={styles.row}>
            <View style={styles.top}>
              <Text style={styles.label} numberOfLines={2}>{conceptLabel(r.key)}</Text>
              <View style={styles.tags}>
                {r.live ? <View style={styles.live}><Text style={styles.liveTxt}>● live</Text></View> : null}
                <View style={[styles.pill, { backgroundColor: pillBg, borderColor: pillBd }]}>
                  <Text style={[styles.pillTxt, { color: pillTx }]}>{pct}% wrong</Text>
                </View>
              </View>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.max(6, pct)}%`, backgroundColor: barColor }]} />
            </View>
            <View style={styles.meta}>
              <Text style={styles.metaTxt}>{r.attempts} tries · {r.wrongFinal} missed{r.timeouts ? ` · ${r.timeouts} timeouts` : ""}</Text>
              {r.students.length ? <Text style={styles.students} numberOfLines={1}>{r.students.join(", ")}</Text> : null}
            </View>
          </View>
        );
      })}
      <Text style={styles.note}>💡 Prioritize these concepts in your next lesson — flagged students (right) need the most support.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  title: { fontFamily: FONT.head, fontSize: 15.5, color: C.txt, marginBottom: 12 },
  row: { marginBottom: 13 },
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 },
  label: { flex: 1, fontFamily: FONT.head, fontSize: 13, color: C.txt, lineHeight: 17 },
  tags: { flexDirection: "row", alignItems: "center", gap: 6 },
  live: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: "rgba(6,214,160,0.14)", borderColor: "rgba(6,214,160,0.45)", borderWidth: 1,
  },
  liveTxt: { fontFamily: FONT.bodyBold, fontSize: 10, color: C.mint },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  pillTxt: { fontFamily: FONT.bodyBold, fontSize: 11 },
  barTrack: { height: 8, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  barFill: { height: 8, borderRadius: 99 },
  meta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 6 },
  metaTxt: { fontFamily: FONT.body, fontSize: 11, color: C.muted },
  students: { fontFamily: FONT.body, fontSize: 11, color: C.sky, maxWidth: "55%" },
  note: { fontFamily: FONT.body, fontSize: 11.5, color: C.muted, lineHeight: 16, marginTop: 8 },
});
