// @ts-nocheck — native crypto boundary (tweetnacl / expo-secure-store / react-native).
// Typechecked surface stops at the domain core (src/core, src/lib/validate.js);
// this layer is exercised through the parity test instead.
/* ============================================================
   CogniMath — vault.js
   At-rest encryption for device data (save file + auth session).

   Native: wrapping key lives in the iOS Keychain / Android
   Keystore (expo-secure-store). The ciphertext stays in
   AsyncStorage because saves can exceed SecureStore's size cap.

   Web: the wrapping key is also in local storage — browsers have
   no Keychain. Encryption still stops a casual dump of the save
   JSON; it does not stop XSS. Cloud passwords stay on GoTrue
   (hashed); never put service_role in the client.
   ============================================================ */

import nacl from "tweetnacl";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export const VAULT_PREFIX = "cm1.";
const KEY_NAME = "cognimath_vault_key";

let _key = null;

function toHex(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

function fromHex(hex) {
  if (!hex || hex.length % 2) return new Uint8Array(0);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function utf8(str) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
  const u = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) u[i] = str.charCodeAt(i) & 0xff;
  return u;
}

function utf8str(bytes) {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function fillRandom(out) {
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(out);
    return;
  }
  for (let i = 0; i < out.length; i++) out[i] = (Math.random() * 256) | 0;
}

nacl.setPRNG(x => { fillRandom(x); });

async function readStoredKey() {
  try {
    if (Platform.OS !== "web") {
      return SecureStore.getItemAsync(KEY_NAME);
    }
  } catch (e) { /* node / tests */ }
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(KEY_NAME);
  } catch (e) { /* private mode */ }
  return null;
}

async function writeStoredKey(hex) {
  try {
    if (Platform.OS !== "web") {
      await SecureStore.setItemAsync(KEY_NAME, hex);
      return;
    }
  } catch (e) { /* node / tests */ }
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY_NAME, hex);
  } catch (e) { /* private mode */ }
}

async function masterKey() {
  if (_key) return _key;
  const stored = await readStoredKey();
  if (stored && stored.length === 64) {
    _key = fromHex(stored);
    return _key;
  }
  const fresh = nacl.randomBytes(nacl.secretbox.keyLength);
  await writeStoredKey(toHex(fresh));
  _key = fresh;
  return _key;
}

/* Encrypt a UTF-8 string. Returns a cm1. hex blob. */
export async function seal(plaintext) {
  if (plaintext == null) return plaintext;
  const key = await masterKey();
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(utf8(String(plaintext)), nonce, key);
  const packed = new Uint8Array(nonce.length + box.length);
  packed.set(nonce, 0);
  packed.set(box, nonce.length);
  return VAULT_PREFIX + toHex(packed);
}

/* Decrypt a cm1. blob. Plain JSON (old saves) is returned as-is so we
   can migrate on the next persist. */
export async function open(stored) {
  if (stored == null || stored === "") return stored;
  if (!String(stored).startsWith(VAULT_PREFIX)) return stored;
  const packed = fromHex(stored.slice(VAULT_PREFIX.length));
  const nonceLen = nacl.secretbox.nonceLength;
  if (packed.length <= nonceLen) return null;
  const key = await masterKey();
  const nonce = packed.slice(0, nonceLen);
  const box = packed.slice(nonceLen);
  const msg = nacl.secretbox.open(box, nonce, key);
  if (!msg) return null;
  return utf8str(msg);
}

export function isSealed(stored) {
  return typeof stored === "string" && stored.startsWith(VAULT_PREFIX);
}

/* supabase-js auth storage: encrypt the session JSON at rest. */
export function encryptedAuthStorage(backing) {
  return {
    getItem: async key => {
      const raw = await backing.getItem(key);
      if (raw == null) return null;
      return open(raw);
    },
    setItem: async (key, value) => {
      await backing.setItem(key, await seal(value));
    },
    removeItem: async key => {
      await backing.removeItem(key);
    },
  };
}
