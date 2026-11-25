# AGENTS.md

This repository follows tehas-standard v2 (`tehas.toml`): https://github.com/tehas-app/tehas-standard/tree/main/v2.
It is built to v3, the plugin standard, which is normative here:
https://github.com/tehas-app/tehas-standard/tree/main/v3 (`plugins.md`,
`coding.md`). `tehas.toml` says `v2` as the bridge until v3 is tagged
(v3 `plugins.md` §13), then `v3`.

<!-- opening -->
This repository is a sample: the example plugin, and the template
repository new tehas plugins start from. Its parts are demonstrations, and its data is
random Interlingua test data. Nothing in it is a real feature to extend or
ship. Keep it minimal and clear, and keep the demonstrations working. Do
not add features.
<!-- /opening -->

The plugin follows plugin spec v2, revision 8 (the operator). `README.md` has the map
and the commands; `skills/make-a-plugin/SKILL.md` has the whole path.

## What a plugin is

A plugin is files. `src/` is the source people read; `dist/` is what tehas
vets and runs, made by `bin/build` and committed with `src/`. tehas never
builds a plugin. A plugin may hold many parts (views, timed runs, skills, a
WebAssembly module). They share the stub in `sim/stub/` and one test set.
To add a part, copy the nearest one; to remove one, delete its files, its
manifest entry, its grant and its tests.

## The rules

- **R1 to R10**, the architecture method: one owner for each piece of
  knowledge; outside systems behind ports; a pure core with effects at the
  edge; typed seams; deep modules; failures in the adapter; tests at the
  interface; dependencies inward; expand then contract; small steps.
- **R11, the kit.** A view is static HTML, or one custom element drawn
  with the kit's Solid (HTML and JS, or JSX), and nothing else but libraries
  verified in `dist/vendor/`. Each view kind is `<name>.ts`, a pure
  `<name>.model.ts` and the one drawing file `<name>.render.tsx`.
- **R12, typed sources.** TypeScript 7 in `src/`, strict, checked against
  `tehas.d.ts`; the module's Rust under clippy. No escape hatches.
  `dist/` is readable: not minified, no `eval`, no `new Function`, no
  source maps, no line over 1,000 characters.
- **R13, pure models.** The view models and the driver's core read no DOM,
  network, clock or storage; every host call is made in `main.ts`, the one
  shell module `run(ctx)` drives.
- **R14, the host's surfaces.** Files, state and the model only through the
  `tehas` module; heavy compute in the plugin's own WebAssembly module.
- **A driver imports only `tehas`** and its own files. Never `node:`, never a
  package. Packages are fine in `bin/`, `scripts/`, `sim/`, `tests/` and the
  build.
- **Grants.** Each entry in `asks` is used by a part, and each host call is
  covered by a grant. Ask for the least. Writing to `/out` needs no grant.
- **No network, no secrets.** A driver reaches only the `tehas` module; a
  view reaches nothing but its port (`connect-src 'none'`). No tokens in code, logs or tests. Stub data is
  random and marked `test-`.
- **Fail closed.** A missing or malformed setting stops with a clear
  message and an exit status, never a default.
- **Tests first.** Every behaviour change comes with a test, written first,
  at the interface, on the stub. A test that moves to `tehas plugin test`
  says `TODO(#3297)`.
- **Style.** TypeScript strict and formatted; bash with `set -euo pipefail`,
  a header comment (what, usage, exit statuses) and shellcheck clean; prose
  plain, in short sentences, with no em dashes; comments terse, saying why.
- **Do not edit your own gates** in a work cycle: `AGENTS.md`,
  `.github/`, `scripts/architecture.py`, `scripts/architecture_test.py`,
  `scripts/validate.ts`, `biome.json` and `architecture.toml`. Say in the
  pull request when one is wrong. The architecture scripts are the same in
  every tehas repository and change in all of them together.

## What enforces each rule

| Rule | Checked by |
| --- | --- |
| R1, R2, R3, R4, R8: driver imports; no computed `import(`, `require(`, `eval` or `Function(`; no `globalThis` or network in a driver; no `any`; no global state | `scripts/architecture.py` (`architecture.toml`); `bin/build` for `dist/` |
| R11: no `fetch` in the views, no raw HTML, Solid only in views | `scripts/architecture.py`; `bin/build` (view imports) |
| R12: tsc strict; clippy; no `@ts-ignore`, `#[allow(`, `shellcheck disable` | `bin/build`, `bin/validate` (types), check.yml `types`, `scripts/architecture.py` |
| R13: the models and the driver's core are pure | `scripts/architecture.py` (`model-pure`) |
| R14: no provider host or key; `dist/` committed as built | `scripts/architecture.py`, check.yml `plugin` |
| The manifest against its schema; every part's file; skills well formed | `bin/validate` |
| Grants declared against grants used; modules listed, named and pure | `bin/validate` |
| `tehas.toml`; exact pins with a lockfile; TypeScript 7.x; actions pinned by sha | `bin/validate` (`scripts/validate.ts`); `scripts/architecture.py` reads `tehas.toml`'s `[standard]` and `[platform]` |
| Formatting and lint (the rules in `biome.json`); shellcheck | `bin/validate`, check.yml |
| Tests pass | `bin/test`, `bin/validate`, check.yml |
| R5, R6, R7, R9, R10; tests first; fail closed; no secrets; prose style; gates not edited | review |

