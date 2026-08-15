/* ============================================================
   CogniMath — LoginScreen.js (§3.11.1)
   Workbook cover: chalkboard mascot, email sign-in, link out to
   the dedicated signup page.
   ============================================================ */

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, InteractionManager, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "../components/ui";
import CaptchaBox, { botProtectionOn } from "../components/CaptchaBox";
import { useApp } from "../AppContext";
import { email as checkEmail, password as checkPassword } from "../lib/validate";
import Mascot from "../components/Mascot";
import { Bob, Rise } from "../components/Motion";
import { C, FONT } from "../theme";

export default function LoginScreen() {
  const { supabaseAuth, sendResetEmail, go, showToast } = useApp();
  const toastRef = useRef(showToast);
  toastRef.current = showToast;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const [trap, setTrap] = useState("");
  /* checking | ready | not-configured | schema-missing | error */
  const [cloudHealth, setCloudHealth] = useState("checking");

  const passRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const task = InteractionManager.runAfterInteractions(() => {
      const { checkCloudHealth } = require("../core/sync");
      checkCloudHealth().then(h => {
        if (!alive) return;
        setCloudHealth(h.reason === "not-configured" ? "not-configured"
          : h.reason === "schema-missing" ? "schema-missing"
          : h.ready ? "ready"
          : "error");
      });
    });
    return () => { alive = false; if (task && task.cancel) task.cancel(); };
  }, []);

  async function signIn() {
    if (busy) return;
    const addr = checkEmail(email);
    if (!addr.ok) { showToast(addr.error, "✏️"); return; }
    const pw = checkPassword(password, { min: 1 });
    if (!pw.ok) { showToast(pw.error, "✏️"); return; }
    if (trap) return;
    if (botProtectionOn() && !captcha) { showToast("Tick the check so we know you're a person.", "🛡️"); return; }
    setBusy(true);
    try {
      await supabaseAuth(addr.value, pw.value, "signin", undefined, captcha);
      setCaptcha("");
      setCaptchaReset(n => n + 1);
    } catch (e) {
      toastRef.current(e && e.message ? e.message : "Sign-in failed — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (busy) return;
    const addr = checkEmail(email);
    if (!addr.ok) { showToast(addr.error, "📧"); return; }
    if (trap) return;
    if (botProtectionOn() && !captcha) { showToast("Tick the check so we know you're a person.", "🛡️"); return; }
    setBusy(true);
    try {
      await sendResetEmail(addr.value, captcha);
      setCaptcha("");
      setCaptchaReset(n => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen style={{ paddingBottom: 40 }} narrow>
        <View style={styles.hero}>
          <Bob>
          <View style={styles.board}>
            <View style={styles.boardInset}>
              <Mascot size={64} />
            </View>
          </View>
          </Bob>
          <Text style={styles.brand}>Cogni<Text style={styles.brandAccent}>Math</Text></Text>
          <View style={styles.underline} />
          <Text style={styles.tagline}>Your maths exercise book — come alive.</Text>
        </View>

        <Rise delay={80}>
        <View style={[styles.card, { borderLeftColor: cloudHealth === "ready" ? C.mint : cloudHealth === "schema-missing" || cloudHealth === "error" ? C.coral : C.margin }]}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Sign in</Text>
            {cloudHealth === "ready" && <Text style={styles.badgeOk}>● connected</Text>}
            {cloudHealth === "checking" && <Text style={styles.badgeOff}>… checking</Text>}
            {cloudHealth === "not-configured" && <Text style={styles.badgeOff}>○ offline</Text>}
            {cloudHealth === "schema-missing" && <Text style={styles.badgeWarn}>⚠ tables not set up</Text>}
            {cloudHealth === "error" && <Text style={styles.badgeWarn}>⚠ cloud error</Text>}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@school.com"
              placeholderTextColor="#B5A98F"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              accessibilityLabel="Email"
              maxLength={254}
              returnKeyType="next"
              onSubmitEditing={() => passRef.current && passRef.current.focus()}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrap}>
              <TextInput
                ref={passRef}
                style={styles.inputInWrap}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#B5A98F"
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoComplete="password"
                textContentType="password"
                accessibilityLabel="Password"
                maxLength={72}
                returnKeyType="done"
                onSubmitEditing={signIn}
              />
              <Pressable onPress={() => setShowPw(v => !v)} hitSlop={8} style={styles.showBtn} accessibilityRole="button" accessibilityLabel={showPw ? "Hide password" : "Show password"}>
                <Text style={styles.showTxt}>{showPw ? "Hide" : "Show"}</Text>
              </Pressable>
            </View>
            <Pressable onPress={forgot} hitSlop={8} accessibilityRole="button" accessibilityLabel="Forgot password">
              <Text style={styles.forgot}>Forgot password?</Text>
            </Pressable>
          </View>

          <TextInput
            value={trap}
            onChangeText={setTrap}
            style={styles.trap}
            autoComplete="off"
            importantForAutofill="no"
            accessibilityElementsHidden
          />
          <CaptchaBox onToken={setCaptcha} resetKey={captchaReset} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            style={({ pressed }) => [styles.btn, busy && styles.btnOff, pressed && !busy && styles.btnPressed]}
            onPress={signIn}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color={C.darkInk} /> : <Text style={styles.btnTxt}>Sign in</Text>}
          </Pressable>

          {cloudHealth === "schema-missing" ? (
            <Text style={[styles.note, { color: C.coral }]}>Cloud tables aren't set up yet — run supabase/schema.sql in the SQL Editor.</Text>
          ) : cloudHealth === "not-configured" ? (
            <Text style={styles.note}>Cloud isn't configured yet.</Text>
          ) : cloudHealth === "error" ? (
            <Text style={[styles.note, { color: C.coral }]}>Couldn't reach the cloud — check your connection.</Text>
          ) : null}
        </View>
        </Rise>

        <Pressable onPress={() => go("signup", { email: email.trim() })} hitSlop={8} style={styles.switchRow} accessibilityRole="button" accessibilityLabel="Create an account">
          <Text style={styles.switchTxt}>New here? <Text style={styles.switchLink}>Create an account</Text></Text>
        </Pressable>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingTop: 26, marginBottom: 20, gap: 4 },
  board: {
    width: 118, height: 118, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: C.board, borderWidth: 4, borderColor: "#C89B5A",
    shadowColor: "#33302B", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 5 },
    elevation: 4, marginBottom: 12, transform: [{ rotate: "-2deg" }],
  },
  boardInset: {
    width: 88, height: 88, borderRadius: 14, alignItems: "center", justifyContent: "center",
    backgroundColor: C.boardDark,
  },
  brand: { fontFamily: FONT.display, fontSize: 48, color: C.ink, letterSpacing: 0.5 },
  brandAccent: { color: C.margin },
  underline: {
    width: 150, height: 3, borderRadius: 2, backgroundColor: C.margin,
    marginTop: 2, marginBottom: 4, transform: [{ rotate: "-1.2deg" }],
  },
  tagline: { fontFamily: FONT.body, fontSize: 14.5, color: C.muted },
  card: {
    backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1,
    borderLeftWidth: 3, borderLeftColor: C.margin,
    borderRadius: 16, padding: 20, gap: 14,
    shadowColor: "#33302B", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontFamily: FONT.head, fontSize: 16, color: C.ink },
  field: { gap: 6 },
  label: { fontFamily: FONT.bodyBold, fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  input: {
    fontFamily: FONT.body, fontSize: 16, color: C.ink,
    backgroundColor: "#FBF6E9", borderColor: C.cardBrd,
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#FBF6E9", borderColor: C.cardBrd,
    borderWidth: 1.5, borderRadius: 12, paddingRight: 10,
  },
  inputInWrap: {
    flex: 1, fontFamily: FONT.body, fontSize: 16, color: C.ink,
    paddingHorizontal: 14, paddingVertical: 12,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  },
  showBtn: { paddingHorizontal: 6, paddingVertical: 8 },
  showTxt: { fontFamily: FONT.bodyBold, fontSize: 12, color: C.margin },
  forgot: { fontFamily: FONT.bodyBold, fontSize: 12, color: C.margin, textAlign: "right", paddingTop: 2 },
  btn: {
    backgroundColor: C.gold, borderRadius: 14, paddingVertical: 14, alignItems: "center",
    shadowColor: "#F0B429", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4,
    justifyContent: "center", minHeight: 48,
  },
  btnOff: { opacity: 0.7 },
  btnPressed: { opacity: 0.88, transform: [{ scale: 0.97 }] },
  btnTxt: { fontFamily: FONT.headBold, fontSize: 16.5, color: C.darkInk },
  note: { fontFamily: FONT.body, fontSize: 11.5, color: C.muted, textAlign: "center", lineHeight: 16 },
  badgeOk: { fontFamily: FONT.bodyBold, fontSize: 11, color: C.mint },
  badgeOff: { fontFamily: FONT.bodyBold, fontSize: 11, color: C.muted },
  badgeWarn: { fontFamily: FONT.bodyBold, fontSize: 11, color: C.coral },
  switchRow: { alignItems: "center", marginTop: 16, paddingVertical: 6 },
  switchTxt: { fontFamily: FONT.body, fontSize: 14, color: C.muted },
  switchLink: { fontFamily: FONT.bodyBold, color: C.margin },
  trap: { position: "absolute", left: -9999, height: 1, width: 1, opacity: 0 },
});
