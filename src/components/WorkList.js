/* ============================================================
   CogniMath — WorkList.js
   Classwork and take-home cards on the student home / topic page.
   ============================================================ */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C, FONT } from "../theme";
import { TOPICS } from "../core/data";

function dueLabel(dueOn) {
  if (!dueOn) return null;
  const d = new Date(dueOn + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function kindIcon(kind) {
  if (kind === "homework") return "🏠";
  if (kind === "term_start") return "📋";
  if (kind === "term_end") return "🏁";
  return "🏫";
}

export default function WorkList({ title, items, onPlay }) {
  if (!items || !items.length) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>{title}</Text>
      {items.map(a => {
        const t = TOPICS.find(x => x.id === a.topic);
        const due = dueLabel(a.dueOn);
        const topicLabel = a.topic === "mixed" ? "÷ × + −" : (t ? `${t.icon} ${t.name}` : a.topic);
        return (
          <Pressable
            key={a.id}
            onPress={() => !a.done && onPlay(a)}
            style={({ pressed }) => [styles.card, a.done && styles.cardDone, pressed && !a.done && { opacity: 0.85 }]}
          >
            <Text style={styles.ico}>{kindIcon(a.kind)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{a.title}</Text>
              <Text style={styles.meta}>
                {topicLabel} · Level {a.level}
                {due ? ` · due ${due}` : ""}
              </Text>
              {a.note ? <Text style={styles.note}>{a.note}</Text> : null}
            </View>
            <Text style={[styles.cta, a.done && styles.ctaDone]}>{a.done ? "Done ✓" : "Start"}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14, gap: 8 },
  section: { fontFamily: FONT.display, fontSize: 24, color: C.ink, marginBottom: 2 },
  card: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1,
    borderLeftWidth: 3, borderLeftColor: C.margin,
    borderRadius: 16, padding: 12,
  },
  cardDone: { opacity: 0.62, borderLeftColor: C.mint },
  ico: { fontSize: 22 },
  name: { fontFamily: FONT.head, fontSize: 14.5, color: C.ink },
  meta: { fontFamily: FONT.body, fontSize: 11.5, color: C.muted, marginTop: 1 },
  note: { fontFamily: FONT.body, fontSize: 12, color: C.ink, marginTop: 3, lineHeight: 16 },
  cta: { fontFamily: FONT.bodyBold, fontSize: 12, color: C.margin },
  ctaDone: { color: C.mint },
});
