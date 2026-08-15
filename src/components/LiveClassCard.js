/* ============================================================
   CogniMath — LiveClassCard.js
   Teacher dashboard card fed by real Supabase data: synced
   students, session counts, accuracy and live concept struggles.
   Renders nothing when the cloud isn't configured yet.
   ============================================================ */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { C, FONT } from "../theme";
import { conceptLabel } from "../core/tutor";
import {
  aggregateLiveStruggles, aggregateLiveStudents, fetchTeacherGroups, fetchTeacherLive, subscribeTeacherLive,
} from "../core/sync";

export default function LiveClassCard() {
  const [state, setState] = useState("loading"); // loading | offline | nosession | empty | ready | error
  const [students, setStudents] = useState([]);
  const [struggles, setStruggles] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selGroup, setSelGroup] = useState(null);
  const [groupsReady, setGroupsReady] = useState(false);
  /* serialize fetches: an event arriving mid-fetch re-runs once the
     current fetch settles (never dropped, never overlapped, so a slow
     stale response can't overwrite a newer one) */
  const loading = useRef(false);
  const rerun = useRef(false);

  /* teacher's classes — RLS already scopes the data; the selector just
     narrows the card to one class when the teacher has several */
  useEffect(() => {
    let alive = true;
    (async () => {
      const gs = await fetchTeacherGroups();
      if (!alive) return;
      setGroups(gs);
      if (gs.length) setSelGroup(g => g || gs[0].id);
      setGroupsReady(true);
    })();
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    if (loading.current) { rerun.current = true; return; }
    loading.current = true;
    try {
      const live = await fetchTeacherLive(selGroup);
      if (!live) { setState("offline"); return; }
      if (live.noSession) { setState("nosession"); return; }
      if (live.error) { setState("error"); return; }
      const rows = aggregateLiveStudents(live);
      setStudents(rows);
      setStruggles(aggregateLiveStruggles(live));
      setState(rows.length ? "ready" : "empty");
    } catch (e) {
      setState("error");
    } finally {
      loading.current = false;
      if (rerun.current) { rerun.current = false; load(); }
    }
  }, [selGroup]);

  /* Wait until the class list is known so we don't download every group first. */
  useEffect(() => {
    if (!groupsReady) return;
    if (groups.length && !selGroup) return;
    load();
  }, [load, groupsReady, groups.length, selGroup]);

  /* live updates: refetch (debounced) when a student's quiz lands */
  useEffect(() => {
    let alive = true;
    let t;
    const onChange = () => {
      if (!alive) return;
      clearTimeout(t);
      t = setTimeout(load, 400);
    };
    let unsub = () => {};
    subscribeTeacherLive(onChange).then(u => {
      if (alive) unsub = u; else u();
    });
    return () => { alive = false; clearTimeout(t); unsub(); };
  }, [load]);

  if (state === "offline") return null;

  return (
    <View style={styles.card}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={styles.title}>☁️ Live class data <Text style={styles.sub}>Supabase</Text></Text>
        <View style={styles.liveTag}><Text style={styles.liveTxt}>● live</Text></View>
      </View>

      {groups.length > 1 ? (
        <View style={styles.groupRow}>
          {groups.map(g => (
            <Pressable
              key={g.id}
              onPress={() => setSelGroup(g.id)}
              style={[styles.groupChip, selGroup === g.id && styles.groupChipOn]}
            >
              <Text style={[styles.groupChipTxt, selGroup === g.id && styles.groupChipTxtOn]} numberOfLines={1}>{g.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : groups.length === 1 ? (
        <Text style={styles.groupName}>🏫 {groups[0].name}</Text>
      ) : null}

      {state === "loading" ? (
        <ActivityIndicator color={C.gold} style={{ marginTop: 10 }} />
      ) : state === "nosession" ? (
        <Text style={styles.note}>🔐 Sign in with your teacher cloud account (email) on the login screen to see live class data here. The pilot data below is shown meanwhile.</Text>
      ) : state === "error" ? (
        <Text style={styles.note}>⚠ Couldn't reach the cloud — check your Supabase key, schema, and network.</Text>
      ) : state === "empty" ? (
        <Text style={styles.note}>No synced sessions yet — students who sign in with a cloud account and finish a quiz will appear here in real time.</Text>
      ) : (
        <>
          {students.map(p => (
            <View key={p.id} style={styles.stuRow}>
              <Text style={{ fontSize: 18 }}>{p.avatar}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.stuName}>{p.name}</Text>
                <Text style={styles.stuSub}>{p.sessions} sessions · {p.stars} ★ · {p.points} pts</Text>
              </View>
              <Text style={styles.stuAcc}>{p.accuracy}%</Text>
            </View>
          ))}

          {struggles.length ? (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.subTitle}>🧠 Live struggles</Text>
              {struggles.map(s => {
                const pct = Math.round(s.rate * 100);
                return (
                  <View key={s.key} style={styles.strRow}>
                    <Text style={styles.strLabel} numberOfLines={1}>{conceptLabel(s.key)}</Text>
                    <Text style={[styles.strPct, { color: pct >= 40 ? C.coral : pct >= 25 ? C.gold : C.mint }]}>{pct}% wrong</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(6,214,160,0.06)",
    borderColor: "rgba(6,214,160,0.3)", borderWidth: 1,
    borderRadius: 20, padding: 16, marginBottom: 14,
  },
  title: { fontFamily: FONT.head, fontSize: 15.5, color: C.txt },
  sub: { fontSize: 10.5, color: C.muted, fontFamily: FONT.bodyBold },
  liveTag: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: "rgba(6,214,160,0.14)", borderColor: "rgba(6,214,160,0.45)", borderWidth: 1,
  },
  liveTxt: { fontFamily: FONT.bodyBold, fontSize: 10, color: C.mint },
  note: { fontFamily: FONT.body, fontSize: 12, color: C.muted, lineHeight: 17, marginTop: 6 },
  groupName: { fontFamily: FONT.bodyBold, fontSize: 12, color: C.mint, marginTop: 8 },
  groupRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  groupChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.16)", borderWidth: 1,
    maxWidth: 150,
  },
  groupChipOn: { backgroundColor: "rgba(240,180,41,0.25)", borderColor: C.gold },
  groupChipTxt: { fontFamily: FONT.body, fontSize: 11.5, color: C.muted },
  groupChipTxtOn: { color: C.chalk },
  stuRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12,
    padding: 10, marginTop: 8,
  },
  stuName: { fontFamily: FONT.head, fontSize: 13.5, color: C.txt },
  stuSub: { fontFamily: FONT.body, fontSize: 11, color: C.muted },
  stuAcc: { fontFamily: FONT.headBold, fontSize: 14, color: C.mint },
  subTitle: { fontFamily: FONT.head, fontSize: 13, color: C.txt, marginBottom: 6 },
  strRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 5 },
  strLabel: { flex: 1, fontFamily: FONT.body, fontSize: 12, color: C.txt, marginRight: 8 },
  strPct: { fontFamily: FONT.bodyBold, fontSize: 12 },
});
