// The round trip, end to end: the driver runs on the stub with a feed in
// place (a run by hand, then a press of "refresh"), the stub host pushes the
// output and answers the press on the view's port, and the view in Chromium
// draws the snapshot. Run it to check a new factory's or a new spec
// revision's chain: `bin/test --test-name-pattern=connectivity`.
//
// TODO(#3297): the driver half runs under `tehas plugin test` against
// tehas's fakes; on a factory, the same check is the view itself.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { FEED, OUT, REFRESH } from "#dist/driver/host.js";
import { run } from "#dist/driver/main.js";
import { root } from "../sim/root.ts";
import { stand } from "../sim/stub/state.ts";
import { type Browser, launch, withView } from "./browser.ts";

let browser: Browser;
before(async () => {
  browser = await launch();
});
after(() => browser.close());

test("connectivity: feed, driver, port, view", async () => {
  stand.reset();
  const fixture = fs.readFileSync(path.join(root, "tests", "fixtures", "host.json"));
  stand.files.set(FEED, new Uint8Array(fixture));
  run({ trigger: "once" });
  const result = run({ trigger: "press", action: REFRESH });
  assert.deepEqual(result, { state: "ok", bytes: fixture.length });
  const bytes = stand.files.get(OUT);
  assert.ok(bytes, "the driver wrote no /out/host.json");
  assert.deepEqual([...bytes], [...fixture], "the copy is not the feed byte for byte");
  const plan = { output: { files: { [OUT]: new TextDecoder().decode(bytes) } }, answer: { result } };
  await withView(browser, plan, async (view, errors) => {
    await view.waitForSelector("#host:not([hidden])");
    assert.equal(await view.textContent("#host-rows tr th"), "agent");
    assert.equal(await view.textContent("#host-cpus"), "8 CPUs");
    assert.deepEqual(await view.$eval("#host-state", (el) => (el as HTMLElement).dataset.state), "stale");
    assert.deepEqual(errors, []);
  });
});
