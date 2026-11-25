// The stylesheets parse in Chromium, and every token the page uses has a
// value. The 1.x theme ships one palette only: theme.css is light, says
// color-scheme: light, and has no dark block; the port keeps those files
// byte for byte, so what this test asserts is what the files actually
// guarantee: a parseable light theme, and no var(--token) left undefined.

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { root } from "../sim/root.ts";
import { launch } from "./browser.ts";

/** The count of top-level blocks, counted by brace depth: no assumption about the formatting. */
const blocks = (css: string): number => {
  let depth = 0;
  let count = 0;
  let i = 0;
  const n = css.length;
  while (i < n) {
    const c = css[i];
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && css[i] !== c) i += css[i] === "\\" ? 2 : 1;
      i++;
      continue;
    }
    if (c === "{") {
      if (depth === 0) count++;
      depth++;
    } else if (c === "}") depth--;
    i++;
  }
  return count;
};

test("host.css and theme.css parse, and the tokens the page uses are defined", async () => {
  const [host, theme] = await Promise.all([
    fs.readFile(path.join(root, "dist", "view", "host.css"), "utf8"),
    fs.readFile(path.join(root, "dist", "view", "theme.css"), "utf8"),
  ]);
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const parsed = await page.evaluate(
      (css: { host: string; theme: string }) => {
        const [hostCss, themeCss] = [css.host, css.theme];
        const parse = (text: string) => {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(text);
          return [...sheet.cssRules];
        };
        const themeRules = parse(themeCss);
        const light = themeRules.find((r) => r instanceof CSSStyleRule && r.selectorText === ":root");
        return {
          host: parse(hostCss).length,
          theme: themeRules.length,
          tokens: light instanceof CSSStyleRule ? [...light.style].filter((p) => p.startsWith("--")).sort() : [],
          scheme: light instanceof CSSStyleRule ? light.style.getPropertyValue("color-scheme") : "",
        };
      },
      { host, theme },
    );
    // A rule the parser drops would make the counts differ.
    assert.equal(parsed.host, blocks(host), "a host.css rule did not parse");
    assert.equal(parsed.theme, blocks(theme), "a theme.css rule did not parse");
    assert.ok(parsed.tokens.length, "no tokens on :root");
    assert.equal(parsed.scheme, "light", "the 1.x theme is a light palette");
    assert.doesNotMatch(theme, /prefers-color-scheme/i, "the 1.x theme carries no dark block");
    const used = new Set([...`${host}${theme}`.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1] ?? ""));
    assert.ok(used.size > 0, "no token is used at all");
    for (const t of used) assert.ok(parsed.tokens.includes(t), `${t} is used but not defined`);
  } finally {
    await browser.close();
  }
});
