/* ============================================================
   CogniMath — Confetti.js
   Lightweight animated celebration burst (Animated port of the
   web app's #confetti layer).
   ============================================================ */

import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, View } from "react-native";

const { height } = Dimensions.get("window");
const COLORS = ["#FFD166", "#FF6B6B", "#06D6A0", "#4CC9F0", "#C77DFF", "#FF8A3D"];

export default function Confetti({ burst = 0 }) {
  const pieces = useRef([]);
  if (pieces.current.length !== burst) {
    pieces.current = Array.from({ length: burst }, () => ({
      x: Math.random() * 100,
      delay: Math.random() * 500,
      dur: 1800 + Math.random() * 1400,
      rot: Math.random() * 720 - 360,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      anim: new Animated.Value(0),
    }));
  }
  useEffect(() => {
    pieces.current.forEach(p => {
      p.anim.setValue(0);
      Animated.timing(p.anim, {
        toValue: 1, duration: p.dur, delay: p.delay, useNativeDriver: true,
      }).start();
    });
  }, [burst]);

  if (!burst) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.current.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: `${p.x}%`, top: -14,
            width: 9, height: 9, borderRadius: 3, backgroundColor: p.color,
            opacity: p.anim.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 0.8, 0] }),
            transform: [
              { translateY: p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.95] }) },
              { rotate: p.anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.rot}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}
