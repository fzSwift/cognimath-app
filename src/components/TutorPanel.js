/* ============================================================
   CogniMath — TutorPanel.js
   The AI tutor's step-by-step worked solution, with a staggered
   fade-in per step (Animated port of the web app's tutor panel).
   ============================================================ */

import React, { useEffect, useRef } from "react";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import { C, FONT } from "../theme";
import { tutorSteps } from "../core/tutor";

export default function TutorPanel({ question }) {
  const steps = tutorSteps(question);
  const panelOpacity = useRef(new Animated.Value(0)).current;
  const stepAnims = useRef(steps.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.timing(panelOpacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    stepAnims.forEach((a, i) => {
      Animated.timing(a, {
        toValue: 1, duration: 400, delay: i * 90, useNativeDriver: true,
      }).start();
    });
  }, []);

  return (
    <Animated.View style={[styles.panel, { opacity: panelOpacity }]}>
      <View style={styles.head}>
        <Text style={styles.headIco}>🧠</Text>
        <Text style={styles.headTxt}>How to solve it</Text>
      </View>
      <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
        {steps.map((s, i) => (
          <Animated.View key={i} style={[styles.step, {
            opacity: stepAnims[i],
            transform: [{ translateX: stepAnims[i].interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
          }]}>
            <View style={styles.num}><Text style={styles.numTxt}>{i + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.body}>{s.t}</Text>
              {s.f ? <Text style={styles.formula}>{s.f}</Text> : null}
            </View>
          </Animated.View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 12,
    backgroundColor: "rgba(124, 93, 250, 0.16)",
    borderColor: "rgba(199, 125, 255, 0.38)",
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  headIco: { fontSize: 17 },
  headTxt: { fontFamily: FONT.head, fontSize: 15, color: C.txt },
  step: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 9 },
  num: {
    width: 23, height: 23, borderRadius: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: C.gold,
  },
  numTxt: { fontFamily: FONT.headBold, fontSize: 12, color: C.darkInk },
  body: { fontFamily: FONT.body, fontSize: 13, color: "#e8e3ff", lineHeight: 19 },
  formula: {
    marginTop: 4, alignSelf: "flex-start",
    fontFamily: FONT.head, fontSize: 14.5, color: C.gold,
    backgroundColor: "rgba(255, 209, 102, 0.1)",
    borderColor: "rgba(255, 209, 102, 0.35)",
    borderWidth: 1, borderStyle: "dashed",
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
  },
});
