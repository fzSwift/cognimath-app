/* ============================================================
   CogniMath — ProfileScreen.js
   Edit the display name + avatar after signup (tapping the
   avatar on Home). Works for both cloud accounts (syncs to the
   profiles table) and offline demo users (local save only).
   ============================================================ */

import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "../components/ui";
import { useApp } from "../AppContext";
import { AVATAR_POOL } from "../core/data";
import { fetchMyGroup, joinClass } from "../core/sync";
import { avatar as checkAvatar, displayName, joinCode as checkJoin } from "../lib/validate";
import { C, FONT } from "../theme";

export default function ProfileScreen() {
  const { user, updateProfile, go, showToast } = useApp();
  const [name, setName] = useState(user ? user.name : "");
  const [avatar, setAvatar] = useState(user ? user.avatar : null);
  const [busy, setBusy] = useState(false);
  /* set when the new name matches a classmate's profile — asks before applying */
  const [collision, setCollision] = useState(null);
  /* class membership */
  const [myGroup, setMyGroup] = useState(null);
  const [classCode, setClassCode] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const g = await fetchMyGroup();
      if (alive && g) setMyGroup(g);
    })();
    return () => { alive = false; };
  }, []);

  async function join() {
    if (joining) return;
    const code = checkJoin(classCode);
    if (!code.ok) { showToast(code.error, "🏫"); return; }
    setJoining(true);
    try {
      const { group, error } = await joinClass(code.value);
      if (error) { showToast(error.message, "🏫"); return; }
      setMyGroup(group);
      setClassCode("");
      showToast(`You joined ${group.name}!`, "🏫");
    } finally {
      setJoining(false);
    }
  }

  async function save(force = false) {
    if (busy) return;
    const n = displayName(name);
    if (!n.ok) { showToast(n.error, "✏️"); return; }
    const chosen = n.value;
    if (avatar) {
      const a = checkAvatar(avatar);
      if (!a.ok) { showToast(a.error, "🐾"); return; }
    }
    if (chosen === (user ? user.name : null) && (!avatar || avatar === (user ? user.avatar : null))) {
      go("home");
      return;
    }
    setBusy(true);
    try {
      const res = await updateProfile(chosen, avatar || undefined, force ? { force: true } : undefined);
      if (res && res.needsConfirm) setCollision(chosen);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen style={{ paddingTop: 14, paddingBottom: 40 }}>
        <Pressable onPress={() => go("home")} hitSlop={10} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to home">
          <Text style={styles.backTxt}>‹ Home</Text>
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.board}>
            <View style={styles.boardInset}>
              <Text style={styles.mascotTxt}>{avatar || "🐾"}</Text>
            </View>
          </View>
          <Text style={styles.title}>Your profile</Text>
          <View style={styles.underline} />
          <Text style={styles.sub}>This is how the class sees you on the leaderboard and teacher dashboard.</Text>
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
              accessibilityLabel="Display name"
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
                  accessibilityRole="button"
                  accessibilityLabel={`Avatar ${a}`}
                  accessibilityState={{ selected: avatar === a }}
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

          {user && user.supabaseEmail ? (
            <View style={styles.emailRow}>
              <Text style={styles.emailLabel}>Linked account</Text>
              <Text style={styles.emailTxt}>{user.supabaseEmail}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>My class</Text>
            {myGroup ? (
              <View style={styles.classJoined}>
                <Text style={styles.classJoinedTxt}>🏫 You're in <Text style={styles.classJoinedName}>{myGroup.name}</Text> — the leaderboard and your teacher's dashboard use this class.</Text>
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  value={classCode}
                  onChangeText={t => setClassCode(t.toUpperCase())}
                  placeholder="CLASS CODE e.g. A1B2C3"
                  placeholderTextColor="#B5A98F"
                  autoCapitalize="characters"
                  accessibilityLabel="Class code"
                  maxLength={12}
                />
                <Pressable accessibilityRole="button" accessibilityLabel="Join class" style={({ pressed }) => [styles.joinBtn, pressed && { opacity: 0.85 }]} onPress={join} disabled={joining}>
                  {joining ? <ActivityIndicator color="#0E3A27" /> : <Text style={styles.joinBtnTxt}>Join class 🏫</Text>}
                </Pressable>
              </>
            )}
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="Save profile changes" style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={() => save(false)} disabled={busy}>
            {busy ? <ActivityIndicator color={C.darkInk} /> : <Text style={styles.btnTxt}>Save changes ✅</Text>}
          </Pressable>
          <Pressable onPress={() => go("home")} disabled={busy} hitSlop={8}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>

        <Modal transparent visible={!!collision} animationType="fade" onRequestClose={() => setCollision(null)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalIco}>👥</Text>
              <Text style={styles.modalTitle}>That name is already in your class</Text>
              <Text style={styles.modalTxt}>
                There's already a student called <Text style={styles.modalName}>{collision}</Text>. If you use it anyway,
                the teacher dashboard will show you both under the same name.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, pressed && { opacity: 0.85 }]}
                onPress={() => { setCollision(null); save(true); }}
                disabled={busy}
              >
                <Text style={styles.modalBtnTxt}>Use it anyway</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.modalBtnGhost, pressed && { opacity: 0.85 }]} onPress={() => setCollision(null)} disabled={busy}>
                <Text style={styles.modalBtnGhostTxt}>Keep my name</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: "flex-start", marginBottom: 4 },
  backTxt: { fontFamily: FONT.bodyBold, fontSize: 14, color: C.margin },
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
  emailRow: {
    backgroundColor: "#FBF6E9", borderColor: C.cardBrd, borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 2,
  },
  emailLabel: { fontFamily: FONT.bodyBold, fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.7 },
  emailTxt: { fontFamily: FONT.body, fontSize: 13.5, color: C.ink },
  classJoined: {
    backgroundColor: "rgba(31,157,110,0.1)", borderColor: "rgba(31,157,110,0.45)", borderWidth: 1,
    borderRadius: 12, padding: 12,
  },
  classJoinedTxt: { fontFamily: FONT.body, fontSize: 13, color: C.muted, lineHeight: 18 },
  classJoinedName: { fontFamily: FONT.bodyBold, color: C.mint },
  joinBtn: {
    alignItems: "center", borderRadius: 12, paddingVertical: 12,
    backgroundColor: C.mint, justifyContent: "center", minHeight: 44,
  },
  joinBtnTxt: { fontFamily: FONT.headBold, fontSize: 14, color: "#0E3A27" },
  btn: {
    backgroundColor: C.gold, borderRadius: 14, paddingVertical: 14, alignItems: "center",
    shadowColor: "#F0B429", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4,
    justifyContent: "center", minHeight: 48,
  },
  btnPressed: { opacity: 0.88, transform: [{ scale: 0.97 }] },
  btnTxt: { fontFamily: FONT.headBold, fontSize: 16, color: C.darkInk },
  cancel: { fontFamily: FONT.body, fontSize: 12, color: C.muted, textAlign: "center", textDecorationLine: "underline" },
  modalBackdrop: {
    flex: 1, alignItems: "center", justifyContent: "center", padding: 28,
    backgroundColor: "rgba(23,18,51,0.45)",
  },
  modalCard: {
    width: "100%", maxWidth: 340, alignItems: "center", gap: 10,
    backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1,
    borderLeftWidth: 3, borderLeftColor: C.margin,
    borderRadius: 18, padding: 22,
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  modalIco: { fontSize: 34 },
  modalTitle: { fontFamily: FONT.headBold, fontSize: 17, color: C.ink, textAlign: "center" },
  modalTxt: { fontFamily: FONT.body, fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 18 },
  modalName: { fontFamily: FONT.bodyBold, color: C.ink },
  modalBtn: {
    alignSelf: "stretch", alignItems: "center", borderRadius: 12, paddingVertical: 12, marginTop: 6,
    backgroundColor: C.gold,
  },
  modalBtnTxt: { fontFamily: FONT.headBold, fontSize: 15, color: C.darkInk },
  modalBtnGhost: {
    alignSelf: "stretch", alignItems: "center", borderRadius: 12, paddingVertical: 11,
    backgroundColor: "#FBF6E9", borderColor: C.cardBrd, borderWidth: 1,
  },
  modalBtnGhostTxt: { fontFamily: FONT.headBold, fontSize: 14, color: C.ink },
});
