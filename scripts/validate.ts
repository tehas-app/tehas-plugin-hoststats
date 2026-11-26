// The static half of bin/validate: the manifest against its schema, the
// grants against what the parts use, tehas.toml, and the configuration.
// Each problem names the file, the field and what to change.
//
//   node build/js/scripts/validate.js [root]
//
// exit: 0 no problem; 1 problems, one per line on stdout.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface Problem {
  file: string;
  field: string;
  what: string;
  fix: string;
}

/** Each flag that strict sets, and the two this repository adds. */
export const STRICT_FAMILY = [
  "strict",
  "noImplicitAny",
  "strictNullChecks",
  "strictFunctionTypes",
  "strictBindCallApply",
  "strictPropertyInitialization",
  "noImplicitThis",
  "alwaysStrict",
  "useUnknownInCatchVariables",
  "noUncheckedIndexedAccess",
  "noEmitOnError",
];

/** The grants the schema knows, as a person writes them. */
export const KNOWN_GRANTS =
  "view:<id>, skill:<id>, action:<id>, keep, clock:daily@HH:MM, clock:mon-fri@HH:MM, every:<n>m, every:<n>h, product, history, model:<tokens>, model:images, viewer:login, feed:<name>, live:<name>, menu, view, model, record";

export const say = (p: Problem) => `${p.file}: ${p.field}: ${p.what}; ${p.fix}`;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Schema = { [k: string]: Json };

/** The part of JSON Schema the manifest's schema uses, and nothing more. */
export function validateSchema(v: Json, s: Schema, at: string, out: string[]): void {
  const type = s.type;
  const isObj = (x: Json): x is { [k: string]: Json } => typeof x === "object" && x !== null && !Array.isArray(x);
  if ("const" in s && JSON.stringify(v) !== JSON.stringify(s.const)) out.push(`${at}: must be ${JSON.stringify(s.const)}`);
  if (Array.isArray(s.enum) && !s.enum.some((e) => JSON.stringify(e) === JSON.stringify(v)))
    out.push(`${at}: must be one of ${s.enum.map((e) => JSON.stringify(e)).join(", ")}`);
  if (type === "string") {
    if (typeof v !== "string") return void out.push(`${at}: must be a string`);
    if (typeof s.minLength === "number" && v.length < s.minLength) out.push(`${at}: is too short`);
    if (typeof s.maxLength === "number" && v.length > s.maxLength) out.push(`${at}: is longer than ${s.maxLength}`);
    if (typeof s.pattern === "string" && !new RegExp(s.pattern, "u").test(v)) out.push(`${at}: ${JSON.stringify(v)} does not match ${s.pattern}`);
  } else if (type === "integer") {
    if (typeof v !== "number" || !Number.isInteger(v)) return void out.push(`${at}: must be a whole number`);
    if (typeof s.minimum === "number" && v < s.minimum) out.push(`${at}: is below ${s.minimum}`);
    if (typeof s.maximum === "number" && v > s.maximum) out.push(`${at}: is above ${s.maximum}`);
  } else if (type === "array") {
    if (!Array.isArray(v)) return void out.push(`${at}: must be a list`);
    if (typeof s.maxItems === "number" && v.length > s.maxItems) out.push(`${at}: has more than ${s.maxItems} items`);
    if (typeof s.minItems === "number" && v.length < s.minItems) out.push(`${at}: needs at least ${s.minItems} items`);
    if (s.uniqueItems === true && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) out.push(`${at}: has an item twice`);
    const items = s.items;
    if (isObj(items ?? null))
      v.forEach((x, i) => {
        validateSchema(x, items as Schema, `${at}[${i}]`, out);
      });
  } else if (type === "object" || isObj(s.properties ?? null) || "additionalProperties" in s) {
    if (!isObj(v)) return void out.push(`${at}: must be an object`);
    const props = isObj(s.properties ?? null) ? (s.properties as { [k: string]: Schema }) : {};
    for (const r of Array.isArray(s.required) ? s.required : []) if (typeof r === "string" && !(r in v)) out.push(`${at}.${r}: is missing`);
    for (const [k, x] of Object.entries(v)) {
      const where = at === "" ? k : `${at}.${k}`;
      const p = props[k];
      if (p) validateSchema(x, p, where, out);
      else if (s.additionalProperties === false) out.push(`${where}: is not a field of the manifest`);
      else if (isObj(s.additionalProperties ?? null)) validateSchema(x, s.additionalProperties as Schema, where, out);
    }
  }
}

