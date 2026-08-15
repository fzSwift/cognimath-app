/* ============================================================
   CogniMath — BadgesScreen.js
   ============================================================ */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen, Card } from "../components/ui";
import { useApp } from "../AppContext";
import { colStyle, useLayout } from "../layout";
import { C, FONT } from "../theme";
import { BADGES } from "../core/data";

export default function BadgesScreen() {
  const { user, go } = useApp();
  const { badgeCols } = useLayout();
  const u = user;

  return (
    <Screen>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🎖️ Your Badges</Text>
          <Text style={styles.sub}>{u.badges.length}/{BADGES.length} collected</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to home" style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]} onPress={() => go("home")}>
          <Text style={styles.iconBtnTxt}>🏠</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {BADGES.map(b => {
          const got = u.badges.includes(b.id);
          return (
            <View key={b.id} style={[styles.badge, colStyle(badgeCols), got ? styles.badgeGot : styles.badgeLocked]}>
              <Text style={styles.badgeIco}>{got ? b.icon : "🔒"}</Text>
              <Text style={styles.badgeName}>{b.name}</Text>
              <Text style={styles.badgeDesc}>{b.desc}</Text>
              {got ? <Text style={styles.badgeCheck}>✓ Earned</Text> : null}
            </View>
          );
        })}
      </View>

      <Card style={{ flexDirection: "row", gap: 12, backgroundColor: "rgba(124,93,250,0.18)", borderColor: "rgba(199,125,255,0.3)" }}>
        <View style={styles.adaptIco}><Text style={{ fontSize: 22 }}>💡</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.adaptTitle}>How to earn more</Text>
          <Text style={styles.adaptTxt}>Play every day, chase gold stars, and finish whole topics. New badges unlock at the end of a session.</Text>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  title: { fontFamily: FONT.headBold, fontSize: 19, color: C.txt },
  sub: { fontFamily: FONT.body, fontSize: 11.5, color: C.muted },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.14)", borderWidth: 1,
  },
  iconBtnTxt: { fontSize: 17 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 11, marginBottom: 16 },
  badge: {
    alignItems: "center", gap: 6,
    borderRadius: 18, padding: 16,
    backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1,
  },
  badgeGot: {
    backgroundColor: "rgba(124,93,250,0.25)", borderColor: "rgba(199,125,255,0.5)",
  },
  badgeLocked: { opacity: 0.5 },
  badgeIco: { fontSize: 34 },
  badgeName: { fontFamily: FONT.head, fontSize: 13.5, color: C.txt, textAlign: "center" },
  badgeDesc: { fontFamily: FONT.body, fontSize: 11, color: C.muted, textAlign: "center", lineHeight: 15 },
  badgeCheck: { fontFamily: FONT.bodyBold, fontSize: 10.5, color: C.mint },
  adaptIco: {
    width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  adaptTitle: { fontFamily: FONT.head, fontSize: 14.5, color: C.txt },
  adaptTxt: { fontFamily: FONT.body, fontSize: 12.5, color: C.muted, marginTop: 2, lineHeight: 17 },
});
