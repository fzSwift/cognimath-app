/* Node stub for expo-secure-store — never invoked by the parity trace
   (vault functions are only called on real devices), just needs to exist
   so the bundle loads without the native module. Named exports required:
   vault.js uses `import * as SecureStore from "expo-secure-store"`. */
export const getItemAsync = async () => null;
export const setItemAsync = async () => {};
export const deleteItemAsync = async () => {};
export default { getItemAsync, setItemAsync, deleteItemAsync };
