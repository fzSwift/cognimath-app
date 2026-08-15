/* Workbook motion: rubber-stamp enters, chalk bob, eraser shake.
   Honours the OS reduce-motion setting. */

import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, Text } from "react-native";

function readReduce() {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  } catch (e) { /* private mode */ }
  return false;
}

export function useReduceMotion() {
  const [reduce, setReduce] = useState(readReduce);
  useEffect(() => {
    let alive = true;
    if (AccessibilityInfo.isReduceMotionEnabled) {
      AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setReduce(!!v); });
    }
    const sub = AccessibilityInfo.addEventListener
      ? AccessibilityInfo.addEventListener("reduceMotionChanged", v => setReduce(!!v))
      : null;
    return () => {
      alive = false;
      if (sub && sub.remove) sub.remove();
    };
  }, []);
  return reduce;
}

/* Page piece drops in like a stamp on the exercise book. */
export function Stamp({ children, delay = 0, style }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) { v.setValue(1); return undefined; }
    v.setValue(0);
    const t = Animated.spring(v, {
      toValue: 1, friction: 6, tension: 92, delay, useNativeDriver: true,
    });
    t.start();
    return () => t.stop();
  }, [delay, reduce, v]);
  return (
    <Animated.View style={[style, {
      opacity: v,
      transform: [
        { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1.18, 1] }) },
        { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["-5deg", "0deg"] }) },
      ],
    }]}
    >
      {children}
    </Animated.View>
  );
}

/* Soft rise for lists and toasts. */
export function Rise({ children, delay = 0, style }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) { v.setValue(1); return undefined; }
    v.setValue(0);
    const t = Animated.timing(v, {
      toValue: 1, duration: 360, delay,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    t.start();
    return () => t.stop();
  }, [delay, reduce, v]);
  return (
    <Animated.View style={[style, {
      opacity: v,
      transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
    }]}
    >
      {children}
    </Animated.View>
  );
}

/* Idle chalk bounce for mascots. */
export function Bob({ children, style }) {
  const reduce = useReduceMotion();
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(y, { toValue: -5, duration: 980, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(y, { toValue: 0, duration: 980, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduce, y]);
  return <Animated.View style={[style, { transform: [{ translateY: y }] }]}>{children}</Animated.View>;
}

/* Eraser shake — bump `kick` to fire. */
export function Shake({ kick, children, style }) {
  const x = useRef(new Animated.Value(0)).current;
  const reduce = useReduceMotion();
  useEffect(() => {
    if (!kick || reduce) return undefined;
    x.setValue(0);
    const t = Animated.sequence([
      Animated.timing(x, { toValue: 8, duration: 36, useNativeDriver: true }),
      Animated.timing(x, { toValue: -8, duration: 44, useNativeDriver: true }),
      Animated.timing(x, { toValue: 6, duration: 40, useNativeDriver: true }),
      Animated.timing(x, { toValue: -3, duration: 36, useNativeDriver: true }),
      Animated.timing(x, { toValue: 0, duration: 36, useNativeDriver: true }),
    ]);
    t.start();
    return () => t.stop();
  }, [kick, reduce, x]);
  return <Animated.View style={[style, { transform: [{ translateX: x }] }]}>{children}</Animated.View>;
}

/* Gold tick that stamps onto a correct answer, then lifts off. */
export function TickStamp({ show }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!show || reduce) { v.setValue(0); return undefined; }
    v.setValue(0);
    const t = Animated.sequence([
      Animated.spring(v, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
      Animated.delay(320),
      Animated.timing(v, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]);
    t.start();
    return () => t.stop();
  }, [show, reduce, v]);
  return (
    <Animated.View pointerEvents="none" style={{
      position: "absolute", right: 10, top: 10, zIndex: 2,
      opacity: v,
      transform: [
        { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1.55, 1] }) },
        { rotate: "-10deg" },
      ],
    }}
    >
      <Text style={{ fontSize: 34 }}>✅</Text>
    </Animated.View>
  );
}

export function useCountUp(to, ms = 640) {
  const reduce = useReduceMotion();
  const [n, setN] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) { setN(to); return undefined; }
    const start = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / ms);
      setN(Math.round(to * (1 - (1 - t) * (1 - t))));
      if (t >= 1) clearInterval(id);
    }, 32);
    return () => clearInterval(id);
  }, [to, ms, reduce]);
  return n;
}
