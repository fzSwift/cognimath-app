/* Session cookies for the web Supabase client.

   Secure (HTTPS only) + SameSite=Lax + Path=/. Not HttpOnly — the
   JS client has to read the cookie to refresh the JWT. Native builds
   do not use this file (they keep the encrypted device store). */
const CHUNK = 3000;
const MAX_CHUNKS = 12;
const WEEK = 60 * 60 * 24 * 7;

function isSecure() {
  try { return typeof location !== "undefined" && location.protocol === "https:"; } catch (e) {
    return false;
  }
}

function attrs(maxAge) {
  return `Path=/; SameSite=Lax; Max-Age=${maxAge}${isSecure() ? "; Secure" : ""}`;
}

function readOne(name) {
  if (typeof document === "undefined") return null;
  const parts = document.cookie ? document.cookie.split("; ") : [];
  for (let i = 0; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq < 0) continue;
    if (parts[i].slice(0, eq) === name) return parts[i].slice(eq + 1);
  }
  return null;
}

function writeOne(name, value, maxAge) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; ${attrs(maxAge)}`;
}

function readChunks(key) {
  const single = readOne(key);
  if (single != null && single !== "") {
    try { return decodeURIComponent(single); } catch (e) { return single; }
  }
  const bits = [];
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const part = readOne(`${key}.${i}`);
    if (part == null) break;
    bits.push(part);
  }
  if (!bits.length) return null;
  const joined = bits.join("");
  try { return decodeURIComponent(joined); } catch (e) { return joined; }
}

function clearChunks(key) {
  writeOne(key, "", 0);
  for (let i = 0; i < MAX_CHUNKS; i++) writeOne(`${key}.${i}`, "", 0);
}

function writeChunks(key, value) {
  clearChunks(key);
  if (value == null || value === "") return;
  const encoded = encodeURIComponent(value);
  if (encoded.length <= CHUNK) {
    writeOne(key, encoded, WEEK);
    return;
  }
  let n = 0;
  for (let i = 0; i < encoded.length; i += CHUNK) {
    writeOne(`${key}.${n}`, encoded.slice(i, i + CHUNK), WEEK);
    n += 1;
  }
}

export function hasAuthCookie(key) {
  if (typeof document === "undefined" || !key) return false;
  const prefix = `${key}=`;
  const chunkPrefix = `${key}.`;
  return (document.cookie || "").split("; ").some(c => c.startsWith(prefix) || c.startsWith(chunkPrefix));
}

export function cookieAuthStorage(opts) {
  const migrate = opts && opts.migrate;
  return {
    getItem: async key => {
      const fromCookie = readChunks(key);
      if (fromCookie) return fromCookie;
      if (!migrate) return null;
      const old = await migrate(key);
      if (old) writeChunks(key, old);
      return old || null;
    },
    setItem: async (key, value) => { writeChunks(key, value); },
    removeItem: async key => { clearChunks(key); },
  };
}
