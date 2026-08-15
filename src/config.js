/* ============================================================
   CogniMath — config.js
   Public Supabase client settings (anon / publishable key).

   This key is meant to ship in the app. It only has the `anon`
   role — RLS in supabase/schema.sql is the access wall.
   Never put the service_role / secret key here.
   ============================================================ */

export const SUPABASE_URL = "https://sjnrdkkfijlkkuslnwxy.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_yZ5eMLaiangefugmTqs5Lg_kKvBlnjZ";

/* Public Turnstile site key (not the secret). Leave blank until Bot
   protection is on in Supabase → Authentication → Attack protection.
   Then paste the Cloudflare site key here AND in teacher-web/src/config.js. */
export const TURNSTILE_SITE_KEY = "";
