/* ============================================================
   CogniMath — App.js (Expo port)
   Phone-shell shell, state routing, bottom nav, toasts.
   Runs in Expo Go on Android/iOS and on web via react-native-web
   (npx expo start → press w).
   ============================================================ */

import React, { useEffect } from "react";
import { ActivityIndicator, BackHandler, InteractionManager, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import Baloo2_600SemiBold from "./assets/fonts/Baloo2_600SemiBold.ttf";
import Baloo2_700Bold from "./assets/fonts/Baloo2_700Bold.ttf";
import Baloo2_800ExtraBold from "./assets/fonts/Baloo2_800ExtraBold.ttf";
import Nunito_700Bold from "./assets/fonts/Nunito_700Bold.ttf";
import Nunito_800ExtraBold from "./assets/fonts/Nunito_800ExtraBold.ttf";
import PatrickHand_400Regular from "./assets/fonts/PatrickHand_400Regular.ttf";
import { AppProvider, useApp } from "./src/AppContext";
import { useLayout } from "./src/layout";
import { Rise } from "./src/components/Motion";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { confirmLeaveQuiz } from "./src/lib/leaveQuiz";
import { C, FONT } from "./src/theme";

/* require() (not import()) so Hermes can skip unused screens at boot.
   Metro async import() crashes Expo Go — keep these sync. */
const SCREEN_LOADERS = {
  login: () => require("./src/screens/LoginScreen").default,
  signup: () => require("./src/screens/SignupScreen").default,
  reset: () => require("./src/screens/ResetPasswordScreen").default,
  setup: () => require("./src/screens/SetupProfileScreen").default,
  profile: () => require("./src/screens/ProfileScreen").default,
  home: () => require("./src/screens/HomeScreen").default,
  topic: () => require("./src/screens/TopicScreen").default,
  game: () => require("./src/screens/GameScreen").default,
  results: () => require("./src/screens/ResultsScreen").default,
  leaderboard: () => require("./src/screens/LeaderboardScreen").default,
  badges: () => require("./src/screens/BadgesScreen").default,
  teacher: () => require("./src/screens/TeacherScreen").default,
};
const screenCache = Object.create(null);
function loadScreen(name) {
  const key = SCREEN_LOADERS[name] ? name : "login";
  if (!screenCache[key]) screenCache[key] = SCREEN_LOADERS[key]();
  return screenCache[key];
}

const NAV_ITEMS = [
  { nav: "home", icon: "🏠", label: "Home" },
  { nav: "leaderboard", icon: "🏆", label: "Ranks" },
  { nav: "badges", icon: "🎖️", label: "Badges" },
];

const NAV_HIDDEN = new Set(["login", "signup", "reset", "setup", "profile", "teacher", "game", "results"]);

function Shell() {
  const { ready, screen, go, user, toast, session, setSession } = useApp();
  const insets = useSafeAreaInsets();
  const { pageMax, pad, wide, compact } = useLayout();

  useEffect(() => {
    if (!ready) return undefined;
    const next = screen === "login" ? ["signup", "home"]
      : screen === "home" ? ["topic", "game", "leaderboard"]
      : screen === "topic" ? ["game"]
      : [];
    if (!next.length) return undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      next.forEach(loadScreen);
    });
    return () => { if (task && task.cancel) task.cancel(); };
  }, [ready, screen]);

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen === "game") {
        const mixed = session && session.topicId === "mixed";
        const topicId = session && session.topicId;
        confirmLeaveQuiz(() => {
          setSession(null);
          if (mixed || !topicId) go("home");
          else go("topic", { topicId });
        });
        return true;
      }
      if (screen === "results") { go("home"); return true; }
      if (screen === "topic" || screen === "profile" || screen === "badges" || screen === "leaderboard") {
        go("home");
        return true;
      }
      if (screen === "signup" || screen === "reset" || screen === "setup" || screen === "teacher") {
        go("login");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen, session, go, setSession]);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <Text style={{ fontSize: 42 }}>🧮</Text>
        <ActivityIndicator color={C.gold} style={{ marginTop: 14 }} />
      </View>
    );
  }

  const Active = loadScreen(screen);
  const showNav = !NAV_HIDDEN.has(screen) && !!user;
  const navPad = Math.max(10, pad - 4);

  return (
    <View style={styles.desk}>
      <View style={[
        styles.page,
        {
          maxWidth: pageMax,
          paddingTop: insets.top,
          ...(wide && Platform.OS === "web"
            ? { boxShadow: "0 0 0 1px rgba(51,48,43,0.06), 0 18px 50px rgba(51,48,43,0.14)" }
            : null),
        },
      ]}>
        <View style={styles.view}>
          <Active />
        </View>

        {showNav ? (
          <View style={[styles.bottomNav, { left: navPad, right: navPad, bottom: 10 + insets.bottom, paddingVertical: compact ? 6 : 8 }]}>
            {NAV_ITEMS.map(item => (
              <Pressable
                key={item.nav}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: screen === item.nav }}
                style={({ pressed }) => [styles.navBtn, screen === item.nav && styles.navBtnActive, pressed && { opacity: 0.7 }]}
                onPress={() => go(item.nav)}
              >
                <Text style={[styles.navIco, screen === item.nav && styles.navIcoActive]}>{item.icon}</Text>
                <Text style={[styles.navLabel, screen === item.nav && styles.navLabelActive]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {toast ? (
          <Rise key={toast.id} style={[styles.toast, { left: pad, right: pad, bottom: (showNav ? 84 : 24) + insets.bottom }]}>
            <Text style={styles.toastIco}>{toast.icon}</Text>
            <Text style={styles.toastTxt}>{toast.msg}</Text>
          </Rise>
        ) : null}

        <StatusBar style="dark" />
      </View>
    </View>
  );
}

export default function App() {
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      try { require("./src/core/sound").initSound(); } catch (e) { /* audio unavailable */ }
    });
    return () => { if (task && task.cancel) task.cancel(); };
  }, []);
  useFonts({
    Baloo2_600SemiBold, Baloo2_700Bold, Baloo2_800ExtraBold,
    Nunito_700Bold, Nunito_800ExtraBold,
    PatrickHand_400Regular,
  });
  return (
    <SafeAreaProvider>
      <AppProvider>
        <ErrorBoundary>
          <Shell />
        </ErrorBoundary>
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: C.panel,
  },
  desk: {
    flex: 1,
    width: "100%",
    backgroundColor: C.paper,
    alignItems: "center",
    ...(Platform.OS === "web" ? { minHeight: "100dvh" } : null),
  },
  page: {
    flex: 1,
    width: "100%",
    backgroundColor: C.panel,
    overflow: "hidden",
  },
  view: { flex: 1 },
  bottomNav: {
    position: "absolute",
    flexDirection: "row", gap: 6, padding: 8,
    backgroundColor: "rgba(23,18,51,0.92)",
    borderColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderRadius: 24,
    ...(Platform.OS === "web" ? { backdropFilter: "blur(12px)" } : {}),
  },
  navBtn: {
    flex: 1, alignItems: "center", gap: 2, paddingVertical: 7,
    borderRadius: 16,
  },
  navBtnActive: { backgroundColor: "rgba(124,93,250,0.3)" },
  navIco: { fontSize: 19, opacity: 0.85 },
  navIcoActive: { opacity: 1 },
  navLabel: { fontFamily: FONT.body, fontSize: 11, color: C.muted },
  navLabelActive: { color: "#fff" },
  toast: {
    position: "absolute", left: 24, right: 24, bottom: 84,
    alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(23,18,51,0.95)", borderColor: "rgba(255,255,255,0.18)",
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10,
    ...(Platform.OS === "web" ? { backdropFilter: "blur(8px)" } : {}),
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 8 },
  },
  toastIco: { fontSize: 16 },
  toastTxt: { fontFamily: FONT.bodyBold, fontSize: 13, color: C.txt },
});
