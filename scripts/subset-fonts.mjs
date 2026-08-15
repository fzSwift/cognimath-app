/* ============================================================
   CogniMath — scripts/subset-fonts.mjs
   Subsets the 6 boot fonts to the characters the app actually
   renders, cutting ~1.7 MB of ttf (Baloo 2 ships a full
   Devanagari subset!) down to a few KB per weight.

   Usage: node scripts/subset-fonts.mjs
   Output: assets/fonts/*.ttf (same family names, ttf container so
   Expo Go on native keeps working). Re-run whenever copy changes.

   Deps: subset-font (devDependency).
   ============================================================ */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "assets", "fonts");

/* Fonts loaded at boot in App.js — keep in sync with App.js + theme.js */
const FONTS = [
  ["node_modules/@expo-google-fonts/baloo-2/600SemiBold/Baloo2_600SemiBold.ttf", "Baloo2_600SemiBold.ttf"],
  ["node_modules/@expo-google-fonts/baloo-2/700Bold/Baloo2_700Bold.ttf", "Baloo2_700Bold.ttf"],
  ["node_modules/@expo-google-fonts/baloo-2/800ExtraBold/Baloo2_800ExtraBold.ttf", "Baloo2_800ExtraBold.ttf"],
  ["node_modules/@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf", "Nunito_700Bold.ttf"],
  ["node_modules/@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf", "Nunito_800ExtraBold.ttf"],
  ["node_modules/@expo-google-fonts/patrick-hand/400Regular/PatrickHand_400Regular.ttf", "PatrickHand_400Regular.ttf"],
];

/* Recursively collect every character appearing in the source */
const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) files.push(p);
  }
}

function buildCharset() {
  const chars = new Set();
  const addRange = (from, to) => { for (let c = from; c <= to; c++) chars.add(c); };
  const add = s => { for (const ch of s) chars.add(ch.codePointAt(0)); };
  addRange(0x20, 0x7E);   // ASCII printable
  addRange(0xA0, 0xFF);   // Latin-1 supplement (÷ × accents)
  addRange(0x100, 0x17F); // Latin Extended-A (European names)
  add("★●→↻Δ−–—’‘“”…•≈≥≤€™©®½¼¾"); // symbols used in UI copy
  return chars;
}

async function main() {
  await walk(SRC);
  const chars = buildCharset();
  for (const f of files) {
    const txt = await readFile(f, "utf8");
    for (const ch of txt) {
      const cp = ch.codePointAt(0);
      if (cp > 0x7F) chars.add(cp); // include any non-ASCII the source uses
    }
  }
  const text = [...chars].map(cp => String.fromCodePoint(cp)).join("");

  for (const [src, out] of FONTS) {
    const before = await readFile(join(ROOT, src));
    const buf = await subsetFont(before, text, { targetFormat: "sfnt" });
    await writeFile(join(OUT, out), buf);
    console.log(`${out.padEnd(28)} ${(before.length / 1024).toFixed(0).padStart(5)} KB -> ${(buf.length / 1024).toFixed(0).padStart(4)} KB`);
  }
  console.log(`\n${text.length} unique code points in the subset`);
}

main().catch(e => { console.error(e); process.exit(1); });