// What each host call needs (spec v2 part 5). A call outside this table is
// not a host function of this spec revision.
const CALLS: { call: RegExp; name: string; needs: (asks: string[]) => boolean; grant: string }[] = [
  { call: /["'`]\/state\//, name: "fs on /state", needs: (a) => a.includes("keep"), grant: "keep" },
  { call: /\bgit\.\w+\(/, name: "git", needs: (a) => a.includes("product") || a.includes("history"), grant: "product" },
  { call: /\bmodel\.chat\(/, name: "model.chat", needs: (a) => a.some((x) => x.startsWith("model:") || x === "model"), grant: "model:<tokens>" },
];

/** Lists [check id, glob] for each architecture.toml glob that matches no file under argv[1]. */
const EMPTY_GLOBS = `
import importlib.util, json, os, subprocess, sys, tomllib
sys.dont_write_bytecode = True
root = sys.argv[1]
def fail(why):
    print(why, file=sys.stderr)
    sys.exit(1)
if not os.path.isfile(os.path.join(root, "scripts", "architecture.py")):
    fail("scripts/architecture.py is missing")
spec = importlib.util.spec_from_file_location("architecture", os.path.join(root, "scripts", "architecture.py"))
arch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(arch)
# The files architecture.py reads: git's tracked files. Outside a git
# repository (a copy in the tests) every file but the top-level .git,
# node_modules and build.
try:
    paths = arch.tracked(root)
except Exception:
    paths = []
    for d, dirs, files in os.walk(root):
        if d == root:
            dirs[:] = [x for x in dirs if x not in {".git", "node_modules", "build"}]
        paths += [os.path.relpath(os.path.join(d, f), root).replace(os.sep, "/") for f in files]
try:
    config = tomllib.load(open(os.path.join(root, "architecture.toml"), "rb"))
except (OSError, tomllib.TOMLDecodeError) as e:
    fail(f"architecture.toml: {e}")
out = []
for kind in ("check", "report"):
    for c in config.get(kind, []):
        for g in c.get("files", []):
            if not any(arch.glob_re(g).match(p) for p in paths):
                out.append([c.get("id", "?"), g])
print(json.dumps(out))
`;

/** The problems with the plugin at `root`, in the order a person fixes them. */
export function check(root: string): Problem[] {
  const out: Problem[] = [];
  const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
  const exists = (f: string) => fs.existsSync(path.join(root, f));
  const add = (file: string, field: string, what: string, fix: string) => out.push({ file, field, what, fix });

  // tehas-plugin.json
  let manifest: { [k: string]: Json } = {};
  try {
    manifest = JSON.parse(read("tehas-plugin.json")) as { [k: string]: Json };
  } catch (e) {
    add("tehas-plugin.json", "(file)", `cannot be read as JSON: ${e instanceof Error ? e.message : String(e)}`, "write valid JSON");
  }
  const schema = JSON.parse(read("schema/manifest.schema.json")) as Schema;
  const found: string[] = [];
  validateSchema(manifest, schema, "", found);
  for (const f of found) {
    const [field, ...rest] = f.split(": ");
    // A grant the schema does not know gets the list of those it does.
    if (field && /^asks\[\d+\]$/.test(field) && rest.join(": ").includes("does not match")) continue;
    add("tehas-plugin.json", field || "(top)", rest.join(": "), "change it to what schema/manifest.schema.json allows");
  }
  const asks = Array.isArray(manifest.asks) ? manifest.asks.filter((a): a is string => typeof a === "string") : [];
  const asksSchema = (schema.properties as { asks?: { items?: { pattern?: string } } } | undefined)?.asks?.items?.pattern ?? "^$";
  const KNOWN = new RegExp(asksSchema, "u");
  asks.forEach((a, i) => {
    if (!KNOWN.test(a)) add("tehas-plugin.json", `asks[${i}]`, `unknown grant "${a}"; known: ${KNOWN_GRANTS}`, "ask only for a known grant");
  });
  const views = Array.isArray(manifest.views) ? (manifest.views as { [k: string]: Json }[]) : [];
  // A skill is named by its path; its id is its folder, as `skill:<id>` asks it.
  const skills = (Array.isArray(manifest.skills) ? manifest.skills : [])
    .filter((p): p is string => typeof p === "string")
    .map((p) => ({ path: p, id: p.split("/")[1] ?? "" }));

  // Every declared part points at a file that exists.
  if (typeof manifest.driver === "string" && !exists(manifest.driver))
    add("tehas-plugin.json", "driver", `${manifest.driver} does not exist`, "run bin/build, or point it at the driver's entry in dist/driver/");
  views.forEach((v, i) => {
    if (typeof v.entry === "string" && !exists(v.entry))
      add("tehas-plugin.json", `views[${i}].entry`, `${v.entry} does not exist`, "run bin/build, or point it at the view's page in dist/view/");
  });
  for (const [i, s] of skills.entries()) {
    const field = `skills[${i}]`;
    if (!exists(s.path)) {
      add("tehas-plugin.json", field, `${s.path} does not exist`, "write the skill file, or remove the entry");
      continue;
    }
    const stat = fs.lstatSync(path.join(root, s.path));
    if (!stat.isFile()) {
      add(s.path, "(file)", "is not a regular file", "make it a plain Markdown file, not a link");
      continue;
    }
    const text = read(s.path);
    if (stat.size > 16384) add(s.path, "(file)", "is over 16 KiB", "shorten it");
    if (!/^# \S/.test(text)) add(s.path, "line 1", "does not start with a `# ` heading", "start the skill with its title as a `# ` heading");
    if (text.trim().split("\n").length < 3) add(s.path, "(file)", "has no body under its heading", "say what the skill teaches");
  }

  // WebAssembly modules (spec v2 part 1.1): listed, named, pure, in size.
  const modules =
    manifest.wasm && typeof manifest.wasm === "object" && !Array.isArray(manifest.wasm) ? (manifest.wasm as { [k: string]: { path?: Json } }) : {};
  let wasmBytes = 0;
  for (const [name, m] of Object.entries(modules)) {
    if (typeof m.path !== "string" || !exists(m.path)) {
      add("tehas-plugin.json", `wasm.${name}.path`, `${String(m.path)} does not exist`, "run bin/build, or remove the module from wasm");
      continue;
    }
    const bytes = fs.readFileSync(path.join(root, m.path));
    wasmBytes += bytes.length;
    if (bytes.length > 8 * 1024 * 1024) add(m.path, "(file)", "is over 8 MiB", "make the module smaller");
    let mod: WebAssembly.Module;
    try {
      mod = new WebAssembly.Module(bytes);
    } catch (e) {
      add(m.path, "(file)", `is not a valid module: ${e instanceof Error ? e.message : String(e)}`, "rebuild it with bin/build");
      continue;
    }
    if (WebAssembly.Module.customSections(mod, "name").length === 0)
      add(m.path, "name section", "is missing; a stripped module is refused", "build with strip = false");
    for (const i of WebAssembly.Module.imports(mod)) {
      if (!(i.module === "wasi_snapshot_preview1" || (i.module === "env" && i.name === "abort")))
        add(m.path, `import ${i.module}.${i.name}`, "is not pure compute", "import nothing, or only a null WASI preview 1 or env.abort");
    }
  }
  if (wasmBytes > 32 * 1024 * 1024) add("dist/wasm/", "(files)", "are over 32 MiB together", "make the modules smaller");

  // Grants: each declared grant used, each used call granted.
  // Every file under dist/driver/, at any depth, is read, and anything that
  // is not a .js file there is refused: a check must not be blind to a file
  // the operator would load.
  // Links are never followed: git keeps the link, not what it points at.
  // This imitates the platform's own walk (tehas-factory
  // console/attach/src/plugin_files.rs: symlink_metadata, no link followed),
  // and bin/build's walk does the same; keep the three alike.
  const driverFiles: string[] = [];
  const walk = (rel: string) => {
    for (const name of fs.readdirSync(path.join(root, "dist/driver", rel)).sort()) {
      const r = rel ? `${rel}/${name}` : name;
      const st = fs.lstatSync(path.join(root, "dist/driver", r));
      if (st.isSymbolicLink()) add(`dist/driver/${r}`, "(file)", "is a link, which no check follows", "make it a plain file");
      else if (st.isDirectory()) walk(r);
      else if (!st.isFile() || !r.endsWith(".js"))
        add(`dist/driver/${r}`, "(file)", "is not a .js module, so no check reads it and the operator won't load it", "build it to .js, or remove it");
      else driverFiles.push(r);
    }
  };
  if (fs.existsSync(path.join(root, "dist/driver"))) walk("");
  const driverText = driverFiles.map((f) => read(`dist/driver/${f}`)).join("\n");
  // Each grant the schema knows, and what uses it. A grant with no rule here
  // is refused, so a new grant needs its rule before any plugin can ask it.
  const actions = manifest.actions && typeof manifest.actions === "object" && !Array.isArray(manifest.actions) ? Object.keys(manifest.actions) : [];
  const usesGit = /\bgit\.\w+\(/.test(driverText);
  const usesModel = /\bmodel\.chat\(/.test(driverText);
  // The scope is the driver alone, on purpose: a view can't reach an input.
  // bin/build lets a view import only Solid and its own ./ files, never
  // `tehas`, and sim/stub/register.ts wires the stub's fs behind the driver
  // only, so a view's data comes over its port and nothing else.
  // Each input the driver reads, by its literal path: a feed:<name> or
  // live:<name> grant covers exactly "/feed/<name>.json" or
  // "/live/<name>.json". A path built at run time can't be checked against a
  // grant, so it is refused here.
  const inputReads = { feed: new Set<string>(), live: new Set<string>() };
  for (const kind of ["feed", "live"] as const) {
    const word = kind === "feed" ? "feed" : "live input";
    for (const m of driverText.matchAll(new RegExp(`["'\`](\\/${kind}\\/[^"'\`]*)["'\`]`, "g"))) {
      const p = m[1] ?? "";
      const name = new RegExp(`^/${kind}/([a-z-]{1,16})\\.json$`).exec(p)?.[1];
      if (p.includes("${"))
        add(
          "dist/driver",
          `fs on /${kind}`,
          `the driver builds a /${kind}/ path at run time (${p})`,
          `name each ${word} as the literal "/${kind}/<name>.json"`,
        );
      else if (!name)
        add("dist/driver", `fs on /${kind}`, `"${p}" is no ${word} path`, `a ${word} is read at "/${kind}/<name>.json", <name> as in its ${kind}:<name> grant`);
      else {
        inputReads[kind].add(name);
        if (!asks.includes(`${kind}:${name}`))
          add("tehas-plugin.json", "asks", `the driver reads /${kind}/${name}.json, which no grant covers`, `add "${kind}:${name}" to asks`);
      }
    }
  }
  const RULES: { grant: RegExp; uses: (a: string) => boolean; unused: string }[] = [
    { grant: /^view:/, uses: (a) => views.some((v) => v.id === a.slice(5)), unused: "no entry in views has that id" },
    { grant: /^skill:/, uses: (a) => skills.some((s) => s.id === a.slice(6)), unused: "no path in skills is in that folder" },
    { grant: /^action:/, uses: (a) => actions.includes(a.slice(7)), unused: "no entry in actions has that id" },
    { grant: /^(clock|every):/, uses: () => /["']clock["']/.test(driverText), unused: 'the driver handles no ctx.trigger "clock"' },
    { grant: /^feed:/, uses: (a) => inputReads.feed.has(a.slice(5)), unused: 'the driver names no "/feed/<name>.json" for it' },
    { grant: /^live:/, uses: (a) => inputReads.live.has(a.slice(5)), unused: 'the driver names no "/live/<name>.json" for it' },
    { grant: /^keep$/, uses: () => /["'`]\/state\//.test(driverText), unused: "the driver names no /state path" },
    {
      grant: /^(product|history)$/,
      uses: () => usesGit || /["'`]\/(product|work)\//.test(driverText),
      unused: "the driver calls no git.* and reads no /product path",
    },
    { grant: /^model:[0-9]+$/, uses: () => usesModel, unused: "the driver calls no model.chat" },
    { grant: /^model:images$/, uses: () => usesModel && asks.some((x) => /^model:[0-9]+$/.test(x)), unused: "it needs model.chat and a model:<tokens> grant" },
    {
      grant: /^viewer:login$/,
      uses: () => /\bviewer\b/.test(driverText) && actions.length > 0,
      unused: "only a press's run gets ctx.viewer, and the driver reads none",
    },
    { grant: /^menu$/, uses: () => views.some((v) => v.open === "page"), unused: 'a menu entry opens a view with open "page", and there is none' },
    { grant: /^view$/, uses: () => false, unused: "name each view instead: view:<id>" },
    { grant: /^model$/, uses: () => false, unused: "a model grant names its tokens: model:<tokens>" },
    { grant: /^record$/, uses: () => false, unused: "no host function of this spec revision writes a record" },
  ];
  const unusedWhy = (a: string): string | null => {
    const rule = RULES.find((r) => r.grant.test(a));
    if (!rule) return "this validator has no rule for it";
    return rule.uses(a) ? null : rule.unused;
  };
  asks.forEach((a, i) => {
    if (!KNOWN.test(a)) return;
    const why = unusedWhy(a);
    if (why) add("tehas-plugin.json", `asks[${i}]`, `"${a}" is declared but no part uses it (${why})`, "remove it from asks, or add the part that uses it");
  });
  for (const a of actions) {
    if (!asks.includes(`action:${a}`)) add("tehas-plugin.json", `actions.${a}`, `the action "${a}" is not asked for`, `add "action:${a}" to asks`);
  }
  views.forEach((v, i) => {
    if (typeof v.id === "string" && !asks.includes(`view:${v.id}`))
      add("tehas-plugin.json", `views[${i}]`, `the view "${v.id}" is not asked for`, `add "view:${v.id}" to asks`);
  });
  skills.forEach((s, i) => {
    if (!asks.includes(`skill:${s.id}`)) add("tehas-plugin.json", `skills[${i}]`, `the skill "${s.id}" is not asked for`, `add "skill:${s.id}" to asks`);
  });
  for (const a of actions) {
    if (!driverText.includes(`"${a}"`))
      add("tehas-plugin.json", `actions.${a}`, "is declared but the driver never handles it", "handle it in run(ctx) for ctx.action, or remove it");
  }
  for (const m of driverText.matchAll(/\bwasm\.load\(\s*["'`]([^"'`]+)["'`]/g)) {
    if (m[1] && !(m[1] in modules))
      add("tehas-plugin.json", "wasm", `the driver loads the module "${m[1]}", which the manifest does not list`, `list it under wasm.${m[1]}`);
  }
  for (const name of Object.keys(modules)) {
    if (!new RegExp(`\\bwasm\\.load\\(\\s*["'\`]${name}["'\`]`).test(driverText))
      add("tehas-plugin.json", `wasm.${name}`, "is listed but the driver never loads it", "remove it from wasm, or load it");
  }
  for (const c of CALLS) {
    if (c.call.test(driverText) && !c.needs(asks))
      add("tehas-plugin.json", "asks", `the driver calls ${c.name}, which no grant covers`, `add "${c.grant}" to asks`);
  }

  // architecture.toml: every glob a check names matches a file, read with
  // architecture.py's own matcher, so a check copied from another plugin
  // cannot hold by checking nothing.
  try {
    const empty = JSON.parse(execFileSync("python3", ["-I", "-c", EMPTY_GLOBS, root], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })) as [
      string,
      string,
    ][];
    for (const [id, glob] of empty)
      add(
        "architecture.toml",
        `check ${id}`,
        `the glob "${glob}" matches no file, so the check holds by checking nothing`,
        "name the files it should check, or remove the glob",
      );
  } catch (e) {
    const why = (e as { stderr?: string }).stderr?.trim().split("\n").pop() || String(e);
    add("architecture.toml", "files", `its globs could not be checked (${why})`, "fix what it names");
  }

  // tehas.toml, read with Python's TOML reader (architecture.py checks it too).
  try {
    const toml = JSON.parse(
      execFileSync("python3", ["-I", "-c", "import json,sys,tomllib;print(json.dumps(tomllib.load(open(sys.argv[1],'rb'))))", path.join(root, "tehas.toml")], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ) as { [k: string]: { [k: string]: Json } };
    const st = toml.standard ?? {};
    if (st.url !== "https://github.com/tehas-app/tehas-standard")
      add("tehas.toml", "standard.url", `is ${JSON.stringify(st.url)}`, 'write url = "https://github.com/tehas-app/tehas-standard"');
    if (st.version !== "v2" && st.version !== "v3")
      add("tehas.toml", "standard.version", `is ${JSON.stringify(st.version)}`, 'write version = "v2" (v3 once it is approved)');
    const allowed: Record<string, string> = { typescript: "7.x", rust: "1.x" };
    for (const [k, v] of Object.entries(toml.platform ?? {})) {
      if (!(k in allowed)) add("tehas.toml", `platform.${k}`, "is not a known toolchain", `remove it; known are ${Object.keys(allowed).join(", ")}`);
      else if (v !== allowed[k]) add("tehas.toml", `platform.${k}`, `is ${JSON.stringify(v)}`, `write ${k} = "${allowed[k]}"`);
    }
    if (exists("src/wasm") && !toml.platform?.rust)
      add("tehas.toml", "platform.rust", "is not declared, but src/wasm/score/ is Rust", 'write rust = "1.x" under [platform]');
    if (!exists("src/wasm") && toml.platform?.rust) add("tehas.toml", "platform.rust", "is declared, but nothing here is Rust", "remove the rust line");
    if (toml.platform?.typescript !== "7.x") add("tehas.toml", "platform.typescript", "is not declared", 'write typescript = "7.x" under [platform]');
  } catch (e) {
    add("tehas.toml", "(file)", `cannot be read as TOML: ${(e as { stderr?: string }).stderr?.trim().split("\n").pop() ?? String(e)}`, "write valid TOML");
  }

  // tsconfig: strict in the base, and no config turns it off.
  for (const f of fs
    .readdirSync(root)
    .filter((n) => /^tsconfig(\..+)?\.json$/.test(n))
    .sort()) {
    let c: { extends?: string; compilerOptions?: Record<string, Json> };
    try {
      c = JSON.parse(read(f)) as typeof c;
    } catch {
      add(f, "(file)", "cannot be read as JSON", "write valid JSON");
      continue;
    }
    const o = c.compilerOptions ?? {};
    const base = f === "tsconfig.base.json";
    if (!base && c.extends !== "./tsconfig.base.json") add(f, "extends", "does not extend the strict base", 'write "extends": "./tsconfig.base.json"');
    for (const k of ["strict", "noUncheckedIndexedAccess", "noEmitOnError"]) {
      if (base && o[k] !== true) add(f, `compilerOptions.${k}`, "is not true", `set "${k}": true`);
    }
    // The strict family: none may be turned off, in the base or any config.
    for (const k of STRICT_FAMILY) {
      if (o[k] === false) add(f, `compilerOptions.${k}`, "turns a strict check off", `remove "${k}"`);
    }
  }

  // package.json: exact pins, a lockfile that agrees, TypeScript 7.x.
  const pkg = JSON.parse(read("package.json")) as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> };
  if (pkg.dependencies && Object.keys(pkg.dependencies).length)
    add(
      "package.json",
      "dependencies",
      "a plugin ships no npm dependencies",
      "move build and test tools to devDependencies; bundle a library into dist/vendor/",
    );
  const lock = exists("package-lock.json") ? (JSON.parse(read("package-lock.json")) as { packages?: Record<string, { version?: string }> }) : null;
  if (!lock) add("package-lock.json", "(file)", "is missing", "run npm install and commit the lockfile");
  for (const [name, v] of Object.entries(pkg.devDependencies ?? {})) {
    if (!/^\d+\.\d+\.\d+$/.test(v))
      add("package.json", `devDependencies.${name}`, `"${v}" is not an exact version`, "pin one version, as 1.2.3, and run npm install");
    else if (lock && lock.packages?.[`node_modules/${name}`]?.version !== v)
      add("package-lock.json", `packages.node_modules/${name}`, `does not hold ${v}`, "run npm install");
  }
  const ts = pkg.devDependencies?.typescript;
  if (!ts?.startsWith("7."))
    add("package.json", "devDependencies.typescript", `is ${ts ?? "missing"}, not 7.x`, 'pin "typescript": "7.0.2", the version tehas pins');

  // Workflows pin every action by its full commit sha.
  const wf = ".github/workflows";
  if (exists(wf)) {
    for (const f of fs
      .readdirSync(path.join(root, wf))
      .filter((n) => n.endsWith(".yml"))
      .sort()) {
      read(`${wf}/${f}`)
        .split("\n")
        .forEach((line, i) => {
          const m = /^\s*-?\s*uses:\s*([^\s#]+)/.exec(line);
          if (m?.[1] && !/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(m[1]))
            add(`${wf}/${f}`, `line ${i + 1}`, `${m[1]} is not pinned by sha`, "pin the action by its full commit sha, with the tag in a comment");
        });
    }
  }

  return out;
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  const problems = check(path.resolve(process.argv[2] ?? "."));
  for (const p of problems) console.log(say(p));
  process.exitCode = problems.length ? 1 : 0;
}
