# tehas-plugin-hoststats

A [tehas](https://github.com/tehas-app/tehas) plugin: the machine the
factory runs on, as a view. It draws the readings (CPUs, load, CPU and
memory), the busiest processes and the factory's units, and calls a
snapshot older than 30 seconds stale. It is the Host panel of tehas 1.x,
which tehas 2.0 takes out of core, as a plugin. `tehas top` stays in core.

Under plugin spec v2 (revision 8) the plugin has no container and no
network of its own. tehas writes the host snapshot at `/feed/host.json`
(the `feed:host` input, the mount of tehas-factory#3372); a run reads it
and copies the bytes, unchanged, to `/out/host.json`. The view runs in the
host's sandboxed frame under `connect-src 'none'`, draws the snapshot the
host pushes over its port, and asks for a fresh reading with one press.

## What it asks

| Grant | What it opens |
| --- | --- |
| `view:host` | The one view, a dock panel |
| `feed:host` | The read of `/feed/host.json`, the host snapshot tehas samples |
| `action:refresh` | The view's press: one run that copies the snapshot now |

Writing `/out` needs no grant, so the run's copy asks for nothing beyond
what is above. There is no `keep`: the plugin keeps no state, and its 1.x
refresh never wrote `/state`.

## When it runs

A press of "refresh", or a run by hand. The 1.x view polled its feed every
5 seconds; under spec v2 the view fetches nothing, so the 1.x poll has no
port-side equivalent. Pressing Refresh runs the driver again and shows
its answer on the status line; the drawn snapshot comes from the output the
host pushes to the frame, and follows every re-push the view wrapper of
tehas-factory#3305 gives. The timed run
(`every:1m`, matching the 5-second sampling closely enough for a stale
marker) waits on the `every:` and `clock:` triggers of tehas-factory#3309,
and the live view frame waits on the view wrapper of tehas-factory#3305.

## Where it came from

The page and its styles are copied from tehas `host/fun/`, at commit
`f4759c1ab1b4b8984089cafc98371d8326ceeef1` of the branch
`refactor/coding-standard-v2`: `host-data.js`, `host-view.js`, the Host
section of `index.html`, `host-view.css` and the tokens of
`theme-beesknees26.css` that the page uses. The floor's chip is left out.
The fixture's shape follows `PUBLISHED` in `console/src/top.rs` on the same
commit.

The 1.x plugin kept the page in its repository and a refresh copied the
view's files to `/out`; tehas served them as the page. Spec v2 serves the
view from `dist/view/`, so the run's `/out` holds what the view draws: the
snapshot, byte for byte as the feed gave it. `tests/driver.test.ts` pins
those bytes; `tests/view.test.ts` draws the same snapshot twice, once with
the 1.x view code kept under `tests/golden/1x/` and once with the ported
view, and requires the panels to be equal.

## Layout

```
tehas.toml             the standard and the toolchains
tehas-plugin.json      the manifest (spec 2.0.0-r8)
src/driver/            the run: read /feed/host.json, write it to /out
src/view/              the Solid view: model, render, entry
sim/                   the stub and the scenarios, development only
tests/                 the tests, run by bin/test
schema/ scripts/ bin/  from tehas-plugin-example, the template
```

## The gate

```
bin/validate   # build, checks, lint, tests, architecture, simulator
```

Develop on the simulator:

```
bin/sim                    # the ok scenario, with a Refresh button
bin/sim --scenario no-feed # the answer when there is no snapshot
```

**Not installable yet.** This plugin says `"plugin": 2` and `"spec"`. The
tehas on `v2.1` today still reads manifest version 1 only
(`console/core/src/plugin/manifest.rs`), so it refuses this manifest, and
`tehas plugin check` exits 3. That changes when the manifest reader moves
to version 2 (tehas-factory#3297, #3301). Until then, develop and test on
`bin/sim`, and don't install the plugin on a factory.

`bin/validate` ends `ready`, or names the first thing to fix. Until
tehas-factory#3297 lands, the stub and the hand-written `src/tehas.d.ts`
stand in for tehas's fakes and generated types. Going live waits on the
operator (#3298, #3300), vetting and the signed list (#3301, #3302), the
feed mount (#3372), and the view wrapper (#3305, #3343); the plugin then
floats, live from this repository at its vetted commit, with no tehas
release needed.

## Licence

Apache-2.0, in `LICENSE` and `NOTICE`.
