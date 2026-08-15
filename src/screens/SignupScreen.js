/* ============================================================
   CogniMath — SignupScreen.js
   Dedicated create-account page. After a successful sign-up the
   existing setup screen collects name + avatar (never auto-named
   from the email).
   ============================================================ */

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, InteractionManager, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "../components/ui";
import CaptchaBox, { botProtectionOn } from "../components/CaptchaBox";
import { useApp } from "../AppContext";
import { email as checkEmail, password as checkPassword } from "../lib/validate";
import { Bob } from "../components/Motion";
import { C, FONT } from "../theme";

export default function SignupScreen() {
  const { supabaseAuth, go, params, showToast } = useApp();
  const toastRef = useRef(showToast);
  toastRef.current = showToast;

  const [email, setEmail] = useState((params && params.email) || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const [trap, setTrap] = useState("");
  const [cloudHealth, setCloudHealth] = useState("checking");

  const passRef = useRef(null);
  const confirmRef = useRef(null);

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

  const blocked = cloudHealth === "not-configured" || cloudHealth === "schema-missing";

  async function submit() {
    if (busy || blocked) return;
    const addr = checkEmail(email);
    if (!addr.ok) { showToast(addr.error, "✏️"); return; }
    const pw = checkPassword(password);
    if (!pw.ok) { showToast(pw.error, "✏️"); return; }
    if (password !== confirm) { showToast("Passwords don't match — check and try again.", "🔒"); return; }
    if (trap) return;
    if (botProtectionOn() && !captcha) { showToast("Tick the check so we know you're a person.", "🛡️"); return; }
    setBusy(true);
    try {
      await supabaseAuth(addr.value, pw.value, "signup", undefined, captcha);
      setCaptcha("");
      setCaptchaReset(n => n + 1);
    } catch (e) {
      toastRef.current(e && e.message ? e.message : "Couldn't create the account — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen style={{ paddingTop: 36, paddingBottom: 40 }} narrow>
        <View style={styles.hero}>
          <Bob>
          <View style={styles.board}>
            <View style={styles.boardInset}>
              <Text style={styles.mascotTxt}>📘</Text>
            </View>
          </View>
          </Bob>
          <Text style={styles.title}>Start a new book</Text>
          <View style={styles.underline} />
          <Text style={styles.sub}>Create an account so your stars travel with you — you'll pick a name and avatar next.</Text>
        </View>

        <View style={[styles.card, { borderLeftColor: cloudHealth === "ready" ? C.mint : cloudHealth === "schema-missing" || cloudHealth === "error" ? C.coral : C.margin }]}>
          <HealthLine status={cloudHealth} />

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
                placeholder="min. 6 characters"
                placeholderTextColor="#B5A98F"
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                accessibilityLabel="Password"
                maxLength={72}
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current && confirmRef.current.focus()}
              />
              <Pressable onPress={() => setShowPw(v => !v)} hitSlop={8} style={styles.showBtn} accessibilityRole="button" accessibilityLabel={showPw ? "Hide password" : "Show password"}>
                <Text style={styles.showTxt}>{showPw ? "Hide" : "Show"}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Type it again</Text>
            <TextInput
              ref={confirmRef}
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="••••••••"
              placeholderTextColor="#B5A98F"
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              accessibilityLabel="Confirm password"
              maxLength={72}
              returnKeyType="done"
              onSubmitEditing={submit}
            />
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
            accessibilityLabel="Create my account"
            style={({ pressed }) => [styles.btn, (busy || blocked) && styles.btnOff, pressed && !busy && !blocked && styles.btnPressed]}
            onPress={submit}
            disabled={busy || blocked}
          >
            {busy ? <ActivityIndicator color={C.darkInk} /> : <Text style={styles.btnTxt}>Create my account</Text>}
          </Pressable>

          {cloudHealth === "not-configured" ? (
            <Text style={styles.note}>Cloud isn't configured yet — demo sign-in on the login page still works.</Text>
          ) : cloudHealth === "schema-missing" ? (
            <Text style={[styles.note, { color: C.coral }]}>Cloud tables aren't set up yet — run supabase/schema.sql in the SQL Editor, then come back.</Text>
          ) : cloudHealth === "error" ? (
            <Text style={[styles.note, { color: C.coral }]}>Couldn't reach the cloud — check your connection.</Text>
          ) : (
            <Text style={styles.note}>Next page: pick the name and avatar the class will see.</Text>
          )}
        </View>

        <Pressable onPress={() => go("login")} hitSlop={8} style={styles.switchRow} accessibilityRole="button" accessibilityLabel="Sign in instead">
          <Text style={styles.switchTxt}>Already have an account? <Text style={styles.switchLink}>Sign in</Text></Text>
        </Pressable>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function HealthLine({ status }) {
  if (status === "ready") return <Text style={styles.badgeOk}>● cloud ready</Text>;
  if (status === "checking") return <Text style={styles.badgeOff}>… checking cloud</Text>;
  if (status === "not-configured") return <Text style={styles.badgeOff}>○ offline mode</Text>;
  if (status === "schema-missing") return <Text style={styles.badgeWarn}>⚠ tables not set up</Text>;
  if (status === "error") return <Text style={styles.badgeWarn}>⚠ cloud error</Text>;
  return null;
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
  title: { fontFamily: FONT.headBold, fontSize: 26, color: C.ink },
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
  btn: {
    backgroundColor: C.gold, borderRadius: 14, paddingVertical: 14, alignItems: "center",
    shadowColor: "#F0B429", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4,
    justifyContent: "center", minHeight: 48,
  },
  btnOff: { opacity: 0.45, shadowOpacity: 0 },
  btnPressed: { opacity: 0.88, transform: [{ scale: 0.97 }] },
  btnTxt: { fontFamily: FONT.headBold, fontSize: 16, color: C.darkInk },
  note: { fontFamily: FONT.body, fontSize: 11.5, color: C.muted, textAlign: "center", lineHeight: 16 },
  badgeOk: { fontFamily: FONT.bodyBold, fontSize: 11, color: C.mint },
  badgeOff: { fontFamily: FONT.bodyBold, fontSize: 11, color: C.muted },
  badgeWarn: { fontFamily: FONT.bodyBold, fontSize: 11, color: C.coral },
  switchRow: { alignItems: "center", marginTop: 18, paddingVertical: 8 },
  switchTxt: { fontFamily: FONT.body, fontSize: 14, color: C.muted },
  switchLink: { fontFamily: FONT.bodyBold, color: C.margin },
  trap: { position: "absolute", left: -9999, height: 1, width: 1, opacity: 0 },
});
