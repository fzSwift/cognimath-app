/* ============================================================
   CogniMath — generate-assets.js
   Renders the app icon, Android adaptive icons, splash icon and
   favicon from SVG designs — The Workbook identity:
   chalkboard-green board, wood frame, a cute abacus mascot
   (beads + happy face), the red margin rule, chalk math symbols.
   Usage:  node scripts/generate-assets.js
   ============================================================ */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const OUT = path.join(__dirname, "..", "assets");
fs.mkdirSync(OUT, { recursive: true });

/* ---------- Workbook palette (theme.js) ---------- */
const P = {
  paper: "#F5EEDD",     // notebook page
  card: "#FFFCF4",      // white paper card
  cardBrd: "#E3D8BB",
  ink: "#33302B",       // graphite
  margin: "#E4572E",    // exercise-book red margin rule
  board: "#1E6B4F",     // chalkboard green
  boardDark: "#15513B",
  chalk: "#FBF4E3",
  gold: "#F0B429",
  coral: "#D9483A",
  mint: "#1F9D6E",
  sky: "#3B82C4",
  wood: "#C89B5A",      // chalkboard frame / abacus rods
  woodDark: "#A96F3A",
};

/* ---------- Abacus mascot ----------
   Design lives in a 1024×1024 box. The mascot itself spans roughly
   x:[170, 854] y:[230, 794]. `mono` renders a solid silhouette. */
function abacus(mono) {
  const c = mono
    ? { card: "#ffffff", cardBrd: "#ffffff", margin: "#ffffff", frame: "#ffffff",
        inner: "#ffffff", rod: "#ffffff", beads: ["#ffffff", "#ffffff", "#ffffff", "#ffffff"],
        face: "#ffffff", eye: "#ffffff", blush: "#ffffff", smile: "#ffffff" }
    : { card: P.card, cardBrd: P.cardBrd, margin: P.margin, frame: P.wood,
        inner: "#FBF6E9", rod: P.woodDark,
        beads: [P.gold, P.mint, P.sky, P.coral],
        face: P.card, eye: P.ink, blush: P.margin, smile: P.ink };

  const bead = (x, y, col) => `
    <circle cx="${x}" cy="${y}" r="30" fill="${col}"/>
    ${mono ? "" : `<ellipse cx="${x - 9}" cy="${y - 11}" rx="10" ry="6" fill="#ffffff" opacity="0.5" transform="rotate(-22 ${x - 9} ${y - 11})"/>`}`;

  const rows = [400, 512, 624];                       // three rods
  const leftX = [348, 396], rightX = [628, 676];      // two beads per side

  return `
  <g>
    ${mono ? "" : `<rect x="170" y="246" width="684" height="564" rx="80" fill="#15513B" opacity="0.18"/>`}
    <rect x="170" y="230" width="684" height="564" rx="80" fill="${c.card}" stroke="${c.cardBrd}" stroke-width="8"/>
    <rect x="206" y="282" width="26" height="460" rx="13" fill="${c.margin}"/>
    <rect x="258" y="286" width="508" height="452" rx="44" fill="none" stroke="${c.frame}" stroke-width="24"/>
    <rect x="288" y="316" width="448" height="392" rx="30" fill="${c.inner}"/>
    ${rows.map(y => `<line x1="318" y1="${y}" x2="706" y2="${y}" stroke="${c.rod}" stroke-width="10" stroke-linecap="round"/>`).join("")}
    ${rows.map((y, ri) =>
      leftX.map((x, bi) => bead(x, y, c.beads[(ri * 2 + bi) % 4])).join("") +
      rightX.map((x, bi) => bead(x, y, c.beads[(ri * 2 + bi + 1) % 4])).join("")
    ).join("")}
    <circle cx="512" cy="512" r="88" fill="${c.face}" stroke="${c.frame}" stroke-width="10"/>
    <circle cx="484" cy="500" r="13" fill="${c.eye}"/>
    <circle cx="540" cy="500" r="13" fill="${c.eye}"/>
    ${mono ? "" : `<circle cx="478" cy="492" r="4.5" fill="#ffffff"/>
    <circle cx="534" cy="492" r="4.5" fill="#ffffff"/>`}
    <circle cx="462" cy="522" r="11" fill="${c.blush}" opacity="${mono ? 0 : 0.45}"/>
    <circle cx="562" cy="522" r="11" fill="${c.blush}" opacity="${mono ? 0 : 0.45}"/>
    <path d="M494 528 Q 512 546 530 528" fill="none" stroke="${c.smile}" stroke-width="8" stroke-linecap="round"/>
  </g>`;
}

