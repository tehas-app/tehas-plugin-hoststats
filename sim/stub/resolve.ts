// The resolve hook that register.ts installs: `tehas` resolves to the stub.
// This plugin calls no other host function, so nothing else is swapped.
// TODO(#3297): goes with the stub.
import type { ResolveHook } from "node:module";

const TEHAS = new URL("./tehas.js", import.meta.url).href;

export const resolve: ResolveHook = async (specifier, _context, next) => {
  if (specifier === "tehas") return { url: TEHAS, shortCircuit: true };
  return next(specifier);
};
