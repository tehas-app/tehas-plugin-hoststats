// Makes dist/ from src/, as bin/build's Node half. Runs on the author's
// machine or in CI, never in the plugin.
//
// - src/driver/*.ts: TypeScript 7's tsc checks the types and writes readable
//   ES2023 to dist/driver/.
// - src/view/*.ts and *.tsx: tsc checks the types and writes build/view/,
//   keeping the JSX (tsc has no Solid transform). Solid 2's compiler, through
//   Babel (@solidjs/babel-plugin, DOM mode, ESM), turns each .jsx there into
//   dist/view/*.js.
// - src/view/*.html and *.css: copied as is.
//
// A type error stops the build (noEmitOnError).
//
// Then it checks dist/ the way spec v2 part 3 vets it, as far as a builder
// can: no minified lines, no eval, no source maps, and imports only from the
// allowed places, and nothing from sim/ or tests/. TODO(#3301): `tehas
// plugin check` replaces this check.
//
// Nothing is minified or bundled, so dist/ reads like src/.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { transformSync } from "@babel/core";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");
const dist = path.join(root, "dist");

const build = path.join(root, "build");
for (const d of [path.join(dist, "driver"), path.join(dist, "view"), build]) fs.rmSync(d, { recursive: true, force: true });

const tsc = path.join(root, "node_modules", ".bin", "tsc");
for (const config of ["tsconfig.driver.json", "tsconfig.view.json"]) {
  try {
    execFileSync(tsc, ["-p", path.join(root, config)], { stdio: "inherit" });
  } catch {
    console.error(`build: tsc -p ${config} failed`);
    process.exit(1);
  }
}

const viewOut = path.join(dist, "view");
fs.mkdirSync(viewOut, { recursive: true });
for (const name of fs.readdirSync(path.join(src, "view")).sort()) {
  if (name.endsWith(".html") || name.endsWith(".css")) fs.copyFileSync(path.join(src, "view", name), path.join(viewOut, name));
}
for (const name of fs.readdirSync(path.join(build, "view")).sort()) {
  const from = path.join(build, "view", name);
  if (name.endsWith(".jsx")) {
    const out = transformSync(fs.readFileSync(from, "utf8"), {
      filename: from,
      babelrc: false,
      configFile: false,
      compact: false,
      retainLines: false,
      plugins: [["@solidjs/babel-plugin", { generate: "dom" }]],
    });
    if (!out?.code) throw new Error(`${name}: the compiler gave no output`);
    fs.writeFileSync(path.join(viewOut, name.replace(/\.jsx$/, ".js")), `${out.code}\n`);
  } else if (name.endsWith(".js")) {
    fs.copyFileSync(from, path.join(viewOut, name));
  }
}

// The checks. Each rule is spec v2 part 3's; the limit is its 1,000.
const problems = [];
const IMPORT = /^\s*(?:import|export)\b[^'"]*?from\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/gm;
// Code that can reach what the import rules forbid, refused wherever it is,
// comments included: nothing is let through for being hard to read.
const REFUSED = [
  { pattern: /\bimport\s*\((?!\s*["'][^"'\\]*["']\s*\))/, what: "a dynamic import of anything but a string literal", where: ["driver", "view"] },
  { pattern: /\brequire\s*\(/, what: "require(", where: ["driver", "view"] },
  { pattern: /\beval\b/, what: "eval", where: ["driver", "view"] },
  { pattern: /\bFunction\s*\(/, what: "Function( or new Function(", where: ["driver", "view"] },
  { pattern: /\bglobalThis\b/, what: "globalThis: a driver looks nothing up by name", where: ["driver"] },
];
const allowed = {
  driver: (spec) => spec === "tehas" || spec.startsWith("./"),
  view: (spec) => spec === "solid-js" || spec === "@solidjs/web" || spec.startsWith("./"),
};
/** Every file under `dir` at any depth, as paths relative to it. A link is never followed: it is a problem. */
function walk(dir, rel = "") {
  const out = [];
  for (const name of fs.readdirSync(path.join(dir, rel)).sort()) {
    const r = rel ? `${rel}/${name}` : name;
    const st = fs.lstatSync(path.join(dir, r));
    if (st.isSymbolicLink()) problems.push(`${path.relative(root, path.join(dir, r))}: a link; make it a plain file`);
    else if (st.isDirectory()) out.push(...walk(dir, r));
    else out.push(r);
  }
  return out;
}
for (const part of Object.keys(allowed)) {
  for (const name of walk(path.join(dist, part))) {
    if (!name.endsWith(".js")) continue;
    const file = `dist/${part}/${name}`;
    const text = fs.readFileSync(path.join(dist, part, name), "utf8");
    text.split("\n").forEach((l, i) => {
      if (l.length > 1000) problems.push(`${file}:${i + 1}: a line over 1,000 characters`);
      for (const r of REFUSED) if (r.where.includes(part) && r.pattern.test(l)) problems.push(`${file}:${i + 1}: ${r.what}`);
    });
    if (/sourceMappingURL/.test(text)) problems.push(`${file}: a source map`);
    if (/["'][^"']*\b(sim|tests)\//.test(text)) problems.push(`${file}: names sim/ or tests/, which are development only`);
    for (const m of text.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (!allowed[part](spec)) problems.push(`${file}: imports ${spec}`);
    }
  }
}
if (problems.length) {
  for (const p of problems) console.error(`build: ${p}`);
  process.exit(1);
}
console.log("build: dist/ made from src/ and checked");
