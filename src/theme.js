/* ============================================================
   CogniMath — theme.js (The Workbook)
   Design identity: a school exercise book come alive.
   Light grid-paper canvas, graphite ink, the red margin rule,
   and a chalkboard-green "board voice" for the mascot/teacher.
   ============================================================ */

export const C = {
  // paper system
  paper: "#F5EEDD",      // notebook page
  card: "#FFFCF4",       // white paper card
  cardBrd: "#E3D8BB",    // pencil-tan border
  ink: "#33302B",        // graphite text
  muted: "#8A7F6A",      // soft pencil grey
  margin: "#E4572E",     // the exercise-book red margin rule
  // chalkboard voice
  board: "#1E6B4F",      // chalkboard green
  boardDark: "#15513B",
  chalk: "#FBF4E3",      // chalk on the board
  // accents (deepened for contrast on paper)
  gold: "#F0B429",
  coral: "#D9483A",
  mint: "#1F9D6E",
  sky: "#3B82C4",
  violet: "#7C5DFA",
  orange: "#E8871E",
  darkInk: "#2E2413",    // dark text on gold/chalk buttons
  // kept token names for back-compat
  bg: "#F5EEDD",
  panel: "#F5EEDD",
  txt: "#33302B",
  // topic gradient tints (light versions)
  goldGrad: ["#F0B429", "#E8871E"],
  primaryGrad: ["#F0B429", "#E4572E"],
  tile: "#FFFCF4",
  tileBrd: "#E3D8BB",
};

/* Tileable squared-paper grid (16px, soft graphite lines) */
export const GRID =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAH0lEQVR4nGNgoAAYG2jLUaJ/1IBRA0YNoKoBIIISDAD4mxTVrL0ypQAAAABJRU5ErkJggg==";

export const FONT = {
  display: "PatrickHand_400Regular", // handwritten — hero/eyebrows only
  head: "Baloo2_700Bold",
  headBold: "Baloo2_800ExtraBold",
  headSemi: "Baloo2_600SemiBold",
  body: "Nunito_700Bold",
  bodyBold: "Nunito_800ExtraBold",
};

export const RADIUS = 20;

export const shadow = {
  shadowColor: "#33302B",
  shadowOpacity: 0.12,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

export const cardStyle = {
  backgroundColor: C.card,
  borderColor: C.cardBrd,
  borderWidth: 1,
  borderRadius: RADIUS,
};
