// The simulator's scenarios: each one plays through the real driver on the
// stub into a stub host plan, and the plan and the view it produces are what
// the scenario means. The plugin has no clock and no random, so the plays
// are repeatable as they stand.
//
// TODO(#3297): when tehas's fakes replace sim/stub/, these test the
// simulator on them.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { OUT, type RefreshAnswer } from "#dist/view/host.model.js";
import { load, play, SCENARIOS } from "../sim/scenario.ts";
import { type Browser, launch, withView } from "./browser.ts";

let browser: Browser;
before(async () => {
  browser = await launch();
});
after(() => browser.close());

/** The plan's output files, refusing a plan whose host answered with an error. */
function outputFiles(name: string, plan: Awaited<ReturnType<typeof play>>): Record<string, string> {
  if ("error" in plan.output) assert.fail(`${name}: the host gave an output error: ${plan.output.error.code}`);
  return plan.output.files;
}

function answer(plan: Awaited<ReturnType<typeof play>>): RefreshAnswer {
  if (!plan.answer || !("result" in plan.answer)) assert.fail("the plan has no press result");
  return plan.answer.result as RefreshAnswer;
}

test("the three scenarios ship", () => {
  assert.deepEqual(SCENARIOS, ["backend-down", "no-feed", "ok"]);
});

test("ok: the run copies the feed byte for byte and the press answers ok", async () => {
  const scenario = load("ok");
  const plan = await play(scenario);
  assert.equal(outputFiles("ok", plan)[OUT], `${JSON.stringify(scenario.feed, null, 2)}\n`);
  assert.equal(answer(plan).state, "ok");
});

test("no-feed: the press answers failed with a reason naming the feed", async () => {
  const plan = await play(load("no-feed"));
  assert.equal(outputFiles("no-feed", plan)[OUT], undefined, "the run wrote a snapshot without a feed");
  const result = answer(plan);
  assert.equal(result.state, "failed");
  if (result.state !== "failed") assert.fail("unreachable");
  assert.match(result.why, /\/feed\/host\.json/);
});

test("backend-down: the host gives an output error, code down", async () => {
  const plan = await play(load("backend-down"));
  if (!("error" in plan.output)) assert.fail("the host gave an output, not an error");
  assert.equal(plan.output.error.code, "down");
  assert.match(plan.output.error.text, /^test-error/);
});

test("the ok plan draws the snapshot in Chromium", async () => {
  const plan = await play(load("ok"));
  await withView(browser, plan, async (view, errors) => {
    await view.waitForSelector("#host:not([hidden])");
    assert.deepEqual(await view.$$eval("#host-rows tr th", (ths) => ths.map((th) => th.textContent)), ["agent", "tehas-cycle", "systemd"]);
    assert.equal(await view.textContent("#host-cpus"), "8 CPUs");
    assert.deepEqual(errors, []);
  });
});

test("the no-feed plan leaves the panel hidden and says there is no reading", async () => {
  const plan = await play(load("no-feed"));
  await withView(browser, plan, async (view, errors) => {
    await view.waitForSelector("#host-refresh");
    assert.equal(await view.textContent("#host-none"), "No host reading: tehas is not sampling the host for this plugin.");
    assert.equal(await view.$eval("#host", (el) => (el as HTMLElement).hidden), true);
    assert.deepEqual(errors, []);
  });
});

test("the backend-down plan shows the host's reason", async () => {
  const plan = await play(load("backend-down"));
  if (!("error" in plan.output)) assert.fail("the host gave an output, not an error");
  // The channel says an error as `code: text`.
  const why = `${plan.output.error.code}: ${plan.output.error.text}`;
  await withView(browser, plan, async (view, errors) => {
    await view.waitForSelector("#host-none:not([hidden])");
    assert.equal(await view.textContent("#host-none"), `No host reading: ${why}.`);
    assert.deepEqual(errors, []);
  });
});
