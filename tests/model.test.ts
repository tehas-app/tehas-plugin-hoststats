// The host view's pure model, without a browser: the figures the 1.x view
// drew (test/data.test.mjs is the source of these cases, minus its poll
// rules, which the port drops), and the new Step states of the round trip:
// the snapshot in the host's output and the refresh press's answer.
//
// TODO(#3297): moves to `tehas plugin test` with the driver's tests.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  agoText,
  fromAnswer,
  fromOutput,
  LOADING,
  lastReading,
  layout,
  MISSING,
  NO_READING,
  OUT,
  ROWS,
  reading,
  refreshLine,
  type Seen,
  type Snapshot,
  STALE_AFTER,
  snapshot,
  UNITS,
  uptime,
  waiting,
} from "#dist/view/host.model.js";

// Compiled, this file runs from build/js/tests/: three up is the repository.
const root = path.resolve(import.meta.dirname, "..", "..", "..");
const host = JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "host.json"), "utf8")) as Record<string, unknown>;
const AT = Date.parse(host.generatedAt as string);
const files = (f: Record<string, string>) => ({ state: "ok" as const, value: f });
const seen = (output: Seen["output"], press: Seen["press"]): Seen => ({ output, press });

test("the fixture holds only the published keys", () => {
  assert.deepEqual(Object.keys(host).sort(), ["cycle", "energy", "factory", "generatedAt", "host", "queue", "units"]);
});

test("the readings: cpus, load, cpu and memory with their gauges", () => {
  const v = layout(host, AT + 4000);
  assert.equal(v.state, "live");
  assert.equal(v.present, true);
  assert.equal(v.ageSeconds, 4);
  assert.equal(v.cpus, "8 CPUs");
  assert.deepEqual(v.load, ["1.20", "0.90", "0.70"]);
  assert.equal(v.cpu, "18.5%");
  assert.equal(v.cpuFilled, 2);
  assert.deepEqual(v.memory, { used: "12000", total: "32000", percent: 38, filled: 4 });
  assert.equal(v.label, "Host: 8 cpus, using 18.5% of its cpus.");
});

test('the processes as the feed orders them, a row with no name left out, no reading as "--"', () => {
  const v = layout(host, AT);
  assert.deepEqual(v.rows, [
    { pid: 300, name: "agent", cpu: "40%", mem: "7.3%", up: "16 min" },
    { pid: 200, name: "tehas-cycle", cpu: "2%", mem: "4.9%", up: "1 min" },
    { pid: 100, name: "systemd", cpu: "--", mem: "1.8%", up: "1 d" },
  ]);
});

test("the units: name, installed, state and the next firing", () => {
  assert.deepEqual(layout(host, AT).units, [
    { name: "tehas-dispatch.timer", installed: "enabled", state: "active", next: "12:02:00" },
    { name: "tehas-cycle@41.service", installed: "-", state: "active", next: "" },
  ]);
});

test("a snapshot older than 30 seconds is stale", () => {
  assert.equal(STALE_AFTER, 30);
  assert.equal(layout(host, AT + 30000).state, "live");
  const v = layout(host, AT + 31000);
  assert.equal(v.state, "stale");
  assert.equal(v.label, "Host: 8 cpus, no recent reading of /proc.");
  assert.equal(agoText(v.ageSeconds), "just now");
  assert.equal(agoText(layout(host, AT + 600000).ageSeconds), "10 min ago");
  assert.equal(lastReading(layout(host, AT)), "");
  assert.equal(lastReading(layout(host, AT + 3600000)), "last reading 60 min ago");
  assert.equal(lastReading(layout(host, AT + 7200000)), "last reading 2 h ago");
});

test("a feed with no host section, or no time, is stale and draws empty", () => {
  for (const file of [{}, null, { ...host, host: null }, { ...host, generatedAt: "x" }]) assert.equal(layout(file, AT).state, "stale");
  const v = layout({}, AT);
  assert.equal(v.present, false);
  assert.equal(v.ageSeconds, null);
  assert.deepEqual(v.rows, []);
  assert.deepEqual(v.units, []);
  assert.equal(v.memory, null);
});

