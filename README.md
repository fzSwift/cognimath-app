# CogniMath (student app)

Expo SDK 57 / React Native app for a classroom maths pilot. Students sign in, play timed quizzes, and sync scores to Supabase. Teachers watch the same project from [cognimath-teacher-web](https://github.com/fzSwift/cognimath-teacher-web).

This is a **classroom pilot**, not a store-ready kids app. Expo Go is fine for class. A real Android APK is built with EAS (`preview`). iOS TestFlight still needs a paid Apple Developer account and an interactive `eas build`.

## What this repo is

- Student quiz loop (topics, term quizzes, retry, tutor hints)
- Local encrypted save (`src/lib/vault.js`) plus cloud auth
- Session writes **only** through the `submit_session` RPC (clients cannot insert scores)
- Schema + SQL patches live here: `supabase/`

Companion desk: Vite teacher dashboard in `cognimath-teacher-web` (port 5173). Same Supabase project. Do not put `service_role` / `sb_secret_` in either app.

## Requirements

- Node 22
- npm
- [Expo Go](https://docs.expo.dev/get-started/set-up-your-environment/) **SDK 57** (the App Store Expo Go is often an older SDK and will not open this project)
- Optional: EAS CLI for device binaries (`npx eas-cli`)

## Run (Expo Go)

```powershell
cd cognimath-app
npm install
npx expo start --go --port 8081
```

- **Android:** install the SDK 57 Expo Go APK from [expo.dev/go](https://expo.dev/go), same Wi‑Fi as the machine.
- **iPhone:** store Expo Go will not load SDK 57. Use the signed client from [sign.expo.dev](https://sign.expo.dev/).
- **Web:** press `w` in the Expo terminal (http://localhost:8081).
- Do **not** press `s` (dev client) unless you have a native `development` build installed.

One Metro only. A second packager on another port will crash Expo Go with “unknown module” errors.

## Cloud (one Supabase project)

Both apps already point at the same public project in `src/config.js` (`SUPABASE_URL` + anon / publishable key). That key is public-by-design. RLS and the role-protection trigger are the wall.

1. Create a Supabase project (or use the existing one).
2. Paste `supabase/schema.sql` into **SQL Editor** and run it. The anon key cannot run DDL.
3. If you cleared the schema, run `schema.sql` again before anyone signs up. Missing tables show as PGRST205 / “tables not set up” on the login screen.
4. `create table if not exists` does **not** fix a drifted table. Drop/recreate that table (or clear the schema) and re-run.
5. After a fresh SQL run, wait 30–60s if PostgREST 404s — the schema cache can be stale.
6. Email confirmation is **off** in this project: signup returns a session and goes to profile setup.

`.env` is optional and gitignored. Runtime reads `src/config.js`. If you fork, change the URL + anon key in **both** apps together. Never commit `.env`.

### Make a teacher

Clients cannot set `role = 'teacher'`.

1. Auth → Add user (email/password).
2. SQL Editor:

```sql
update public.profiles set role = 'teacher' where id = '<auth-user-uuid>';
```

That account signs in on teacher-web only. Students sign up from this app.

## Scoring lockstep (do not drift)

`submit_session` is a 1:1 port of `src/core/engine.js`. Combo resets **only on timeout** (a wrong answer does not). Pending questions count in the accuracy denominator.

Change these together, then run the parity test:

| Piece | File |
|---|---|
| Client scoring | `src/core/engine.js` |
| RPC | `supabase/schema.sql` (`submit_session`) |
| Client submit | `src/core/sync.js` (`syncSessionResult`, `p_client_session_id`) |
| Proof | `npm run test:parity` |

Other locksteps with teacher-web (edit both copies in the same sitting):

- `src/lib/validate.js` ↔ teacher-web `src/lib/validate.js`
- Live aggregators in `src/core/sync.js` ↔ teacher-web `src/api.js`
- `conceptLabel` in `src/core/tutor.js` ↔ teacher-web `src/demo.js`
- `student_totals` view columns: schema + both fetchers
- Groups: `join_group` / `create_group` / `assign_to_group` RPCs + Profile / Leaderboard / LiveClassCard + teacher GroupsCard

## Checks

```powershell
npm run doctor          # expo-doctor
npm run test:parity     # engine vs submit_session replay
npm run check           # doctor + typecheck + parity
```

CI (`.github/workflows/mobile-check.yml`) runs doctor + the parity script on push/PR.

## Device builds (EAS)

Bundle ID / package: `com.cognimath.app`. Expo project: `@fzswift/cognimath`.

```powershell
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile preview --platform ios
```

- **Android `preview`:** internal APK. First run creates a keystore on Expo’s servers.
- **iOS `preview`:** internal/ad hoc. Needs a paid Apple Developer account and an **interactive** terminal (EAS cannot mint those credentials with `--non-interactive`).
- `production` is empty on purpose. Store / kids-app review is not ready (privacy nutrition, COPPA answers, VoiceOver pass).

`expo-audio` is configured with no microphone and no background playback. Quiz SFX respect the iOS mute switch.

## Layout (where to look)

| Path | What |
|---|---|
| `App.js` | Screen map, Android back, fonts |
| `src/screens/` | Login → home → topic → game → results |
| `src/core/engine.js` | Quiz state + scoring |
| `src/core/sync.js` | Auth, `submit_session`, teacher live |
| `src/core/data.js` | Topics, levels, question gen |
| `supabase/schema.sql` | Tables, RLS, RPCs |
| `supabase/*.sql` | Additive patches (rate limit, term quizzes, …) |

## Honest status

| Bar | Verdict |
|---|---|
| Classroom demo (Expo Go) | Pass |
| Play internal / sideload APK | Preview build works |
| TestFlight | Needs Apple login + interactive EAS |
| App Store / Play / kids review | Not yet |
