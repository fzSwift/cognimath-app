/* ============================================================
   CogniMath — lib/supabase.js
   Guarded Supabase client: everything no-ops until the public
   anon key is set in src/config.js, so the game keeps working
   offline.

   The client is created lazily via a dynamic import so supabase-js
   can be code-split out of the web startup bundle — the game shell
   (login → home → game) never pays for the cloud SDK until sign-in
   or sync actually needs it.
   ============================================================ */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config";
import { cookieAuthStorage, hasAuthCookie } from "./cookieAuth";
import { loadSupabaseSdk } from "./loadSupabaseSdk";
import { encryptedAuthStorage, open } from "./vault";

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_ANON_KEY.startsWith("PASTE_")
);

function projectRef() {
  try { return new URL(SUPABASE_URL).hostname.split(".")[0]; } catch (e) { return ""; }
}

function authStorageKey() {
  return `sb-${projectRef()}-auth-token`;
}

/* Cheap check — no supabase-js — so a first-time visitor never pays for
   the SDK just to find out they aren't signed in. */
export async function hasStoredAuth() {
  if (!isSupabaseConfigured) return false;
  const key = authStorageKey();
  if (hasAuthCookie(key)) return true;
  try {
    if (await AsyncStorage.getItem(key)) return true;
  } catch (e) { /* tests / private mode */ }
  try {
    if (typeof localStorage !== "undefined") {
      return Boolean(localStorage.getItem(key))
        || Object.keys(localStorage).some(k => k.startsWith("sb-") && k.includes("auth-token"));
    }
  } catch (e) { /* private mode */ }
  return false;
}

/* Password-reset email lands back with #...&type=recovery in the URL. */
export function hasRecoveryLink() {
  try {
    if (typeof window === "undefined" || !window.location) return false;
    return /type=recovery/i.test(`${window.location.hash || ""}${window.location.search || ""}`);
  } catch (e) {
    return false;
  }
}

let _supabase = null;

/* Lazily create (and memoize) the client. Async because the SDK is
   dynamically imported on first use, keeping it out of the boot path. */
export async function getSupabase() {
  if (!isSupabaseConfigured) return null;
  if (!_supabase) {
    const { createClient } = await loadSupabaseSdk();
    const isWeb = Platform.OS === "web";
    let storage;
    if (isWeb) {
      storage = cookieAuthStorage({
        migrate: async key => {
          try {
            if (typeof localStorage !== "undefined") {
              const raw = localStorage.getItem(key);
              if (raw) {
                localStorage.removeItem(key);
                return open(raw);
              }
            }
          } catch (e) { /* private mode */ }
          return null;
        },
      });
    } else {
      storage = encryptedAuthStorage(AsyncStorage);
    }
    const auth = {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: isWeb,
      flowType: "pkce",
      storage,
      storageKey: authStorageKey(),
    };
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth });
  }
  return _supabase;
}
