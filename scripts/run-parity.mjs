/* One-command parity gate: bundle engine.js with native stubs, run the
   replay test against the submit_session RPC semantics, clean up.
   Run from cognimath-app root (npm run test:parity / npm run check).

   The stubs keep the bundle self-contained: RN's ESM entry is Flow-typed
   (Node throws "Unexpected token 'typeof'"), expo-secure-store must not
   load at import time, and tweetnacl dynamically requires crypto (hence
   the createRequire banner). Alias paths are relative to the CWD. */
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const outfile = "scripts/engine-bundled.mjs";

try {
  await build({
    entryPoints: ["src/core/engine.js"],
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "warning",
    alias: {
      "@react-native-async-storage/async-storage": "./scripts/stub-asyncstorage.mjs",
      "react-native": "./scripts/stub-react-native.mjs",
      "expo-secure-store": "./scripts/stub-expo-secure-store.mjs",
    },
    banner: {
      js: "import { createRequire } from 'module';const require=createRequire(import.meta.url);",
    },
    outfile,
  });
  const r = spawnSync(process.execPath, ["scripts/parity-test.mjs"], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
} finally {
  try { rmSync(outfile, { force: true }); } catch { /* already gone */ }
}
