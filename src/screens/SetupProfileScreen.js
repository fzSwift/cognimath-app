/* ============================================================
   CogniMath — SetupProfileScreen.js
   Post-signup onboarding: new cloud accounts pick their display
   name + avatar here, so profiles are never auto-named from the
   email. "Not now" skips with the email-derived name and a
   random avatar — the account still works either way.
   ============================================================ */

import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "../components/ui";
import { useApp } from "../AppContext";
import { AVATAR_POOL } from "../core/data";
import { avatar as checkAvatar, displayName } from "../lib/validate";
import { C, FONT } from "../theme";

export default function SetupProfileScreen() {
  const { completeProfile, showToast } = useApp();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [busy, setBusy] = useState(false);

  async function save(skip) {
    if (busy) return;
    let chosen;
    let face;
    if (!skip) {
      const n = displayName(name);
      if (!n.ok) { showToast(n.error, "✏️"); return; }
      const a = checkAvatar(avatar);
      if (!a.ok) { showToast("Pick an avatar for the leaderboard.", "🐾"); return; }
      chosen = n.value;
      face = a.value;
    }
    setBusy(true);
    try {
      await completeProfile(skip ? undefined : chosen, skip ? undefined : face);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen style={{ paddingTop: 50, paddingBottom: 40 }} narrow>
        <View style={styles.hero}>
          <View style={styles.board}>
            <View style={styles.boardInset}>
              <Text style={styles.mascotTxt}>{avatar || "🎨"}</Text>
            </View>
          </View>
          <Text style={styles.title}>Make it yours!</Text>
          <View style={styles.underline} />
          <Text style={styles.sub}>Your account is ready — pick the name and avatar the class will see.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.label}>Display name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Kojo"
              placeholderTextColor="#B5A98F"
              autoCapitalize="words"
              maxLength={24}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Avatar</Text>
            <View style={styles.avatarGrid}>
              {AVATAR_POOL.map(a => (
                <Pressable
                  key={a}
                  onPress={() => setAvatar(a)}
                  style={({ pressed }) => [
                    styles.avatarCell,
                    avatar === a && styles.avatarCellActive,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.avatarTxt}>{a}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={() => save(false)} disabled={busy}>
            {busy ? <ActivityIndicator color={C.darkInk} /> : <Text style={styles.btnTxt}>Save my profile ✅</Text>}
          </Pressable>
          <Pressable onPress={() => save(true)} disabled={busy} hitSlop={8}>
            <Text style={styles.skip}>Not now — use my email name</Text>
          </Pressable>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", marginBottom: 22, gap: 4 },
  board: {
    width: 96, height: 96, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: C.board, borderWidth: 4, borderColor: "#C89B5A",
    shadowColor: "#33302B", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 5 },
    elevation: 4, marginBottom: 12, transform: [{ rotate: "-2deg" }],
  },
  boardInset: {
    width: 72, height: 72, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: C.boardDark,
  },
  mascotTxt: { fontSize: 34 },
  title: { fontFamily: FONT.headBold, fontSize: 24, color: C.ink },
  underline: {
    width: 110, height: 3, borderRadius: 2, backgroundColor: C.margin,
    marginTop: 2, marginBottom: 6, transform: [{ rotate: "-1.2deg" }],
  },
  sub: { fontFamily: FONT.body, fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 18, paddingHorizontal: 14 },
  card: {
    backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1,
    borderLeftWidth: 3, borderLeftColor: C.margin,
    borderRadius: 16, padding: 20, gap: 16,
    shadowColor: "#33302B", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  field: { gap: 8 },
  label: { fontFamily: FONT.bodyBold, fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  input: {
    fontFamily: FONT.body, fontSize: 16, color: C.ink,
    backgroundColor: "#FBF6E9", borderColor: C.cardBrd,
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  avatarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  avatarCell: {
    width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: "#FBF6E9", borderColor: C.cardBrd, borderWidth: 1.5,
  },
  avatarCellActive: {
    backgroundColor: "rgba(240,180,41,0.25)", borderColor: C.gold, borderWidth: 2,
    transform: [{ scale: 1.06 }],
  },
  avatarTxt: { fontSize: 24 },
  btn: {
    backgroundColor: C.gold, borderRadius: 14, paddingVertical: 14, alignItems: "center",
    shadowColor: "#F0B429", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4,
    justifyContent: "center", minHeight: 48,
  },
  btnPressed: { opacity: 0.88, transform: [{ scale: 0.97 }] },
  btnTxt: { fontFamily: FONT.headBold, fontSize: 16, color: C.darkInk },
  skip: { fontFamily: FONT.body, fontSize: 12, color: C.muted, textAlign: "center", textDecorationLine: "underline" },
});
