// The host view in headless Chromium, in the stub host's sandboxed frame, on
// the host's port: the #host subtree must equal the 1.x view's (tests/golden
// is the golden), the view must press refresh on load, and each way the round
// trip goes must show its line. The frame reaches nothing but its port.
//
// TODO(#3297): may move to `tehas plugin test` if it grows a browser run.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { NO_READING, OUT } from "#dist/view/host.model.js";
import type { Plan } from "../sim/gate.ts";
import { root } from "../sim/root.ts";
import { type Browser, type Frame, launch, withView } from "./browser.ts";

let browser: Browser;
before(async () => {
  browser = await launch();
});
after(() => browser.close());

const fixture = fs.readFileSync(path.join(root, "tests", "fixtures", "host.json"), "utf8");
const AT = Date.parse(JSON.parse(fixture).generatedAt);

const drawn: Plan = { output: { files: { [OUT]: fixture } } };
const settled = (view: Frame) => view.waitForSelector("#host:not([hidden])");

// Strip the serialization's slack: Solid marks its insertions with comment
// nodes, and both pages carry template indentation. What must match is the
// tags, their attributes and their text.
const norm = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
const hostHtml = (view: Frame) => view.$eval("#host", (el) => el.outerHTML);

test("the #host subtree equals the one the 1.x view drew of the same snapshot", async () => {
  const when = AT + 4000;
  let solid = "";
  await withView(
    browser,
    drawn,
    async (view) => {
      await settled(view);
      solid = norm(await hostHtml(view));
    },
    "",
    { init: (page) => page.clock.setFixedTime(when) },
  );

  const goldenDir = path.join(root, "tests", "golden", "1x");
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
  const page = await browser.newPage();
  await page.clock.setFixedTime(when);
  await page.route("**/*", async (route) => {
    const name = new URL(route.request().url()).pathname.replace(/^\/+/, "");
    if (name === "_feed/host.json") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { date: new Date(AT).toUTCString() },
        body: fixture,
      });
    }
    const file = path.resolve(goldenDir, name === "" ? "index.html" : name);
    if (!file.startsWith(goldenDir + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "not found" });
    return route.fulfill({ status: 200, contentType: types[path.extname(file)] ?? "application/octet-stream", body: fs.readFileSync(file) });
  });
  let oneX = "";
  try {
    await page.goto("https://golden.1x.invalid/index.html");
    await page.waitForSelector("#host:not([hidden])");
    oneX = norm(await page.$eval("#host", (el) => el.outerHTML));
  } finally {
    await page.close();
  }
  assert.equal(solid, oneX);
});

test("the view presses refresh on load, and the answer ok updates the status line", async () => {
  await withView(browser, { ...drawn, answer: { result: { state: "ok", bytes: 2048 } } }, async (view, errors) => {
    await settled(view);
    await view.waitForSelector("#host-status:text('Refreshed: 2048 bytes.')");
    assert.equal(await view.textContent("#host-status"), "Refreshed: 2048 bytes.");
    assert.deepEqual(errors, []);
  });
});

test("a failed press answer shows its reason on the status line", async () => {
  await withView(browser, { ...drawn, answer: { error: { code: "busy", text: "test-error: a press is in flight" } } }, async (view, errors) => {
    await settled(view);
    await view.waitForSelector("#host-status:text('Refresh failed: busy: test-error: a press is in flight.')");
    assert.deepEqual(errors, []);
  });
});

test("a failed output (the host cannot reach the plugin) shows the reason", async () => {
  await withView(browser, { output: { error: { code: "down", text: "test-error: the plugin is not running" } } }, async (view, errors) => {
    await view.waitForSelector("#host-none:not([hidden])");
    assert.equal(await view.textContent("#host-none"), "No host reading: down: test-error: the plugin is not running.");
    assert.equal(await view.$eval("#host", (el) => (el as HTMLElement).hidden), true);
    assert.deepEqual(errors, []);
  });
});

test("no /out/host.json is the 1.x no-reading sentence, and the panel stays hidden", async () => {
  await withView(browser, { output: { files: {} } }, async (view, errors) => {
    await view.waitForSelector("#host-none:not([hidden])");
    assert.equal(await view.textContent("#host-none"), NO_READING);
    assert.equal(await view.$eval("#host", (el) => (el as HTMLElement).hidden), true);
    assert.deepEqual(errors, []);
  });
});

test("the frame reaches nothing but its port: no fetch, no page errors", async () => {
  await withView(browser, { ...drawn, answer: { result: { state: "ok", bytes: 1 } } }, async (view, errors) => {
    await settled(view);
    const got = await view.evaluate(async () => {
      document.addEventListener("securitypolicyviolation", (e) => {
        (window as unknown as { violations: string[] }).violations?.push(e.effectiveDirective);
      });
      (window as unknown as { violations: string[] }).violations = [];
      const fetched = await fetch("/view/index.html").then(
        () => "fetched",
        () => "refused",
      );
      await new Promise((done) => setTimeout(done, 200));
      return { fetched, violations: (window as unknown as { violations: string[] }).violations };
    });
    assert.equal(got.fetched, "refused");
    assert.deepEqual(got.violations, ["connect-src"]);
    assert.deepEqual(errors, []);
  });
});
