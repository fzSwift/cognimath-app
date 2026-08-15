/* ============================================================
   CogniMath — LeaderboardScreen.js
   Class-only ranks. Students see their own group; other classes
   are hidden by RLS and never shown as a fallback board.
   ============================================================ */

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "../components/ui";
import { useApp } from "../AppContext";
import { C, FONT } from "../theme";
import { fetchClassLeaderboard, joinClass } from "../core/sync";
import { joinCode as checkJoin } from "../lib/validate";

export default function LeaderboardScreen() {
  const { user, go, showToast } = useApp();
  const [board, setBoard] = useState({ status: "loading" });
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchClassLeaderboard();
    setBoard(res || { status: "error", error: "Couldn't load ranks." });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function join() {
    if (joining) return;
    const trimmed = checkJoin(code);
    if (!trimmed.ok) { showToast(trimmed.error, "🏫"); return; }
    setJoining(true);
    try {
      const { group, error } = await joinClass(trimmed.value);
      if (error) { showToast(error.message, "🏫"); return; }
      setCode("");
      showToast(`You joined ${group.name}!`, "🏫");
      await load();
    } finally {
      setJoining(false);
    }
  }

  const rows = board.status === "ok" ? (board.rows || []) : [];
  const meId = user && user.supabaseId;
  const rankOf = rows.findIndex(r => r.id === meId) + 1;
  const medal = ["🥇", "🥈", "🥉"];
  const className = board.status === "ok" && board.group ? board.group.name : null;

  return (
    <Screen>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🏆 Class Leaderboard</Text>
          <Text style={styles.sub}>
            {className ? `${className} · your class only` : "Ranks stay inside your class"}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to home" style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]} onPress={() => go("home")}>
          <Text style={styles.iconBtnTxt}>🏠</Text>
        </Pressable>
      </View>

      {board.status === "loading" ? (
        <View style={styles.empty}>
          <ActivityIndicator color={C.gold} />
          <Text style={styles.emptyTxt}>Loading your class…</Text>
        </View>
      ) : board.status === "ok" ? (
        <>
          {rankOf ? (
            <View style={styles.youRank}>
              <Text style={styles.youRankTxt}>You are <Text style={{ color: C.gold, fontFamily: FONT.headBold }}>#{rankOf}</Text> of {rows.length} in {className} 🚀</Text>
            </View>
          ) : null}

          {rows.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIco}>🏫</Text>
              <Text style={styles.emptyTitle}>You're in {className}</Text>
              <Text style={styles.emptyTxt}>No classmates on the board yet — play a session so your points show up here.</Text>
            </View>
          ) : (
            <>
              <View style={styles.podium}>
                {rows.slice(0, 3).map((r, i) => (
                  <View key={r.id} style={[styles.podiumItem, i === 0 && styles.podium1, r.id === meId && { borderColor: C.sky, borderWidth: 2 }]}>
                    <Text style={{ fontSize: 22 }}>{medal[i]}</Text>
                    <Text style={{ fontSize: 26 }}>{r.avatar}</Text>
                    <Text style={styles.podiumName} numberOfLines={1}>{r.name}</Text>
                    <Text style={styles.podiumPts}>{(r.points || 0).toLocaleString()}</Text>
                  </View>
                ))}
              </View>

              <View style={{ gap: 8 }}>
                {rows.map((r, i) => (
                  <View key={r.id} style={[styles.row, r.id === meId && styles.rowMe]}>
                    <Text style={styles.rankNum}>{i < 3 ? medal[i] : i + 1}</Text>
                    <Text style={{ fontSize: 22 }}>{r.avatar}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{r.name}</Text>
                      <Text style={styles.rowSub}>Level {r.level} · 🔥 {r.streak || 0} streak</Text>
                    </View>
                    <Text style={styles.rowPts}>{(r.points || 0).toLocaleString()}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      ) : (
        <JoinClassCard
          status={board.status}
          error={board.error}
          code={code}
          setCode={setCode}
          joining={joining}
          onJoin={join}
          onSignIn={() => go("login")}
          cloudUser={!!(user && user.supabaseId)}
        />
      )}
    </Screen>
  );
}

function JoinClassCard({ status, error, code, setCode, joining, onJoin, onSignIn, cloudUser }) {
  const canJoin = cloudUser && (status === "ungrouped" || status === "error");
  const title = status === "error" ? "Couldn't load ranks"
    : cloudUser ? "Join your class to see ranks"
    : "Class ranks need a class";
  const body = status === "error" ? (error || "Check your connection and try again.")
    : cloudUser
      ? "Each class has its own board. Enter the code your teacher gave you — you won't see other classes, and they won't see you."
      : "Sign in with your school email, then join with your teacher's class code. Rankings never mix classes.";

  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIco}>🏫</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyTxt}>{body}</Text>

      {canJoin ? (
        <View style={styles.joinBox}>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={t => setCode(t.toUpperCase())}
            placeholder="CLASS CODE e.g. A1B2C3"
            placeholderTextColor="#B5A98F"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
          />
          <Pressable style={({ pressed }) => [styles.joinBtn, pressed && { opacity: 0.85 }]} onPress={onJoin} disabled={joining}>
            {joining ? <ActivityIndicator color="#0E3A27" /> : <Text style={styles.joinBtnTxt}>Join class</Text>}
          </Pressable>
        </View>
      ) : (
        <Pressable style={({ pressed }) => [styles.joinBtn, pressed && { opacity: 0.85 }]} onPress={onSignIn}>
          <Text style={styles.joinBtnTxt}>Sign in to join a class</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  title: { fontFamily: FONT.headBold, fontSize: 19, color: C.txt },
  sub: { fontFamily: FONT.body, fontSize: 11.5, color: C.muted },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.14)", borderWidth: 1,
  },
  iconBtnTxt: { fontSize: 17 },
  youRank: {
    alignItems: "center",
    backgroundColor: "rgba(240,180,41,0.16)", borderColor: "rgba(240,180,41,0.45)",
    borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 16,
  },
  youRankTxt: { fontFamily: FONT.body, fontSize: 13.5, color: C.txt, textAlign: "center" },
  podium: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginBottom: 16 },
  podiumItem: {
    flex: 1, alignItems: "center", gap: 5, borderRadius: 18, padding: 14,
    backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1,
  },
  podium1: { backgroundColor: "rgba(255,209,102,0.18)", borderColor: "rgba(255,209,102,0.5)", paddingBottom: 22 },
  podiumName: { fontFamily: FONT.head, fontSize: 12.5, color: C.txt, maxWidth: "100%" },
  podiumPts: { fontFamily: FONT.headBold, fontSize: 13, color: C.gold },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1, borderRadius: 16, padding: 11,
  },
  rowMe: { borderColor: "rgba(76,201,240,0.6)", backgroundColor: "rgba(76,201,240,0.1)" },
  rankNum: { width: 30, fontFamily: FONT.headBold, fontSize: 14, color: C.muted, textAlign: "center" },
  rowName: { fontFamily: FONT.head, fontSize: 14, color: C.txt },
  rowSub: { fontFamily: FONT.body, fontSize: 11, color: C.muted },
  rowPts: { fontFamily: FONT.head, fontSize: 14.5, color: C.gold },
  empty: {
    alignItems: "center", gap: 10,
    backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1,
    borderLeftWidth: 3, borderLeftColor: C.margin,
    borderRadius: 16, padding: 22, marginTop: 4,
  },
  emptyIco: { fontSize: 36 },
  emptyTitle: { fontFamily: FONT.headBold, fontSize: 17, color: C.ink, textAlign: "center" },
  emptyTxt: { fontFamily: FONT.body, fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 18 },
  joinBox: { alignSelf: "stretch", gap: 10, marginTop: 6 },
  input: {
    fontFamily: FONT.body, fontSize: 16, color: C.ink, textAlign: "center", letterSpacing: 2,
    backgroundColor: "#FBF6E9", borderColor: C.cardBrd,
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  joinBtn: {
    alignSelf: "stretch", alignItems: "center", borderRadius: 12, paddingVertical: 12, marginTop: 4,
    backgroundColor: C.mint, justifyContent: "center", minHeight: 44,
  },
  joinBtnTxt: { fontFamily: FONT.headBold, fontSize: 14, color: "#0E3A27" },
});
