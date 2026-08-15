/* ============================================================
   CogniMath — ResetPasswordScreen.js
   Shown when the user lands back in the app from the Supabase
   password-reset email (PASSWORD_RECOVERY session). They set a
   new password here, then get sent back to the login screen.
   ============================================================ */

import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "../components/ui";
import { useApp } from "../AppContext";
import { password as checkPassword } from "../lib/validate";
import { C, FONT } from "../theme";

export default function ResetPasswordScreen() {
  const { resetPasswordWithNew, showToast } = useApp();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    const checked = checkPassword(pw);
    if (!checked.ok) { showToast(checked.error, "✏️"); return; }
    if (pw !== confirm) { showToast("Passwords don't match — check and try again.", "🔒"); return; }
    setBusy(true);
    try {
      await resetPasswordWithNew(checked.value);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen style={{ paddingTop: 60, paddingBottom: 40 }} narrow>
        <View style={styles.hero}>
          <View style={styles.board}>
            <View style={styles.boardInset}>
              <Text style={styles.mascotTxt}>🔑</Text>
            </View>
          </View>
          <Text style={styles.title}>Set a new password</Text>
          <View style={styles.underline} />
          <Text style={styles.sub}>From the reset link in your email — pick a fresh password and you'll sign in with it next time.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.label}>New password</Text>
            <TextInput
              style={styles.input}
              value={pw}
              onChangeText={setPw}
              placeholder="min. 6 characters"
              placeholderTextColor="#B5A98F"
              secureTextEntry
              autoCapitalize="none"
              maxLength={72}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Type it again</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="••••••••"
              placeholderTextColor="#B5A98F"
              secureTextEntry
              autoCapitalize="none"
              maxLength={72}
              onSubmitEditing={save}
            />
          </View>
          <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={save} disabled={busy}>
            {busy ? <ActivityIndicator color={C.darkInk} /> : <Text style={styles.btnTxt}>Save new password ✅</Text>}
          </Pressable>
          <Text style={styles.note}>After saving, you'll sign in again with the new password.</Text>
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
  mascotTxt: { fontSize: 36 },
  title: { fontFamily: FONT.headBold, fontSize: 24, color: C.ink },
  underline: {
    width: 110, height: 3, borderRadius: 2, backgroundColor: C.margin,
    marginTop: 2, marginBottom: 6, transform: [{ rotate: "-1.2deg" }],
  },
  sub: { fontFamily: FONT.body, fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 18, paddingHorizontal: 14 },
  card: {
    backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1,
    borderLeftWidth: 3, borderLeftColor: C.margin,
    borderRadius: 16, padding: 20, gap: 14,
    shadowColor: "#33302B", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  field: { gap: 6 },
  label: { fontFamily: FONT.bodyBold, fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  input: {
    fontFamily: FONT.body, fontSize: 16, color: C.ink,
    backgroundColor: "#FBF6E9", borderColor: C.cardBrd,
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  btn: {
    backgroundColor: C.gold, borderRadius: 14, paddingVertical: 14, alignItems: "center",
    shadowColor: "#F0B429", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4,
    justifyContent: "center", minHeight: 48,
  },
  btnPressed: { opacity: 0.88, transform: [{ scale: 0.97 }] },
  btnTxt: { fontFamily: FONT.headBold, fontSize: 16, color: C.darkInk },
  note: { fontFamily: FONT.body, fontSize: 11.5, color: C.muted, textAlign: "center", lineHeight: 15 },
});
