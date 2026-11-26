// The author's utilities in bin/: reset removes only what it lists, its
// --dry-run changes nothing, and build makes dist/ from a clean tree with
// nothing of sim/ in it.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { root } from "../sim/root.ts";
import { copyTree, gitInit, linkTools, remove } from "./tree.ts";

const put = (dir: string, f: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
  fs.writeFileSync(path.join(dir, f), "x");
};
const has = (dir: string, f: string) => fs.existsSync(path.join(dir, f));
const reset = (dir: string, ...args: string[]) => execFileSync("bash", [path.join(dir, "bin", "reset"), ...args], { cwd: dir, encoding: "utf8" });

test("bin/reset --dry-run prints what it would remove and removes nothing", () => {
  const dir = copyTree();
  try {
    put(dir, "node_modules/a/index.js");
    put(dir, "test-results/out.txt");
    const out = reset(dir, "--dry-run");
    assert.match(out, /would remove dist\//);
    assert.match(out, /would remove node_modules\//);
    assert.match(out, /would remove test-results\//);
    for (const f of ["dist/driver/main.js", "node_modules/a/index.js", "test-results/out.txt"]) assert.ok(has(dir, f), f);
  } finally {
    remove(dir);
  }
});

test("bin/reset removes the listed paths and leaves the rest", () => {
  const dir = copyTree();
  try {
    put(dir, "node_modules/a/index.js");
    put(dir, "notes.local");
    const out = reset(dir);
    assert.match(out, /removed dist\//);
    assert.match(out, /removed node_modules\//);
    assert.doesNotMatch(out, /test-results/, "it names only what was there");
    assert.ok(!has(dir, "dist") && !has(dir, "node_modules"));
    for (const f of ["notes.local", "src/driver/main.ts", "sim/scenarios/ok.json", "package.json", "bin/reset"]) assert.ok(has(dir, f), f);
  } finally {
    remove(dir);
  }
});

test("bin/build makes dist/ from a clean tree, the same as this tree's dist/, with no sim/ in it", () => {
  const dir = copyTree((f) => f.startsWith("dist/"));
  try {
    linkTools(dir);
    assert.ok(!has(dir, "dist"));
    execFileSync("bash", [path.join(dir, "bin", "build")], { cwd: dir, encoding: "utf8" });
    // This tree's dist/ as it is on disk, committed or not: a new plugin's
    // first build is not committed yet.
    const here = fs.readdirSync(path.join(root, "dist"), { recursive: true, encoding: "utf8" }).filter((f) => fs.statSync(path.join(root, "dist", f)).isFile());
    assert.ok(here.length > 0);
    for (const f of here) assert.ok(fs.readFileSync(path.join(dir, "dist", f)).equals(fs.readFileSync(path.join(root, "dist", f))), f);
    const built = fs.readdirSync(path.join(dir, "dist"), { recursive: true, encoding: "utf8" });
    assert.ok(!built.some((f) => /(^|\/)sim(\/|$)|stub/.test(f)), "a file of sim/ in dist/");
    for (const f of built.filter((x) => x.endsWith(".js"))) {
      assert.doesNotMatch(fs.readFileSync(path.join(dir, "dist", f), "utf8"), /["'][^"']*\bsim\//, `${f} imports from sim/`);
    }
  } finally {
    remove(dir);
  }
});

// Code that reaches past the import rules, each form once.
const SNEAKY = `const m = "node" + ":fs";
export const a = import(m);
declare const require: (s: string) => unknown;
export const b = require("node:fs");
export const c = eval("1");
export const d = Function("return 1");
export const e = (globalThis as unknown as Record<string, unknown>)["process"];
`;

test("bin/build refuses a computed import, require, eval, Function and globalThis in the driver", () => {
  const dir = copyTree();
  try {
    linkTools(dir);
    fs.writeFileSync(path.join(dir, "src/driver/sneaky.ts"), SNEAKY);
    const r = spawnSync("bash", [path.join(dir, "bin", "build")], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    for (const what of [
      "a dynamic import of anything but a string literal",
      "require(",
      "eval",
      "Function( or new Function(",
      "globalThis: a driver looks nothing up by name",
    ]) {
      assert.ok(r.stderr.includes(`dist/driver/sneaky.js:`) && r.stderr.includes(`: ${what}`), `${what}\n${r.stderr}`);
    }
  } finally {
    remove(dir);
  }
});

test("the architecture test refuses the same forms in src/, and global state", () => {
  const dir = copyTree();
  try {
    fs.writeFileSync(path.join(dir, "src/driver/sneaky.ts"), `${SNEAKY}export let f = 1;\n`);
    gitInit(dir);
    const r = spawnSync("python3", ["-I", "scripts/architecture.py"], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    for (const id of ["computed-import", "no-eval", "driver-global-lookup", "global-state"]) {
      assert.match(r.stdout + r.stderr, new RegExp(`${id} \\(R\\d+\\): \\d+ places, 0 allowed`), id);
    }
  } finally {
    remove(dir);
  }
});

test("bin/build checks a driver module in a subfolder too", () => {
  const dir = copyTree();
  try {
    linkTools(dir);
    fs.mkdirSync(path.join(dir, "src/driver/util"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src/driver/util/bad.ts"), 'export const c = eval("1");\n');
    const r = spawnSync("bash", [path.join(dir, "bin", "build")], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(r.stderr.includes("dist/driver/util/bad.js:1: eval"), r.stderr);
  } finally {
    remove(dir);
  }
});
