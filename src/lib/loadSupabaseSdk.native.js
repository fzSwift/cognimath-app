/* Native: static require — Expo Go cannot resolve Metro's lazy chunks. */
export function loadSupabaseSdk() {
  return Promise.resolve(require("@supabase/supabase-js"));
}
