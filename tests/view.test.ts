// The host view in headless Chromium, in the stub host's sandboxed frame, on
// the host's port: the #host subtree must equal the 1.x view's (tests/golden
// is the golden), fresh and stale, the view must press the declared action
// "refresh" on load, and each way the round trip goes must show its line.
// The frame reaches nothing but its port. The 1.x sentences are asserted as
// literals, not as the model's own constants, so a mistranscribed port fails.
//
// TODO(#3297): may move to `tehas plugin test` if it grows a browser run.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { OUT } from "#dist/view/host.model.js";
import type { Plan } from "../sim/gate.ts";
import { root } from "../sim/root.ts";
import { type Browser, type Frame, launch, type Page, withView } from "./browser.ts";

let browser: Browser;
before(async () => {
  browser = await launch();
});
after(() => browser.close());

const fixture = fs.readFileSync(path.join(root, "tests", "fixtures", "host.json"), "utf8");
const AT = Date.parse(JSON.parse(fixture).generatedAt);
const NO_READING_TEXT = "No host reading: tehas is not sampling the host for this plugin.";

const drawn: Plan = { output: { files: { [OUT]: fixture } } };
// #host-refresh exists only once the element has mounted: waiting for it
// rules out reading the server HTML's #host-none fallback as the view's.
const mounted = (view: Frame) => view.waitForSelector("#host-refresh");
const settled = async (view: Frame) => {
  await mounted(view);
  await view.waitForSelector("#host:not([hidden])");
};

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

/** Draws the same fixture with the 1.x script at a frozen clock `when`. */
async function oneXHtml(when: number): Promise<string> {
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
        // The 1.x view takes "now" from this Date header plus its own elapsed
        // time, so the header carries the frozen moment, as tehas's would.
        headers: { date: new Date(when).toUTCString() },
        body: fixture,
      });
    }
    const file = path.resolve(goldenDir, name === "" ? "index.html" : name);
    if (!file.startsWith(goldenDir + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "not found" });
    return route.fulfill({ status: 200, contentType: types[path.extname(file)] ?? "application/octet-stream", body: fs.readFileSync(file) });
  });
  try {
    await page.goto("https://golden.1x.invalid/index.html");
    await page.waitForSelector("#host:not([hidden])");
    return norm(await page.$eval("#host", (el) => el.outerHTML));
  } finally {
    await page.close();
  }
}

/** Draws the fixture with the Solid view at a frozen clock `when`. */
async function solidHtml(when: number): Promise<string> {
  let html = "";
  await withView(
    browser,
    drawn,
    async (view) => {
      await settled(view);
      html = norm(await hostHtml(view));
    },
    "",
    { init: (page) => page.clock.setFixedTime(when) },
  );
  return html;
}

test("the #host subtree equals the one the 1.x view drew of the same snapshot, fresh", async () => {
  const when = AT + 4000;
  assert.equal(await solidHtml(when), await oneXHtml(when));
});

// The stale half: the STALE tag, its data-state, and the age line. A minute
// and a half past the 30-second mark, far from the "1 min" text boundary, so
// the two renderers' milliseconds of drift cannot straddle a unit change.
test("the #host subtree equals the 1.x view's when the snapshot is stale, STALE and age line included", async () => {
  const when = AT + 95_000;
  const html = await solidHtml(when);
  assert.match(html, /STALE/);
  assert.match(html, /data-state="stale"/);
  assert.match(html, /last reading 2 min ago/);
  assert.equal(html, await oneXHtml(when));
});

// The stub host answers any press it is given, so the press is recorded on
// the wire: the view must send the one action the manifest declares.
const recordPresses = {
  content: `window.__sent = []; const __orig = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (...args) { const m = args[0]; if (m && m.type === "press") window.__sent.push(m.action); return __orig.apply(this, args); };`,
};
const sentPresses = (view: Frame) => view.evaluate(() => (window as unknown as { __sent: string[] }).__sent);

test("the view presses the declared action refresh on load, and the answer ok updates the status line", async () => {
  await withView(
    browser,
    { ...drawn, answer: { result: { state: "ok", bytes: 2048 } } },
    async (view, errors, page) => {
      await settled(view);
      await view.waitForSelector("#host-status:text('Refreshed: 2048 bytes.')");
      assert.equal(await view.textContent("#host-status"), "Refreshed: 2048 bytes.");
      assert.deepEqual(await sentPresses(view), ["refresh"]);
      assert.deepEqual(errors, []);
    },
    "",
    {
      init: (page) => {
        page.addInitScript(recordPresses);
      },
    },
  );
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
    await mounted(view);
    assert.equal(await view.textContent("#host-none"), "No host reading: down: test-error: the plugin is not running.");
    assert.equal(await view.$eval("#host", (el) => (el as HTMLElement).hidden), true);
    assert.deepEqual(errors, []);
  });
});

test("no /out/host.json is the 1.x no-reading sentence, and the panel stays hidden", async () => {
  await withView(browser, { output: { files: {} } }, async (view, errors) => {
    await mounted(view);
    assert.equal(await view.textContent("#host-none"), NO_READING_TEXT);
    assert.equal(await view.$eval("#host", (el) => (el as HTMLElement).hidden), true);
    assert.deepEqual(errors, []);
  });
});

// The violation listener runs from before the first byte: a fetch refused
// during load is seen, not missed by a listener the test installs after.
const recordViolations = {
  content: `window.__violations = []; document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(e.effectiveDirective));`,
};

test("the frame reaches nothing but its port: no fetch, no page errors", async () => {
  await withView(
    browser,
    { ...drawn, answer: { result: { state: "ok", bytes: 1 } } },
    async (view, errors, page) => {
      await settled(view);
      assert.deepEqual(await view.evaluate(() => (window as unknown as { __violations: string[] }).__violations), [], "a policy violation during load");
      const got = await view.evaluate(async () => {
        (window as unknown as { violations: string[] }).violations = [];
        document.addEventListener("securitypolicyviolation", (e) => {
          (window as unknown as { violations: string[] }).violations?.push(e.effectiveDirective);
        });
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
    },
    "",
    {
      init: (page) => {
        page.addInitScript(recordViolations);
      },
    },
  );
});