/* ---------- Chalk math symbols (drawn as strokes, no font needed) ---------- */
function chalkSym(kind, x, y, rot, mono) {
  const col = mono ? "#ffffff" : P.chalk;
  const w = 24;
  const bar = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
  let body = "";
  if (kind === "div") {
    body = bar(x - 70, y, x + 70, y) +
      `<circle cx="${x - 90}" cy="${y - 100}" r="24" fill="${col}"/><circle cx="${x + 90}" cy="${y + 100}" r="24" fill="${col}"/>`;
  } else if (kind === "times") {
    body = bar(x - 70, y - 70, x + 70, y + 70) + bar(x + 70, y - 70, x - 70, y + 70);
  } else if (kind === "plus") {
    body = bar(x - 70, y, x + 70, y) + bar(x, y - 70, x, y + 70);
  } else if (kind === "minus") {
    body = bar(x - 70, y, x + 70, y);
  }
  return `<g transform="rotate(${rot} ${x} ${y})">${body}</g>`;
}

/* Chalk dust specks on the board */
function dust(mono) {
  if (mono) return "";
  const spots = [[150, 340, 6], [880, 300, 8], [160, 700, 5], [900, 760, 7], [720, 120, 5], [300, 900, 6], [640, 940, 5], [120, 120, 4], [920, 560, 5], [420, 110, 4]];
  return spots.map(s => `<circle cx="${s[0]}" cy="${s[1]}" r="${s[2]}" fill="#ffffff" opacity="0.07"/>`).join("");
}

/* ---------- Board backdrop (chalkboard + wood frame) ---------- */
function board(mono) {
  if (mono) return "";
  return `
  <defs>
    <linearGradient id="board" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P.board}"/>
      <stop offset="1" stop-color="${P.boardDark}"/>
    </linearGradient>
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${P.wood}"/>
      <stop offset="1" stop-color="${P.woodDark}"/>
    </linearGradient>
    <radialGradient id="sheen" cx="0.3" cy="0.25" r="0.9">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#board)"/>
  <rect width="1024" height="1024" fill="url(#sheen)"/>
  <rect x="56" y="56" width="912" height="912" rx="200" fill="url(#wood)"/>
  <rect x="96" y="96" width="832" height="832" rx="168" fill="url(#board)"/>
  ${dust()}`;
}

function svg(bg, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${bg || ""}${body}</svg>`;
}

/* Place the mascot centered with a given scale (0.92 ≈ 66% safe zone) */
function mascotAt(s, mono) {
  return `<g transform="translate(512 512) scale(${s}) translate(-512 -512)">${abacus(mono)}</g>`;
}

const icon = svg(board(), mascotAt(1, false) +
  chalkSym("div", 205, 195, -10) + chalkSym("times", 819, 195, 8) +
  chalkSym("plus", 205, 829, 6) + chalkSym("minus", 819, 829, -6));
const foreground = svg("", mascotAt(0.92, false));
const monochrome = svg("", mascotAt(0.92, true));
const background = svg(board(), "");
const splash = svg("", mascotAt(1.0, false));
const favicon = icon;

async function render(s, size, file) {
  await sharp(Buffer.from(s)).resize(size, size).png().toFile(file);
  console.log(`✓ ${path.basename(file)} (${size}px)`);
}

(async () => {
  await render(icon, 1024, path.join(OUT, "icon.png"));
  await render(foreground, 1024, path.join(OUT, "android-icon-foreground.png"));
  await render(background, 1024, path.join(OUT, "android-icon-background.png"));
  await render(monochrome, 1024, path.join(OUT, "android-icon-monochrome.png"));
  await render(splash, 1024, path.join(OUT, "splash-icon.png"));
  await render(favicon, 64, path.join(OUT, "favicon.png"));
  console.log("Done — assets written to assets/");
})().catch(e => { console.error(e); process.exit(1); });
