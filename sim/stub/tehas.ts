// The stub of the `tehas` module, for the simulator and the tests, on the
// author's machine only. The one owner of the stub: bin/sim and tests/ both
// use it, so they cannot drift apart.
//
// TODO(#3297): replace with tehas's fakes. tehas-factory#3297 adds the
// generated tehas.d.ts, the fakes and `tehas plugin test`.
//
// It is not tehas's fake. It answers only the calls the driver makes, with
// the shapes spec v2 parts 1.1 and 5 give them: fs.read(path) and
// fs.write(path, bytes), which throw on a refusal, wasm.load(name) for a
// module the manifest lists, and log(line). Nothing else exists here.
// /out is always writable; /state stands for the grant keep. A `feed:<name>`
// or `live:<name>` input is read-only at /feed/<name>.json or
// /live/<name>.json (floating spec part 5: tehas writes
// the input, and the plugin reads it with fs.read; the path is proposed in
// tehas-factory#3372). The tests and the simulator put a feed in
// stand.files before a run.
import fs_ from "node:fs";
import path from "node:path";
import { root } from "../root.ts";
import { stand } from "./state.ts";

const INPUT = /^\/(feed|live)\/([a-z-]{1,16})\.json$/;

/** The grants the run has: stand.asks when a test sets them, else the manifest's. */
function asks(): string[] {
  return stand.asks ?? manifestAsks();
}

/** The grants the manifest in `dir` asks for. */
export function manifestAsks(dir = root): string[] {
  const manifest = JSON.parse(fs_.readFileSync(path.join(dir, "tehas-plugin.json"), "utf8")) as { asks?: string[] };
  return manifest.asks ?? [];
}

/** Throws unless the run may touch `path`: /out always, /state with keep. Each refusal names why. */
function refuse(path: string): void {
  if (path.includes("..")) throw new Error(`not granted: ${path} has ..`);
  if (path.startsWith("/out/")) return;
  if (path.startsWith("/state/")) {
    if (!asks().includes("keep")) throw new Error(`not granted: ${path} needs keep`);
    return;
  }
  throw new Error(`not granted: ${path} is outside /out, /state and the inputs`);
}

export const fs = {
  read(path: string): Uint8Array {
    const inputOf = INPUT.exec(path);
    if (inputOf) {
      // An input says which of three it is, so a test that passes knows it
      // read an input that was there: not granted, granted but with nothing
      // behind it (the operator has none), or the input.
      const grant = `${inputOf[1]}:${inputOf[2]}`;
      if (!asks().includes(grant)) throw new Error(`not granted: ${path} needs ${grant}`);
      const data = stand.files.get(path);
      if (!data) throw new Error(`no input: ${path}; the stub has nothing behind ${grant} (set it in stand.files)`);
      return data;
    }
    refuse(path);
    const data = stand.files.get(path);
    if (!data) throw new Error(`not found: ${path}`);
    return data;
  },
  write(path: string, data: Uint8Array): void {
    if (INPUT.test(path)) throw new Error(`not granted: ${path} is an input, read-only`);
    refuse(path);
    if (stand.refuseWrites) throw new Error(stand.refuseWrites);
    stand.files.set(path, data);
  },
};

export function log(line: string): void {
  stand.logs.push(line);
}

type Call = (...args: number[]) => number;

export const wasm = {
  /** A fresh instance of the listed module; numbers pass as they are. */
  load(name: string): Readonly<Record<string, Call>> {
    const manifest = JSON.parse(fs_.readFileSync(path.join(root, "tehas-plugin.json"), "utf8")) as { wasm?: Record<string, { path: string }> };
    const entry = manifest.wasm?.[name];
    if (!entry) throw new Error(`not granted: wasm ${name} is not in the manifest`);
    const instance = new WebAssembly.Instance(new WebAssembly.Module(fs_.readFileSync(path.join(root, entry.path))), {});
    const calls: Record<string, Call> = {};
    for (const [k, f] of Object.entries(instance.exports)) {
      if (typeof f === "function" && !k.startsWith("_")) calls[k] = (...args) => (f as Call)(...args);
    }
    return calls;
  },
};
