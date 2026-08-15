/* ============================================================
   CogniMath — Charts.js (Expo port)
   Tiny dependency-free SVG chart components (react-native-svg)
   for the teacher dashboard.
   ============================================================ */

import React from "react";
import { Text, View } from "react-native";
import Svg, {
  Circle, G, Line, Polyline, Rect, Text as SvgText,
} from "react-native-svg";
import { C } from "../theme";

const W = 340, H = 200, PAD = { l: 40, r: 12, t: 16, b: 40 };

/* Donut / progress ring */
export function Donut({ percent, size = 140, color = C.mint, track = "rgba(51,48,43,0.12)" }) {
  const r = (size - 14) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(1, percent));
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={13} />
      <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={13}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </G>
    </Svg>
  );
}

function ticks(m, ih, iw) {
  const els = [];
  [0, 0.5, 1].forEach(f => {
    const y = PAD.t + ih - f * ih;
    els.push(<Line key={`gl-${f}`} x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="rgba(51,48,43,0.12)" />);
    els.push(<SvgText key={`gt-${f}`} x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#8A7F6A" fontWeight="700">{Math.round(m * f)}</SvgText>);
  });
  return els;
}

/* Vertical grouped bars */
export function Bars({ labels, values, colors, max, unit = "" }) {
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const m = max || Math.max(...values) * 1.15;
  const bw = Math.min(36, (iw / values.length) * 0.55);
  const step = iw / values.length;
  return (
    <Svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ height: H }}>
      <Line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + ih} stroke="rgba(51,48,43,0.25)" />
      {ticks(m, ih, iw)}
      {values.map((v, i) => {
        const x = PAD.l + i * step + (step - bw) / 2;
        const bh = (v / m) * ih;
        const y = PAD.t + ih - bh;
        const lx = PAD.l + i * step + step / 2;
        return (
          <G key={i}>
            <Rect x={x} y={y} width={bw} height={bh} rx={6} fill={colors[i] || C.sky} />
            {String(labels[i]).split("\n").map((ln, k) => (
              <SvgText key={k} x={lx} y={PAD.t + ih + 16 + k * 12} textAnchor="middle" fontSize={8.5}
                fill="#8A7F6A" fontWeight="700">{ln}</SvgText>
            ))}
          </G>
        );
      })}
    </Svg>
  );
}

/* Line chart with two series (pre vs post) */
export function Lines({ labels, series }) {
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const all = series.flatMap(s => s.values);
  const m = Math.max(...all) * 1.12;
  const step = iw / Math.max(1, labels.length - 1);
  const px = i => PAD.l + i * step;
  const py = v => PAD.t + ih - (v / m) * ih;
  return (
    <Svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ height: H }}>
      <Line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + ih} stroke="rgba(51,48,43,0.25)" />
      {ticks(m, ih, iw)}
      {series.map(s => (
        <G key={s.name}>
          <Polyline points={s.values.map((v, i) => `${px(i)},${py(v)}`).join(" ")} fill="none"
            stroke={s.color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          {s.values.map((v, i) => (
            <Circle key={i} cx={px(i)} cy={py(v)} r={4.5} fill={s.color} />
          ))}
        </G>
      ))}
      {labels.map((l, i) => (
        <SvgText key={i} x={px(i)} y={PAD.t + ih + 18} textAnchor="middle" fontSize={9}
          fill="#8A7F6A" fontWeight="700">{l}</SvgText>
      ))}
    </Svg>
  );
}

/* Scatter plot: accuracy vs attempts per student */
export function Scatter({ points, xLabel, yLabel }) {
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const maxX = 45, maxY = 100;
  const px = x => PAD.l + (x / maxX) * iw;
  const py = y => PAD.t + ih - (y / maxY) * ih;
  return (
    <Svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ height: H }}>
      <Line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + ih} stroke="rgba(51,48,43,0.25)" />
      <Line x1={PAD.l} y1={PAD.t + ih} x2={W - PAD.r} y2={PAD.t + ih} stroke="rgba(51,48,43,0.25)" />
      {[0, 50, 100].map(f => {
        const y = PAD.t + ih - (f / maxY) * ih;
        return (
          <G key={f}>
            <Line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="rgba(51,48,43,0.12)" />
            <SvgText x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#8A7F6A" fontWeight="700">{f}</SvgText>
          </G>
        );
      })}
      {points.map((p, i) => (
        <Circle key={i} cx={px(p.x)} cy={py(p.y)} r={6} fill={p.color || C.sky} stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} />
      ))}
      <SvgText x={W / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="#8A7F6A" fontWeight="700">{xLabel} →</SvgText>
      <SvgText x={14} y={H / 2} textAnchor="middle" fontSize={9} fill="#8A7F6A" fontWeight="700" rotation={-90} origin={`14, ${H / 2}`}>{yLabel}</SvgText>
    </Svg>
  );
}

/* Legend row used under line charts */
export function Legend({ items }) {
  return (
    <View style={{ flexDirection: "row", gap: 16, justifyContent: "center", marginTop: 8 }}>
      {items.map(it => (
        <View key={it.name} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: it.color }} />
          <Text style={{ fontSize: 11, color: C.muted, fontWeight: "800" }}>{it.name}</Text>
        </View>
      ))}
    </View>
  );
}
