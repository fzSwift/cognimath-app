/* Node stub for react-native — the parity bundle must not load RN's
   Flow-typed ESM entry (Node throws "Unexpected token 'typeof'"). Only
   vault.js touches Platform, and only at runtime on device. */
export const Platform = { OS: "web", select: o => o.default ?? o.web };
export default { Platform };