`bin/validate` runs every check above and ends `ready`, or names the first
thing to fix. check.yml runs the same steps on each pull request.

## The gate

```
bin/validate   # build, checks, lint, tests, architecture, simulator
```

Run it before you say a change is done, and quote its last line.

## Views, the port and presses

A view runs in the host's sandboxed frame and talks only on the one
MessagePort the host transfers on each frame load, never on
`parent.postMessage` (spec v2 part 6.3; the `port` handshake of rev 6:
the first message is `port`, and the view drops anything before it). It takes the first port
and ignores any other; a new load is a new port, and its old nonces are
dead. It sends `ready` and `press`, and gets `output`, `answer` and
`error`. The host issues each press's single-use nonce (`next` in `output`
and `answer`), caps message size and rate, and allows one press in flight;
a drop comes back as `error` (`too-large`, `too-many`, `busy`). `src/view/source.ts` is the one
module that talks on the port.

A press that acts as the person (an `issue:*` grant) gets a confirm the
host draws. The example's one press, `hello`, acts as nobody and writes
nothing, so it needs none.

## Commits and releases

One logical change per commit, the subject a plain statement of what
changed, with no prefix and no issue number. A change that needs a minor or
major version bump carries a `Release: minor` or `Release: major` trailer;
anything else is a patch. On main, `bin/tag` tags the next version once
`bin/validate` says `ready`; `release.yml` runs it on each push.

## The signed list

A plugin of ours reaches factories through tehas's signed vetted list (spec
v2 part 4, tehas-factory#3302): open a pull request to the list's
repository that adds the plugin as `building`. A person reviews it; once it
is merged, the list's vetting workflow audits the pinned commit and signs
the entry when it passes. Nothing merges on its own: open a pull request
and stop.

## Appendix: TypeScript practice

Rules marked *lint* are in `biome.json`; the rest are for review.

- **Strict, no `any`, `unknown` at the edges** (*lint*: `noExplicitAny`;
  tsc: `strict`, `noUncheckedIndexedAccess`).
  `const body: unknown = await res.json();`, then narrow it.
- **One type per seam.** `Greeting` is the one shape of `/out/hello.json`.
- **Pure core, effects at the edge, host calls behind one module.**
  `answer(login, now)` is pure; only `main.ts` calls `fs.write` or
  `wasm.load` (and `model-pure` in `architecture.toml` checks it).
- **Errors as values, no swallowed catch** (*lint*:
  `noEmptyBlockStatements`). `lookUp` returns `{ state: "failed", why }`.
- **No default exports, small modules** (*lint*: `noDefaultExport`).
  `export function hello()`, one subject to a file.
- **Readonly and const, no global state** (*lint*: `useConst`,
  `noParameterAssign`; `architecture.toml`'s `global-state` refuses a
  top-level `let` or `var`). `export const WORDS: readonly string[]`.
- **No clever generics** (review). A type parameter earns its place by
  having two callers; `Step<T>` does, a conditional type to save a line
  does not.
- **ISO dates at the seam.** `at: now.toISOString()`, never a local string.
- **Tests at the interface.** Test `run(ctx)` and what it writes, on the
  stub, not a private helper.

<!-- part: wasm -->
## Appendix: a WebAssembly route (example)

Spec v2 parts 1.1 and 6.1. The score module is an optional part.

- **Source.** `src/wasm/score/` is a Rust `cdylib` (`no_std`, no dependencies,
  no `unsafe` code, scalars only) with the
  toolchain and target pinned in `src/wasm/score/rust-toolchain.toml`
  (rustc 1.100.0, `wasm32-wasip1`). `bin/build` builds it into
  `dist/wasm/score.wasm`, keeping the name section, and the manifest lists
  it under `wasm` with its source and recipe.
- **The driver.** `main.ts` calls `wasm.load("score").score` and hands it to
  the pure `src/driver/score.ts`, which passes the note's length and seed:
  numbers go through as they are. Bytes would go in through a module's
  `alloc` and memory as `(ptr, len)` (spec part 1.1), which needs `unsafe`
  Rust; this example keeps to scalars. Each load is a fresh instance.
- **A view** would put its module in `dist/view/wasm/<name>.wasm`, list it
  as a view module, and get its bytes over the port in a `module` message,
  never by fetch (rev 6, 6.1): it compiles them with `WebAssembly.compile`,
  in a `blob:` module worker, never on the view's main thread (H9), under
  the frame's own policy,
  `connect-src 'none'` included; the CSP allows `'wasm-unsafe-eval'` and
  nothing more.
- **Caps and vetting.** 8 MiB a module, 32 MiB for `dist/wasm/`, 16 MiB for
  `dist/view/wasm/`. Vetting refuses a stripped module, any import but a
  null WASI preview 1 or `env.abort`, threads and shared memory; our own
  plugins must also rebuild from source to the same bytes. `bin/validate`
  checks the listing, the name section, the imports and the sizes.
- **Without it.** `bin/new <name> --no-wasm` removes `src/wasm/score/`, `dist/wasm/`,
  `score.ts`, its test and `rust` in `tehas.toml`.
<!-- /part: wasm -->
