# tehas-plugin-hoststats

A [tehas](https://github.com/tehas-app/tehas) plugin: the machine the
factory runs on, as a view. It draws the readings (CPUs, load, CPU and
memory), the busiest processes and the factory's units, and calls a
snapshot older than 30 seconds stale. It is the Host panel of tehas 1.x,
which tehas 2.0 takes out of core, as a plugin. `tehas top` stays in core.

A refresh copies the view's files to `/out`; it asks for nothing else. The
page reads one feed through the gate, same origin, under the sign-in, every
5 seconds:

| Feed | What it is |
| --- | --- |
| `/_feed/host.json` | The snapshot of `tehas top`, cut to its published keys, written by tehas every 5 seconds. A process is named by its short command name only |

With no feed (404) the page says so and asks again after a minute. The
setting `TEHAS_TOP` goes in 2.0: the grant takes its place.

## When it runs

Only on a tehas that has the plugin surfaces of 2.1: the `feed:host` ask,
the unit that samples it and the `/_feed/<feed>.json` route. Until then
tehas refuses the manifest, since it does not know `feed:`. The surfaces are
specified in tehas, `docs/specs/2026-11-22-plugin-surfaces-2.1.md`, section
3 and "The plugins".

## Grant

For the tehas-tehas instance, in its `instance.env`, with the pinned commit:

```
TEHAS_PLUGIN_GRANTS_HOSTSTATS="<commit> view menu feed:host"
```

## Where it came from

Copied from tehas `host/fun/`, at commit
`f4759c1ab1b4b8984089cafc98371d8326ceeef1` of the branch
`refactor/coding-standard-v2`: `host-data.js`, `host-view.js`, the Host
section of `index.html`, `host-view.css` and the tokens of
`theme-beesknees26.css` that the page uses. The floor's chip is left out.
The fixture's shape follows `PUBLISHED` in `console/src/top.rs` on the same
commit.

| File | What it is |
| --- | --- |
| `view/host-data.js` | The feed's path and the layout: readings, processes, units, staleness, as data. Pure |
| `view/host-view.js` | Fetches the feed and draws |
| `view/index.html`, `view/host.css`, `view/theme.css` | The page and its styles |
| `driver/main.mjs` | The refresh: copies `view/` to `/out` |

The view keeps to the gate's policy: scripts and styles from its own files,
no inline script, no handler attributes, nothing from another site, and
requests only to its one feed. `test/view.test.mjs` checks that.

## Tests

```
npm test
```

Node 22 and nothing else: the plugin has no dependencies. The image's build
runs the same tests.

## Licence

Apache-2.0, in `LICENSE` and `NOTICE`.