test("a longer list is cut to what the page draws, and names to 64 characters", () => {
  const many = {
    ...host,
    host: { ...(host.host as Record<string, unknown>), processes: Array.from({ length: 40 }, (_, i) => ({ pid: i + 1, name: "p".repeat(100) })) },
    units: Array.from({ length: 50 }, (_, i) => ({ id: `u${i}.service` })),
  };
  const v = layout(many, AT);
  assert.equal(v.rows.length, ROWS);
  assert.equal(v.rows[0]?.name.length, 64);
  assert.equal(v.units.length, UNITS);
});

test("uptime reads in the coarsest unit", () => {
  assert.deepEqual([30, 61, 3600, 90000, -1, null].map(uptime), ["30 s", "1 min", "1 h", "1 d", "-", "-"]);
});

test("the output: the snapshot, none yet, and each way it can be wrong", () => {
  assert.deepEqual(fromOutput(files({ [OUT]: JSON.stringify(host) })), { state: "ok", value: host });
  assert.deepEqual(fromOutput(files({})), { state: "failed", why: MISSING });
  assert.deepEqual(fromOutput(files({ [OUT]: "{" })), { state: "failed", why: `${OUT} is not JSON` });
  assert.deepEqual(fromOutput(files({ [OUT]: "[]" })), { state: "failed", why: `${OUT} is not a host snapshot` });
  assert.deepEqual(fromOutput({ state: "failed", why: "down: test-error" }), { state: "failed", why: "down: test-error" });
});

test("the press's answer: ok with its bytes, failed with its why, and anything else refused", () => {
  assert.deepEqual(fromAnswer({ state: "ok", value: { state: "ok", bytes: 2048 } }), { state: "ok", value: { state: "ok", bytes: 2048 } });
  assert.deepEqual(fromAnswer({ state: "ok", value: { state: "failed", why: "the feed is unreadable: test-why" } }), {
    state: "ok",
    value: { state: "failed", why: "the feed is unreadable: test-why" },
  });
  assert.deepEqual(fromAnswer({ state: "ok", value: 42 }), { state: "failed", why: "not a refresh answer" });
  assert.deepEqual(fromAnswer({ state: "ok", value: { state: "ok" } }), { state: "failed", why: "not a refresh answer" });
  assert.deepEqual(fromAnswer({ state: "failed", why: "busy: test-error" }), { state: "failed", why: "busy: test-error" });
});

test("what has been seen: nothing until the output answers", () => {
  assert.deepEqual(waiting, { output: { state: "waiting" }, press: { state: "waiting" } });
  assert.equal(snapshot(waiting), null);
  const snap = host as Snapshot;
  assert.equal(snapshot(seen({ state: "ok", value: snap }, waiting.press)), snap);
  assert.equal(snapshot(seen({ state: "failed", why: MISSING }, waiting.press)), null);
});

test("the status lines: loading, no reading, the host's reason, and the refresh's own", () => {
  assert.equal(reading(waiting), LOADING);
  assert.equal(reading(seen({ state: "failed", why: MISSING }, waiting.press)), NO_READING);
  assert.equal(
    reading(seen({ state: "failed", why: "down: test-error: the plugin is not running" }, waiting.press)),
    "No host reading: down: test-error: the plugin is not running.",
  );
  assert.equal(reading(seen({ state: "ok", value: host as Snapshot }, waiting.press)), "");
  assert.equal(refreshLine(waiting), "");
  const out = { state: "ok" as const, value: host as Snapshot };
  assert.equal(refreshLine(seen(out, { state: "waiting" })), LOADING);
  assert.equal(refreshLine(seen(out, { state: "ok", value: { state: "ok", bytes: 2048 } })), "Refreshed: 2048 bytes.");
  assert.equal(refreshLine(seen(out, { state: "failed", why: "busy: test-error" })), "Refresh failed: busy: test-error.");
});
