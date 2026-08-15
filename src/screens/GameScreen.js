/* ============================================================
   CogniMath — GameScreen.js (§3.11.3)
   Question flow, retry mechanic, and the AI tutor (worked
   solution on wrong answers / "Show me how" give-up path).
   ============================================================ */

import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import TutorPanel from "../components/TutorPanel";
import { useApp } from "../AppContext";
import { useLayout } from "../layout";
import { confirmLeaveQuiz } from "../lib/leaveQuiz";
import { C, FONT } from "../theme";
import { LEVEL_NAMES, QUESTIONS_PER_SESSION, TIMER_SECONDS, TOPICS } from "../core/data";
import {
  adaptDifficulty, answerQuestion, bumpStruggle, endSession,
  followUpPending, nextQuestion, timeoutQuestion,
} from "../core/engine";
import { tutorHint } from "../core/tutor";
import { syncSessionResult, completeAssignment } from "../core/sync";
import { isSoundOn, playFx, setSoundOn } from "../core/sound";
import { typedAnswer } from "../lib/validate";
import { Shake, Stamp, TickStamp } from "../components/Motion";

/* Mark a question as finally wrong (retry-failed and give-up paths).
   `bumpFinal` is true when no one has recorded the miss yet. */
function resolveWrong(session, q, bumpFinal = false) {
  q.status = "wrong";
  session.wrong++;
  session.last5.push(0);
  if (bumpFinal) bumpStruggle(session, q, "wrongFinal");
}

