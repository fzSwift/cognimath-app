/* ============================================================
   CogniMath — ui.js
   Small shared UI helpers: phone screen wrapper (grid paper),
   star row, pills, and the margin-ruled paper card.
   ============================================================ */

import React from "react";
import { ImageBackground, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stamp } from "./Motion";
import { useLayout } from "../layout";
import { C, FONT, GRID } from "../theme";

/* Full-screen scrollable wrapper on the squared-paper canvas.
   `narrow` keeps login/signup as a workbook cover, not a stretched sheet. */
export function Screen({ children, style, narrow = false }) {
  const { pageMax, pad } = useLayout();
  return (
    <ImageBackground source={{ uri: GRID }} resizeMode="repeat" style={styles.grid}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: pad,
            paddingTop: pad,
            maxWidth: narrow ? Math.min(440, pageMax) : pageMax,
            width: "100%",
            alignSelf: "center",
          },
          style,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  grid: { flex: 1 },
  screen: { flex: 1 },
  content: { paddingBottom: 96 },
});

/* Star row: lit vs dim stars */
export function Stars({ n, size = 18, total = 3, pop = false }) {
  return (
    <View style={{ flexDirection: "row", gap: 3 }}>
      {Array.from({ length: total }, (_, i) => {
        const star = <Text style={{ fontSize: size, color: i < n ? C.gold : "rgba(51,48,43,0.2)" }}>★</Text>;
        return pop && i < n
          ? <Stamp key={i} delay={180 + i * 90}>{star}</Stamp>
          : <View key={i}>{star}</View>;
      })}
    </View>
  );
}

/* Round pill with color variants (sticker feel on paper) */
export function Pill({ children, tone = "default", style }) {
  const tones = {
    default: { bg: C.card, bd: C.cardBrd, tx: C.ink },
    gold: { bg: "rgba(240,180,41,0.16)", bd: "rgba(240,180,41,0.55)", tx: "#9C6B00" },
    pink: { bg: "rgba(217,72,58,0.1)", bd: "rgba(217,72,58,0.45)", tx: C.coral },
    mint: { bg: "rgba(31,157,110,0.12)", bd: "rgba(31,157,110,0.45)", tx: C.mint },
  };
  const t = tones[tone] || tones.default;
  return (
    <View style={[{ backgroundColor: t.bg, borderColor: t.bd, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }, style]}>
      <Text style={{ fontFamily: FONT.head, fontSize: 12.5, color: t.tx }}>{children}</Text>
    </View>
  );
}

/* White paper card with the exercise-book red margin rule */
export function Card({ children, style, margin = true }) {
  return (
    <View style={[{
      backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1,
      borderRadius: 16, padding: 16, marginBottom: 14,
      borderLeftWidth: margin ? 3 : 1,
      borderLeftColor: margin ? C.margin : C.cardBrd,
      ...shadow,
    }, style]}>
      {children}
    </View>
  );
}

const shadow = {
  shadowColor: "#33302B",
  shadowOpacity: 0.08,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};
