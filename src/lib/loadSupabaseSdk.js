/* Web: dynamic import so expo export can code-split supabase-js. */
export function loadSupabaseSdk() {
  return import("@supabase/supabase-js");
}