function buzz(kind, combo = 0) {
  playFx(kind === "ok" ? (combo >= 3 ? "combo" : "correct") : "wrong");
  if (Platform.OS === "web") return;
  try {
    if (kind === "ok") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch (e) { /* no haptics on this device */ }
}

export default function GameScreen() {
  const { user, session, setSession, go, bumpUser, showToast } = useApp();
  const { pad, compact, landscape, width } = useLayout();
  const split = landscape && width >= 700;

  const [fb, setFb] = useState(null);
  const [input, setInput] = useState("");
  const typedRef = useRef("");
  const [soundOn, setSoundOnState] = useState(isSoundOn());
  const [answering, setAnswering] = useState(false);
  const [shake, setShake] = useState(0);
  const [tick, setTick] = useState(0);
  const answeringRef = useRef(false);
  const setAns = v => { answeringRef.current = v; setAnswering(v); };

  const timer = useRef(new Animated.Value(1)).current;
  const timeoutRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (animRef.current) animRef.current.stop();
  }, []);

  useEffect(() => {
    if (!session) { go("home"); return; }
    const mixed = session.topicId === "mixed";
    const topic = TOPICS.find(x => x.id === session.topicId);
    const q = session.questions && session.questions[session.idx];
    if ((!mixed && !topic) || !q) go("home");
  }, [session, go]);

  function setTyped(t) {
    const next = String(t || "").replace(/[^0-9.\-]/g, "").slice(0, 12);
    typedRef.current = next;
    setInput(next);
  }

  function startTimer() {
    if (!session) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (animRef.current) animRef.current.stop();
    timer.setValue(1);
    animRef.current = Animated.timing(timer, {
      toValue: 0, duration: TIMER_SECONDS * 1000, useNativeDriver: true,
    });
    animRef.current.start();
    timeoutRef.current = setTimeout(() => {
      if (!answeringRef.current) onTimeout();
    }, TIMER_SECONDS * 1000);
  }

  useEffect(() => {
    if (!session) return undefined;
    startTimer();
    return undefined;
  }, [session && session.idx]);

  if (!session) {
    return <View style={{ flex: 1 }} />;
  }

  const s = session;
  const mixed = s.topicId === "mixed";
  const t = TOPICS.find(x => x.id === s.topicId);
  const q = s.questions && s.questions[s.idx];
  if ((!mixed && !t) || !q) {
    return <View style={{ flex: 1 }} />;
  }

  function leaveQuiz() {
    confirmLeaveQuiz(() => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (animRef.current) animRef.current.stop();
      setSession(null);
      if (mixed) go("home");
      else go("topic", { topicId: s.topicId });
    });
  }

  function onTimeout() {
    timeoutQuestion(s);
    setShake(n => n + 1);
    buzz("bad");
    setAns(true);
    setFb({ ok: false, msg: "⏰ Time's up!", reveal: true });
  }

  function submitAnswer(raw) {
    if (answeringRef.current) return;
    const typed = typedAnswer(raw);
    if (!typed.ok) return;
    const value = typed.value;
    setAns(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const wasPending = q.status === "pending";
    const res = answerQuestion(s, value);
    if (res.ok) {
      setTick(n => n + 1);
      buzz("ok", s.combo);
      const msg = res.mult === 2 ? `Correct! +${res.points} pts 🔥 Combo ×2!`
        : q.followUp ? `Correct! You fixed it! +${res.points} pts 💪`
        : res.retry ? `Correct! +${res.points} pts · fixed on retry! 💪`
        : `Correct! +${res.points} pts`;
      setFb({ ok: true, msg, res, retryTip: res.retry ? tutorHint(q) : null });
    } else if (wasPending) {
      setShake(n => n + 1);
      buzz("bad");
      setFb({ ok: false, msg: "✗ Not quite — try once more!", allowRetry: true });
    } else {
      setShake(n => n + 1);
      buzz("bad");
      resolveWrong(s, q); // answerQuestion already counted the final miss
      setFb({ ok: false, msg: `✗ The answer was ${q.a}`, reveal: true });
    }
  }

  function onRetry() {
    setFb(null);
    setAns(false);
    typedRef.current = "";
    setInput("");
    startTimer();
  }

  function onGiveUp() {
    if (!q || (q.status !== "pending" && q.status !== "tried")) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShake(n => n + 1);
    buzz("bad");
    resolveWrong(s, q, true); // this path is a new final miss
    setAns(true);
    setFb({ ok: false, msg: `✗ The answer was ${q.a}`, reveal: true });
  }

  function onNext() {
    const isLast = s.idx >= QUESTIONS_PER_SESSION - 1;
    const follow = followUpPending(s);
    const adj = adaptDifficulty(s);
    // Only announce a difficulty change when the next question is a normal
    // one: a follow-up stays at the OLD difficulty, so telling the student
    // "Level up!" right before a practice round at the previous level would
    // be misleading (and the follow-up toast would swallow it anyway).
    if (adj && !isLast && !follow) {
      showToast(adj.dir === "up" ? "Level up! Difficulty increased 🔥" : "Easy does it — difficulty lowered 🙂", adj.dir === "up" ? "🚀" : "🪁");
    }
    if (isLast) {
      const u = user;
      const { result, earned, isRecord } = endSession(u, s);
      bumpUser();
      go("results", { result, earned, isRecord });
      // cloud sync (fire-and-forget; never blocks the results screen)
      if (u && u.supabaseId) {
        syncSessionResult(u, s, result).catch(() => {});
        if (s.assignmentId && s.topicId !== "mixed") completeAssignment(s.assignmentId).catch(() => {});
      }
      return;
    }
    nextQuestion(s);
    if (follow) showToast("A similar question — you've got this! 💪", "✏️");
    setFb(null);
    setAns(false);
    typedRef.current = "";
    setInput("");
  }

  const letters = ["A", "B", "C", "D"];
  const nextLabel = s.idx >= QUESTIONS_PER_SESSION - 1 ? "See results 🎉" : "Next ➜";

  return (
    <View style={[styles.wrap, { padding: pad, paddingBottom: 24 }]}>
      <View style={[styles.head, compact && { flexWrap: "wrap" }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Leave quiz" style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]} onPress={leaveQuiz}>
          <Text style={styles.iconBtnTxt}>✕</Text>
        </Pressable>
        <View style={[styles.chip, { flexShrink: 1 }]}><Text style={styles.chipTxt} numberOfLines={1}>{mixed ? `📋 Term quiz · L${s.level}` : `${t.icon} ${LEVEL_NAMES[t.id][s.level - 1]}`}</Text></View>
        <View style={[styles.chip, { borderColor: "rgba(255,107,107,0.4)" }]}><Text style={[styles.chipTxt, { color: C.coral }]}>🔥 {s.combo}</Text></View>
        <View style={[styles.chip, { borderColor: "rgba(255,209,102,0.4)" }]}><Text style={[styles.chipTxt, { color: C.gold }]}>{s.points} pts</Text></View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={soundOn ? "Mute sound" : "Unmute sound"}
          style={({ pressed }) => [styles.soundBtn, pressed && { opacity: 0.7 }]}
          onPress={() => {
            const next = !soundOn;
            setSoundOnState(next);
            setSoundOn(next);
            if (next) playFx("click");
          }}
        >
          <Text style={styles.soundTxt}>{soundOn ? "🔊" : "🔇"}</Text>
        </Pressable>
      </View>

      <View style={styles.dots}>
        {Array.from({ length: QUESTIONS_PER_SESSION }, (_, i) => (
          <View key={i} style={[
            styles.dot,
            i < s.idx && styles.dotDone,
            i === s.idx && styles.dotNow,
            i === s.idx && q.followUp && styles.dotFollow,
          ]} />
        ))}
      </View>

      <View style={styles.timerTrack}>
        <Animated.View style={[styles.timerFill, { transform: [{ scaleX: timer }] }]} />
      </View>

      <View style={split ? styles.split : { flex: 1 }}>
        <View style={split ? styles.splitCol : null}>
          <Shake kick={shake}>
          <Stamp key={s.idx}>
          <View style={[styles.qCard, fb && (fb.ok ? styles.qCardOk : styles.qCardBad)]}>
            <TickStamp show={tick} />
            <Text style={styles.qBadge}>
              {q.followUp ? "✏️ Similar question — practice round!" : `Question ${s.idx + 1} of ${QUESTIONS_PER_SESSION}`}
            </Text>
            {s.bank && s.bank.length ? <Text style={styles.qSet}>Set by your teacher</Text> : null}
            <Text style={[styles.qText, compact && { fontSize: 26, lineHeight: 32 }]}>{q.q}</Text>

            {q.options ? (
              <View style={styles.optGrid}>
                {q.options.map((o, i) => (
                  <Pressable
                    key={i}
                    accessibilityRole="button"
                    accessibilityLabel={`Option ${letters[i]}: ${o}`}
                    style={({ pressed }) => [styles.opt, answering && { opacity: 0.6 }, pressed && { transform: [{ scale: 0.95 }] }]}
                    onPress={() => { if (!answering) { playFx("click"); submitAnswer(o); } }}
                    disabled={answering}
                  >
                    <View style={styles.optLetter}><Text style={styles.optLetterTxt}>{letters[i]}</Text></View>
                    <Text style={styles.optVal}>{o}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={[styles.inputRow, compact && { flexWrap: "wrap" }]}>
                <TextInput
                  style={[styles.input, answering && { opacity: 0.5 }, compact && { minWidth: 140 }]}
                  value={input}
                  onChangeText={setTyped}
                  placeholder="Type your answer…"
                  placeholderTextColor="rgba(169,159,212,0.6)"
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  maxLength={12}
                  editable={!answering}
                  accessibilityLabel="Your answer"
                  onSubmitEditing={() => submitAnswer(typedRef.current)}
                  returnKeyType="done"
                />
                <Pressable accessibilityRole="button" accessibilityLabel="Check answer" style={({ pressed }) => [styles.checkBtn, pressed && { opacity: 0.85 }]} onPress={() => { playFx("click"); submitAnswer(typedRef.current); }}>
                  <Text style={styles.checkTxt}>Check ✓</Text>
                </Pressable>
              </View>
            )}
          </View>
          </Stamp>
          </Shake>
        </View>

        <View style={split ? styles.splitCol : { flex: 1 }}>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
            {fb ? (
              <View style={styles.feedback}>
                <View style={[styles.banner, fb.ok ? styles.bannerOk : styles.bannerBad]}>
                  <Text style={[styles.bannerTxt, fb.ok ? { color: "#8ef5d8" } : { color: "#ffb3b3" }]}>{fb.msg}</Text>
                </View>
                {fb.retryTip ? (
                  <View style={styles.hint}>
                    <Text style={styles.hintTxt}>💡 {fb.retryTip}</Text>
                  </View>
                ) : null}
                {fb.reveal && !fb.ok ? <TutorPanel question={q} /> : null}
                {fb.allowRetry ? (
                  <Pressable accessibilityRole="button" style={({ pressed }) => [styles.giveUp, pressed && { opacity: 0.7 }]} onPress={onGiveUp}>
                    <Text style={styles.giveUpTxt}>👀 Show me how to solve it</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : <View style={{ height: 20 }} />}
          </ScrollView>

          {fb && (fb.ok || fb.reveal || fb.allowRetry) ? (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.9 }]}
              onPress={fb.allowRetry ? onRetry : onNext}
            >
              <Text style={styles.nextTxt}>{fb.allowRetry ? "Try again 🔄" : nextLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  split: { flex: 1, flexDirection: "row", gap: 16, alignItems: "stretch" },
  splitCol: { flex: 1, minWidth: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.14)", borderWidth: 1,
  },
  iconBtnTxt: { fontFamily: FONT.head, fontSize: 16, color: C.txt },
  soundBtn: {
    width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.14)", borderWidth: 1,
  },
  soundTxt: { fontSize: 16 },
  chip: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999,
    backgroundColor: "#FFFCF4", borderColor: "rgba(51,48,43,0.18)", borderWidth: 1,
  },
  chipTxt: { fontFamily: FONT.head, fontSize: 12.5, color: C.txt },
  dots: { flexDirection: "row", gap: 6, marginBottom: 10 },
  dot: { width: 9, height: 9, borderRadius: 99, backgroundColor: "rgba(51,48,43,0.16)" },
  dotDone: { backgroundColor: C.mint },
  dotNow: { backgroundColor: C.gold },
  // A practice follow-up question is drawn as an empty dashed ring so the
  // progress map honestly shows this slot is a re-attempt, not a new level.
  dotFollow: { backgroundColor: "transparent", borderWidth: 2, borderStyle: "dashed", borderColor: C.coral },
  timerTrack: { height: 7, borderRadius: 99, backgroundColor: "rgba(51,48,43,0.12)", overflow: "hidden", marginBottom: 16 },
  timerFill: {
    height: 7, borderRadius: 99, width: "100%",
    backgroundColor: C.gold,
    transformOrigin: "left center",
  },
  qCard: {
    position: "relative", overflow: "visible",
    backgroundColor: C.card, borderColor: C.cardBrd, borderWidth: 1,
    borderRadius: 24, padding: 22, gap: 18, marginBottom: 12,
  },
  qCardOk: { borderColor: "rgba(6,214,160,0.7)" },
  qCardBad: { borderColor: "rgba(255,107,107,0.6)" },
  qBadge: {
    alignSelf: "flex-start", fontFamily: FONT.bodyBold, fontSize: 11, color: C.muted,
    textTransform: "uppercase", letterSpacing: 1,
    backgroundColor: "rgba(255,255,255,0.06)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  qSet: { fontFamily: FONT.bodyBold, fontSize: 12, color: C.mint, textAlign: "center" },
  qText: { fontFamily: FONT.headBold, fontSize: 32, color: C.txt, textAlign: "center", lineHeight: 40 },
  optGrid: { flexDirection: "row", flexWrap: "wrap", gap: 11 },
  opt: {
    width: "47.5%", flexGrow: 1, minWidth: 120, flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#FFFCF4", borderColor: "rgba(51,48,43,0.18)",
    borderWidth: 1.5, borderRadius: 16, padding: 13,
  },
  optLetter: {
    width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(51,48,43,0.08)",
  },
  optLetterTxt: { fontFamily: FONT.head, fontSize: 13, color: C.sky },
  optVal: { fontFamily: FONT.head, fontSize: 18, color: C.txt },
  inputRow: { flexDirection: "row", gap: 10 },
  input: {
    flex: 1, minWidth: 0, fontFamily: FONT.head, fontSize: 24, textAlign: "center", color: C.txt,
    backgroundColor: "#FFFCF4", borderColor: "rgba(51,48,43,0.18)",
    borderWidth: 1.5, borderRadius: 16, paddingVertical: 10,
  },
  checkBtn: {
    backgroundColor: C.gold, borderRadius: 16, paddingHorizontal: 18, justifyContent: "center",
  },
  checkTxt: { fontFamily: FONT.headBold, fontSize: 15, color: C.darkInk },
  feedback: { marginTop: 2 },
  banner: { borderRadius: 14, padding: 12, alignItems: "center" },
  bannerOk: { backgroundColor: "rgba(6,214,160,0.16)", borderColor: "rgba(6,214,160,0.5)", borderWidth: 1 },
  bannerBad: { backgroundColor: "rgba(255,107,107,0.14)", borderColor: "rgba(255,107,107,0.45)", borderWidth: 1 },
  bannerTxt: { fontFamily: FONT.bodyBold, fontSize: 15, textAlign: "center" },
  hint: {
    marginTop: 10, borderRadius: 14, padding: 12,
    backgroundColor: "rgba(76,201,240,0.12)", borderColor: "rgba(76,201,240,0.35)", borderWidth: 1,
  },
  hintTxt: { fontFamily: FONT.body, fontSize: 13, color: C.txt, lineHeight: 19 },
  giveUp: { marginTop: 10, alignSelf: "center", padding: 8 },
  giveUpTxt: { fontFamily: FONT.bodyBold, fontSize: 12.5, color: C.sky },
  nextBtn: {
    marginTop: 10, borderRadius: 16, paddingVertical: 14, alignItems: "center",
    backgroundColor: C.gold, shadowColor: "#ff8a3d", shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 },
  },
  nextTxt: { fontFamily: FONT.headBold, fontSize: 17, color: C.darkInk },
});
