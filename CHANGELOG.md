# Changelog

## Unreleased

- Ported to plugin spec v2, revision 8, on the tehas-plugin-example
  template: no container and no network, the driver reads the
  `feed:host` input at `/feed/host.json` and copies it, unchanged, to
  `/out/host.json`, and the view draws the snapshot over its port under
  `connect-src 'none'` and asks for a fresh reading with one press.
- Tests first, on the template's stub: the pass-through golden pins the
  bytes of `/out/host.json`, and the view's panel is checked against the
  1.x view drawing the same snapshot (the 1.x view code is kept under
  `tests/golden/1x/`).
- The 1.x refresh, Dockerfile and manifest are gone; the 5-second feed
  poll goes with them, and the timed run returns with `every:` at
  tehas-factory#3309.

## 1.x

- The 1.x plugin: a refresh copied the view's files to `/out`, and the
  page read `/_feed/host.json` through the gate every 5 seconds. See the
  history before this port.
