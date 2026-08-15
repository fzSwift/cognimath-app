/* ============================================================
   CogniMath — layout.js
   One window-size hook so screens reflow on phones, tablets,
   landscape, and the web desk — instead of a 430px phone shell.
   ============================================================ */

import { useWindowDimensions } from "react-native";

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const compact = width < 380 || height < 520;
  const tablet = width >= 700;
  const wide = width >= 960;
  const landscape = width > height && height < 640;
  const pageMax = wide ? 880 : tablet ? 740 : width;
  const pad = compact ? 12 : tablet ? 22 : 16;
  const topicCols = width >= 700 ? 4 : 2;
  const badgeCols = width >= 900 ? 4 : width >= 560 ? 3 : 2;
  return { width, height, compact, tablet, wide, landscape, pageMax, pad, topicCols, badgeCols };
}

/* Percent width that still wraps cleanly with a 12px gap. */
export function colStyle(cols) {
  const pct = cols >= 4 ? "23%" : cols === 3 ? "31%" : "47%";
  return { width: pct, flexGrow: 1, minWidth: cols >= 4 ? 148 : cols === 3 ? 140 : 132 };
}
