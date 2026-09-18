/**
 * Ambient augmentation for `@firebase/auth`.
 *
 * `getReactNativePersistence` is real and exists at runtime — Metro correctly
 * resolves it through the package's "react-native" conditional export. But
 * TypeScript's own declaration resolution always includes a "types" condition,
 * and `@firebase/auth`'s package.json lists "types" before "react-native" in
 * its exports map, so the generic (non-RN) declaration file wins regardless of
 * `customConditions` in tsconfig.json — this is an ordering quirk in the
 * package itself, not something project config can route around.
 *
 * This augments the module TypeScript *does* resolve with the one signature
 * missing from it, copied from `dist/rn/src/platform_react_native/persistence/react_native.d.ts`.
 * Delete this file if a future `@firebase/auth` release reorders its exports
 * map (check that `getReactNativePersistence` type-checks without it first).
 *
 * The `export {}` below is load-bearing: without it, this file has no
 * top-level import/export and TypeScript treats the block as a global ambient
 * declaration that *replaces* the module everywhere it is referenced —
 * including inside `firebase/auth`'s own `export * from '@firebase/auth'` —
 * wiping out every other export instead of adding to them. With it, TS treats
 * this as a proper module augmentation that merges with the real module.
 */
export {};

declare module '@firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
