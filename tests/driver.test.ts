// The driver: one run copies the feed snapshot to /out unchanged. The
// byte-for-byte golden: /out/host.json is exactly the bytes the stub feed
// held, and the 1.x fixture's own hash is pinned, so a snapshot that
// drifted on the way through the run fails here.
//
// TODO(#3297): these move to src/test/, build to dist/test/ and run under
// `tehas plugin test` in the engine, against tehas's fakes, with its
// test()/assert API in place of node:test.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { type Answer, FEED, OUT, REFRESH } from "#dist/driver/host.js";
import { run } from "#dist/driver/main.js";
import { stand } from "../sim/stub/state.ts";

// Tests run from build/js/tests/, three levels under the repository root.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FIXTURE = fs.readFileSync(path.join(root, "tests", "fixtures", "host.json"));
/** sha256 of the fixture: the golden. The bytes the run writes must hash here. */
const FIXTURE_SHA256 = "cfb9861420511a27f388894aaf0cda80e6d4ed5888eb7be64763c3262a91f271";

const putFeed = (bytes: Uint8Array) => stand.files.set(FEED, bytes);
const outBytes = () => stand.files.get(OUT);

beforeEach(() => stand.reset());

test("a run copies the snapshot to /out byte for byte", () => {
  putFeed(FIXTURE);
  run({ trigger: "once" });
  const got = outBytes();
  assert.ok(got, "the run wrote nothing");
  assert.deepEqual([...got], [...FIXTURE]);
});

test("the golden: what the run wrote hashes to the fixture's hash", async () => {
  putFeed(FIXTURE);
  run({ trigger: "once" });
  const got = outBytes();
  assert.ok(got, "the run wrote nothing");
  const digest = await crypto.subtle.digest("SHA-256", got as unknown as ArrayBuffer);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  assert.equal(hex, FIXTURE_SHA256);
});

test("the refresh press answers the copy, with its size", () => {
  putFeed(FIXTURE);
  const answer = run({ trigger: "press", action: REFRESH });
  assert.deepEqual(answer, { state: "ok", bytes: FIXTURE.length });
  assert.equal(stand.files.size, 2, "a press writes /out and nothing else");
});

test("every trigger copies: the press answers, the others write quietly", () => {
  putFeed(FIXTURE);
  for (const ctx of [{}, { trigger: "once" }, { trigger: "clock" }, { trigger: "press", action: REFRESH }]) {
    stand.files.delete(OUT);
    const answer = run(ctx);
    assert.equal(answer.state, "ok", `trigger ${String(ctx.trigger)} did not copy`);
    assert.ok(outBytes(), `trigger ${String(ctx.trigger)} wrote no /out file`);
  }
});

test("no feed is a failed answer with its reason, and no /out file", () => {
  const answer = run({ trigger: "press", action: REFRESH });
  assert.equal(answer.state, "failed");
  assert.match((answer as { why: string }).why, /feed is unreadable/);
  assert.equal(outBytes(), undefined, "a failed run wrote /out anyway");
  assert.match(stand.logs.join("\n"), new RegExp(`${FEED} unreadable`));
});

test("an unwritable /out is a failed answer with its reason, not a crash", () => {
  putFeed(FIXTURE);
  stand.refuseWrites = "test-error: quota";
  const answer = run({ trigger: "press", action: REFRESH });
  assert.equal(answer.state, "failed");
  assert.match((answer as { why: string }).why, /output is unwritable: test-error: quota/);
});

test("the press of another action is refused by name, as a throw", () => {
  putFeed(FIXTURE);
  assert.throws(() => run({ trigger: "press", action: "erase" }), /no action erase/);
  assert.throws(() => run({ trigger: "press" }), /no action undefined/);
});

test("the run says what it copied, once, on the log", () => {
  putFeed(FIXTURE);
  run({ trigger: "once" });
  assert.equal(stand.logs.length, 1);
  assert.equal(stand.logs[0], `refresh: copied ${FIXTURE.length} byte(s) to ${OUT}`);
});

test("the answer is one shape: ok with a byte count, failed with a why", () => {
  putFeed(new TextEncoder().encode('{"host":{}}'));
  const good = run({ trigger: "once" }) as Extract<Answer, { state: "ok" }>;
  assert.deepEqual(Object.keys(good).sort(), ["bytes", "state"]);
  assert.equal(typeof good.bytes, "number");
  stand.files.delete(FEED);
  const gone = run({ trigger: "press", action: REFRESH }) as Extract<Answer, { state: "failed" }>;
  assert.deepEqual(Object.keys(gone).sort(), ["state", "why"]);
  assert.equal(typeof gone.why, "string");
});
