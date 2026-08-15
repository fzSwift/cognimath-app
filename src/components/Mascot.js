/* ============================================================
   CogniMath — Mascot.js
   The abacus mascot from the app icon (scripts/generate-assets.js)
   as an inline react-native-svg, so branding matches the icon and
   teacher-web's Mascot.jsx exactly (same 1024 design box).
   ============================================================ */

import React from "react";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

export default function Mascot({ size = 64, style }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" style={style} accessibilityLabel="CogniMath abacus mascot">
      <Rect x="170" y="246" width="684" height="564" rx="80" fill="#15513B" opacity="0.18" />
      <Rect x="170" y="230" width="684" height="564" rx="80" fill="#FFFCF4" stroke="#E3D8BB" strokeWidth="8" />
      <Rect x="206" y="282" width="26" height="460" rx="13" fill="#E4572E" />
      <Rect x="258" y="286" width="508" height="452" rx="44" fill="none" stroke="#C89B5A" strokeWidth="24" />
      <Rect x="288" y="316" width="448" height="392" rx="30" fill="#FBF6E9" />
      <Line x1="318" y1="400" x2="706" y2="400" stroke="#A96F3A" strokeWidth="10" strokeLinecap="round" />
      <Line x1="318" y1="512" x2="706" y2="512" stroke="#A96F3A" strokeWidth="10" strokeLinecap="round" />
      <Line x1="318" y1="624" x2="706" y2="624" stroke="#A96F3A" strokeWidth="10" strokeLinecap="round" />
      <Circle cx="348" cy="400" r="30" fill="#F0B429" />
      <Circle cx="396" cy="400" r="30" fill="#1F9D6E" />
      <Circle cx="628" cy="400" r="30" fill="#3B82C4" />
      <Circle cx="676" cy="400" r="30" fill="#D9483A" />
      <Circle cx="348" cy="512" r="30" fill="#3B82C4" />
      <Circle cx="396" cy="512" r="30" fill="#D9483A" />
      <Circle cx="628" cy="512" r="30" fill="#1F9D6E" />
      <Circle cx="676" cy="512" r="30" fill="#F0B429" />
      <Circle cx="348" cy="624" r="30" fill="#1F9D6E" />
      <Circle cx="396" cy="624" r="30" fill="#F0B429" />
      <Circle cx="628" cy="624" r="30" fill="#D9483A" />
      <Circle cx="676" cy="624" r="30" fill="#3B82C4" />
      <Circle cx="512" cy="512" r="88" fill="#FFFCF4" stroke="#C89B5A" strokeWidth="10" />
      <Circle cx="484" cy="500" r="13" fill="#33302B" />
      <Circle cx="540" cy="500" r="13" fill="#33302B" />
      <Circle cx="478" cy="492" r="4.5" fill="#ffffff" />
      <Circle cx="534" cy="492" r="4.5" fill="#ffffff" />
      <Circle cx="462" cy="522" r="11" fill="#E4572E" opacity="0.45" />
      <Circle cx="562" cy="522" r="11" fill="#E4572E" opacity="0.45" />
      <Path d="M494 528 Q 512 546 530 528" fill="none" stroke="#33302B" strokeWidth="8" strokeLinecap="round" />
    </Svg>
  );
}
