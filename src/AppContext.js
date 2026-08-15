/* ============================================================
   CogniMath — AppContext.js (Expo port)
   Global app state + screen routing, replacing app.js's `App`
   object and `show()` dispatcher. Screens are plain state-driven
   views (no navigation library needed for this shell).
   ============================================================ */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { TEACHER_CREDS } from "./core/data";
import { getUser, loadSaveAsync, nameAvailable, renameUser, startSession } from "./core/engine";
import { displayName, avatar as checkAvatar } from "./lib/validate";
import { hasRecoveryLink, hasStoredAuth } from "./lib/supabase";

function cloud() {
  return require("./core/sync");
}

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("login");
  const [topicId, setTopicId] = useState(null);
  const [level, setLevel] = useState(null);
  const [session, setSession] = useState(null);
  const [params, setParams] = useState({});
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const go = useCallback((s, p = {}) => {
    setScreen(s);
    setParams(p);
  }, []);

  /* Restore a saved cloud session (or a password-reset link) after the
     local save is ready. First-time visitors skip the SDK entirely. */
  useEffect(() => {
    let cancelled = false;
    let unsub = () => {};
    (async () => {
      await loadSaveAsync();
      if (cancelled) return;
      const recovery = hasRecoveryLink();
      if (recovery) go("reset");
      setReady(true);
      const stored = recovery ? false : await hasStoredAuth();
      if (!recovery && !stored) return;
      const api = cloud();
      unsub = await api.onAuthStateChange(event => {
        if (event === "PASSWORD_RECOVERY") go("reset");
      });
      if (cancelled) { unsub(); return; }
      if (recovery) return;
      const restored = await api.restoreSession();
      if (cancelled) return;
      if (restored.needsSetup) {
        go("setup");
      } else if (restored.user && restored.user.supabaseRole === "teacher") {
        setUser(null);
        go("teacher");
      } else if (restored.user) {
        setUser(restored.user);
        go("home");
      }
    })();
    return () => { cancelled = true; unsub(); };
  }, [go]);

  const showToast = useCallback((msg, icon = "✨") => {
    setToast({ msg, icon, id: Date.now() });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const login = useCallback((username, password = "") => {
    if (!username) { showToast("Please enter a username", "🙏"); return; }
    if (username.toLowerCase() === TEACHER_CREDS.username) {
      if (password !== TEACHER_CREDS.password) { showToast("Wrong teacher password", "🔒"); return; }
      setUser(null);
      go("teacher");
      return;
    }
    const u = getUser(username);
    const fresh = !u.played;
    setUser(u);
    showToast(fresh ? `Welcome, ${u.name}! 🎉` : `Welcome back, ${u.name}! 👋`);
    go("home");
  }, [go, showToast]);

  /* engine mutates the user object in place — bump the reference so
     React re-renders screens that read user stats */
  const bumpUser = useCallback(() => {
    setUser(u => (u ? { ...u } : u));
  }, []);

  const logout = useCallback(() => {
    cloud().supabaseSignOut();
    setUser(null);
    setSession(null);
    go("login");
  }, [go]);

  /* Supabase-backed login: sign in or create an account with email.
     A brand-new account routes to the profile-setup screen instead of
     finalizing with an email-derived name. Falls back gracefully when
     Supabase isn't configured yet. */
  const supabaseAuth = useCallback(async (email, password, mode = "signin", name, captchaToken) => {
    const result = mode === "signup"
      ? await cloud().supabaseSignUp(email, password, name, captchaToken)
      : await cloud().supabaseSignIn(email, password, captchaToken);
    if (result.error) { showToast(result.error.message, "🔒"); return false; }
    if (result.needsSetup) {
      setUser(null);
      go("setup");
      return true;
    }
    if (!result.user) {
      showToast("Cloud isn't connected yet — paste your public anon key in src/config.js. Demo login still works.", "🔌");
      return false;
    }
    setUser(result.user);
    if (result.user.supabaseRole === "teacher") {
      setUser(null); // teacher screen is unauthenticated in the local shell
      showToast("Welcome, Teacher! ☁️", "👩‍🏫");
      go("teacher");
      return true;
    }
    showToast(`Welcome, ${result.user.name}! ☁️`, "🦉");
    go("home");
    return true;
  }, [go, showToast]);

  /* Post-signup profile completion (setup screen): save the chosen name +
     avatar, finalize the session, and continue to home. */
  const completeProfile = useCallback(async (name, avatar) => {
    const { user, error } = await cloud().completeSignupProfile(name, avatar);
    if (error) { showToast(error.message, "🔒"); return false; }
    if (!user) { showToast("Couldn't finish setting up your profile — try again.", "🔒"); return false; }
    setUser(user);
    showToast(`Welcome, ${user.name}! ☁️`, "🦉");
    go("home");
    return true;
  }, [go, showToast]);

  /* Edit profile later (profile screen). ALL checks run BEFORE any
     mutation so a cancel leaves everything untouched:
     1. local availability (hard constraint — the save store is keyed by
        name, a local collision would clobber the other student's entry);
     2. cloud classmate collision → return { needsConfirm } so the screen
        can ask before applying.
     Returns false (toast shown), true (saved + navigated), or
     { needsConfirm } when the student must confirm a classmate-name match. */
  const updateProfile = useCallback(async (newName, newAvatar, opts = {}) => {
    if (!user) { showToast("Sign in first to edit your profile.", "🔒"); return false; }
    const named = displayName(newName);
    if (!named.ok) { showToast(named.error, "✏️"); return false; }
    const target = named.value;
    if (newAvatar) {
      const face = checkAvatar(newAvatar);
      if (!face.ok) { showToast(face.error, "🐾"); return false; }
      newAvatar = face.value;
    }
    if (!target && !newAvatar) return false;
    const renaming = target && target !== user.name;

    if (renaming && !nameAvailable(target)) {
      showToast("That name is already used on this device — pick another.", "✏️");
      return false;
    }
    if (renaming && user.supabaseId && !opts.force) {
      const { taken } = await cloud().checkProfileNameTaken(target, user.supabaseId);
      if (taken) return { needsConfirm: true };
    }

    let local = user;
    if (renaming) {
      local = renameUser(user.name, target);
      if (!local) { showToast("That name is taken — pick another.", "✏️"); return false; }
    }
    const { user: updated, error } = await cloud().updateCloudProfile(local, target || user.name, newAvatar || user.avatar);
    if (error) { showToast(error.message, "🔒"); return false; }
    setUser({ ...updated });
    showToast("Profile updated!", "✅");
    go("home");
    return true;
  }, [user, go, showToast]);

  /* Password reset flow */
  const sendResetEmail = useCallback(async (email, captchaToken) => {
    const redirectTo = typeof window !== "undefined" && window.location ? window.location.origin : undefined;
    const { sent, error } = await cloud().sendPasswordResetEmail(email, redirectTo, captchaToken);
    if (error) { showToast(error.message, "🔒"); return false; }
    showToast(sent ? "Check your inbox for the reset link." : "If that email exists, a reset link is on its way.", "📬");
    return sent;
  }, [showToast]);

  const resetPasswordWithNew = useCallback(async newPassword => {
    const { error } = await cloud().resetPassword(newPassword);
    if (error) { showToast(error.message, "🔒"); return false; }
    await cloud().supabaseSignOut();
    showToast("Password updated — sign in with your new password.", "✅");
    go("login");
    return true;
  }, [go, showToast]);

  const play = useCallback(async (topic, lvl, opts = {}) => {
    setTopicId(topic);
    setLevel(lvl);
    const bank = user && user.supabaseId && topic !== "mixed"
      ? await cloud().fetchClassQuestions(topic)
      : [];
    setSession(startSession(user, topic, lvl, bank, opts.assignmentId || null));
    go("game");
  }, [go, user]);

  const value = {
    ready, user, setUser, bumpUser, screen, params, topicId, level,
    session, setSession, play, go, login, logout, supabaseAuth, completeProfile,
    updateProfile, sendResetEmail, resetPasswordWithNew, showToast, toast,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
