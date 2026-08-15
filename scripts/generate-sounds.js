/* ============================================================
   CogniMath — generate-sounds.js
   Synthesizes the game's sound effects as 16-bit PCM WAV files,
   matching the tones of the web app's WebAudio AudioFX.
   Usage:  node scripts/generate-sounds.js
   ============================================================ */

const fs = require("fs");
const path = require("path");

const SR = 44100;
const OUT = path.join(__dirname, "..", "assets", "sounds");
fs.mkdirSync(OUT, { recursive: true });

function writeWav(file, samples) {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);      // fmt chunk size
  buf.writeUInt16LE(1, 20);       // PCM
  buf.writeUInt16LE(1, 22);       // mono
  buf.writeUInt32LE(SR, 24);      // sample rate
  buf.writeUInt32LE(SR * 2, 28);  // byte rate
  buf.writeUInt16LE(2, 32);       // block align
  buf.writeUInt16LE(16, 34);      // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.max(-1, Math.min(1, samples[i])) * 32767 | 0, 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  console.log(`✓ ${path.basename(file)} (${(dataLen / 1024).toFixed(1)} KB, ${(samples.length / SR).toFixed(2)}s)`);
}

/* One note with an exponential decay envelope */
function tone(freq, dur, type = "tri", gain = 0.5, decay = 7) {
  const n = Math.floor(SR * dur);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v;
    if (type === "tri") v = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * freq * t));
    else if (type === "saw") v = 2 * ((freq * t) % 1) - 1;
    else v = Math.sin(2 * Math.PI * freq * t);
    out[i] = v * gain * Math.exp(-decay * t);
  }
  return out;
}

/* Mix a schedule of notes into one buffer */
function seq(notes) {
  const len = Math.max(...notes.map(s => s.start + s.dur)) + 0.05;
  const buf = new Float64Array(Math.ceil(len * SR));
  for (const s of notes) {
    const t = tone(s.freq, s.dur, s.type || "tri", s.gain || 0.5, s.decay || 7);
    const off = Math.floor(s.start * SR);
    for (let i = 0; i < t.length && off + i < buf.length; i++) buf[off + i] += t[i];
  }
  // soft clip to keep the mix from popping
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i]);
  return buf;
}

/* ---------------- the six effects (matching web AudioFX) ---------------- */

// correct: C5 + E5 (soft triangle chime)
const correct = seq([
  { freq: 523.25, dur: 0.14, start: 0.0, gain: 0.45 },
  { freq: 659.25, dur: 0.18, start: 0.09, gain: 0.45 },
]);

// combo (streak ≥ 3): correct + G5 + C6 fanfare
const combo = seq([
  { freq: 523.25, dur: 0.14, start: 0.0, gain: 0.45 },
  { freq: 659.25, dur: 0.18, start: 0.09, gain: 0.45 },
  { freq: 783.99, dur: 0.18, start: 0.18, gain: 0.4 },
  { freq: 1046.5, dur: 0.26, start: 0.27, gain: 0.4 },
]);

// wrong: low sawtooth buzz
const wrong = seq([
  { freq: 180, dur: 0.24, start: 0.0, type: "saw", gain: 0.16, decay: 10 },
]);

// click: tiny UI tick
const click = seq([
  { freq: 440, dur: 0.06, start: 0.0, gain: 0.3, decay: 24 },
]);

// win: major arpeggio C5 E5 G5 C6 E6
const win = seq([523.25, 659.25, 783.99, 1046.5, 1318.5].map((f, i) => ({
  freq: f, dur: 0.26, start: i * 0.11, gain: 0.42,
})));

// badge: quick triplet 660 880 990
const badge = seq([660, 880, 990].map((f, i) => ({
  freq: f, dur: 0.18, start: i * 0.09, gain: 0.4,
})));

writeWav(path.join(OUT, "correct.wav"), correct);
writeWav(path.join(OUT, "combo.wav"), combo);
writeWav(path.join(OUT, "wrong.wav"), wrong);
writeWav(path.join(OUT, "click.wav"), click);
writeWav(path.join(OUT, "win.wav"), win);
writeWav(path.join(OUT, "badge.wav"), badge);
console.log("Done — sounds written to assets/sounds/");
