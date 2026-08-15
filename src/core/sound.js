/* ============================================================
   CogniMath — core/sound.js
   Game sound effects via expo-audio. Every call is a safe no-op
   when audio isn't available (e.g. a platform without expo-audio
   support) and respects the persisted mute toggle.
   ============================================================ */

import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { loadSave, persist } from "./engine";

const SOURCES = {
  correct: require("../../assets/sounds/correct.wav"),
  combo: require("../../assets/sounds/combo.wav"),
  wrong: require("../../assets/sounds/wrong.wav"),
  click: require("../../assets/sounds/click.wav"),
  win: require("../../assets/sounds/win.wav"),
  badge: require("../../assets/sounds/badge.wav"),
};

let players = {};
function player(name) {
  if (!players[name]) players[name] = createAudioPlayer(SOURCES[name]);
  return players[name];
}

/* Respect the iOS mute switch — school devices are often silenced. */
export function initSound() {
  try { setAudioModeAsync({ playsInSilentMode: false }).catch(() => {}); } catch (e) { /* not supported */ }
}

export function isSoundOn() {
  return loadSave().soundOn !== false;
}

export function setSoundOn(v) {
  loadSave().soundOn = !!v;
  persist();
}

export function playFx(name) {
  try {
    if (!isSoundOn()) return;
    const p = player(name);
    p.seekTo(0);
    p.play().catch(() => {}); // e.g. autoplay blocked on web
  } catch (e) { /* audio unavailable on this platform */ }
}
