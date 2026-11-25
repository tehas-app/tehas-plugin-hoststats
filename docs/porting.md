# Porting this plugin

This plugin is the 1.x Host panel ported to plugin spec v2 on the
tehas-plugin-example template. The general path for any 1.x port is the
template's `docs/porting.md`; this is what it took here.

1. The template went in wholesale: `tehas.toml`, `bin/`, `scripts/`,
   `sim/`, `schema/`, the tsconfigs, `package.json`'s pins and the
   workflows, at the template's tagged commit. `scripts/architecture.py`,
   its test and its `.sha256` came unchanged, at tehas-standard's canonical
   copy; `architecture.toml` was taken and hoststats's own files named in
   its checks, which `bin/validate` now requires: it refuses a glob that
   matches no file.
2. `driver/main.mjs` went to `src/driver/main.ts` exporting `run(ctx)`.
   The 1.x refresh copied the view's files to `/out`; the v2 run reads the
   `feed:host` input at `/feed/host.json` and copies those bytes,
   unchanged, to `/out/host.json`. `fs.read` and `fs.write` from the
   `tehas` module are the only effects, all of them in `main.ts`; the
   decision they make lives in the pure `src/driver/host.ts`.
3. The view went to `src/view/` as a Solid view (spec part 6, R11): the
   pure model in `host.model.ts` holds the port of the 1.x `host-data.js`
   (`layout`, `uptime`, `agoText`, and the parsing of the pushed output);
   `host.render.tsx` draws what the 1.x `host-view.js` drew. `host.css`
   and `theme.css` are the 1.x files byte for byte. The 1.x fetch of
   `/_feed/host.json` is gone: under `connect-src 'none'` the view takes
   the snapshot from the host over its port and presses `refresh` for a
   fresh one. The 5-second poll has no port-side equivalent and returns
   as a timed run with `every:` (tehas-factory#3309).
4. The manifest went to `"plugin": 2`, `"spec": "2.0.0-r8"`: no
   `build`, no container; `driver` and the view's `entry` point into
   `dist/`. The asks are the least the parts use: `view:host`,
   `feed:host`, `action:refresh`. `keep` and `menu` are not asked: the
   run writes no `/state`, and the view opens as a dock, not a page.
5. The `Dockerfile`, `.tehas/` and the `node:test` tests went. The tests
   live in `tests/` on the stub: the driver's byte-for-byte golden (the
   1.x fixture's hash), the model port of the 1.x `data.test.mjs`, and a
   Chromium test that the ported view and the 1.x view draw the same
   snapshot the same; the 1.x view code for it is kept under
   `tests/golden/1x/`. Each hop has a scenario in `sim/scenarios/`.
6. `bin/validate` says `ready`, and `dist/` is committed with `src/`.
7. The port's pull request gets a full review; a grant of `model`, `git`
   or a new surface also gets an adversarial pass. This plugin asks no
   such grant.
