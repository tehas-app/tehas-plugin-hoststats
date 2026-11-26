// bin/validate: hoststats passes, and each broken case fails with its own
// message naming the file, the field and the fix. The grants hoststats asks
// are view:host, feed:host and action:refresh, so the broken cases use other
// names of the same kinds.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { check, KNOWN_GRANTS, STRICT_FAMILY, say } from "../scripts/validate.ts";
import { copyTree, edit, gitInit, lastLine, linkTools, nested, remove, sh } from "./tree.ts";

/** The problems after `change` on a fresh copy. */
function after(change: (dir: string) => void): string[] {
  const dir = copyTree();
  try {
    change(dir);
    return check(dir).map(say);
  } finally {
    remove(dir);
  }
}
const json = (dir: string, f: string, change: (v: Record<string, unknown>) => void) =>
  edit(dir, f, (s) => {
    const v = JSON.parse(s) as Record<string, unknown>;
    change(v);
    return JSON.stringify(v, null, 2);
  });
const asks = (v: Record<string, unknown>) => v.asks as string[];

test("hoststats has no problem", () => {
  assert.deepEqual(
    after(() => undefined),
    [],
  );
});

test("a bad manifest: the wrong plugin kind number", () => {
  assert.deepEqual(
    after((d) =>
      json(d, "tehas-plugin.json", (v) => {
        v.plugin = 1;
      }),
    ),
    ["tehas-plugin.json: plugin: must be 2; change it to what schema/manifest.schema.json allows"],
  );
});

test("a bad manifest: the wrong spec revision word", () => {
  assert.deepEqual(
    after((d) =>
      json(d, "tehas-plugin.json", (v) => {
        v.spec = "2.0.0";
      }),
    ),
    ['tehas-plugin.json: spec: "2.0.0" does not match ^2\\.[0-9]+\\.[0-9]+-r[0-9]+$; change it to what schema/manifest.schema.json allows'],
  );
});

test("a bad manifest: a field the schema does not know", () => {
  assert.deepEqual(
    after((d) =>
      json(d, "tehas-plugin.json", (v) => {
        v.build = "Dockerfile";
      }),
    ),
    ["tehas-plugin.json: build: is not a field of the manifest; change it to what schema/manifest.schema.json allows"],
  );
});

test("a declared part whose file does not exist", () => {
  const p = after((d) =>
    json(d, "tehas-plugin.json", (v) => {
      const view = (v.views as { entry: string }[])[0];
      if (view) view.entry = "dist/view/gone.html";
    }),
  );
  assert.deepEqual(p, ["tehas-plugin.json: views[0].entry: dist/view/gone.html does not exist; run bin/build, or point it at the view's page in dist/view/"]);
});

test("an unknown grant names the grants that are known", () => {
  const p = after((d) =>
    json(d, "tehas-plugin.json", (v) => {
      asks(v).push("net:app");
    }),
  );
  assert.deepEqual(p, [`tehas-plugin.json: asks[3]: unknown grant "net:app"; known: ${KNOWN_GRANTS}; ask only for a known grant`]);
});

// Every grant the schema knows that no part of hoststats uses, with its reason.
const UNUSED: [string, string][] = [
  ["product", "the driver calls no git.* and reads no /product path"],
  ["history", "the driver calls no git.* and reads no /product path"],
  ["model:1000", "the driver calls no model.chat"],
  ["model:images", "it needs model.chat and a model:<tokens> grant"],
  ["record", "no host function of this spec revision writes a record"],
  ["view", "name each view instead: view:<id>"],
  ["model", "a model grant names its tokens: model:<tokens>"],
  ["keep", "the driver names no /state path"],
  ["view:other", "no entry in views has that id"],
  ["skill:other", "no path in skills is in that folder"],
  ["action:other", "no entry in actions has that id"],
  ["feed:mesh", 'the driver names no "/feed/<name>.json" for it'],
  ["clock:daily@06:00", 'the driver handles no ctx.trigger "clock"'],
];

for (const [grant, why] of UNUSED) {
  test(`an unused grant: ${grant}`, () => {
    assert.deepEqual(
      after((d) =>
        json(d, "tehas-plugin.json", (v) => {
          asks(v).push(grant);
        }),
      ),
      [`tehas-plugin.json: asks[3]: "${grant}" is declared but no part uses it (${why}); remove it from asks, or add the part that uses it`],
    );
  });
}

test("an unused grant: menu, with no view that opens as a page", () => {
  const p = after((d) =>
    json(d, "tehas-plugin.json", (v) => {
      asks(v).push("menu");
    }),
  );
  assert.deepEqual(p, [
    'tehas-plugin.json: asks[3]: "menu" is declared but no part uses it (a menu entry opens a view with open "page", and there is none); remove it from asks, or add the part that uses it',
  ]);
});

const reads = (d: string, ...paths: string[]) =>
  edit(d, "dist/driver/main.js", (s) => `${s}\n${paths.map((p, i) => `export const feed${i} = ${p};`).join("\n")}\n`);

test("a second feed read that no grant covers", () => {
  const p = after((d) => reads(d, '"/feed/mesh.json"'));
  assert.deepEqual(p, ['tehas-plugin.json: asks: the driver reads /feed/mesh.json, which no grant covers; add "feed:mesh" to asks']);
});

test("a path that only starts like the feed is no read of it", () => {
  const p = after((d) => reads(d, '"/out/feed/host.json"', '"/feed/host.json/extra"'));
  assert.deepEqual(p, [
    'dist/driver: fs on /feed: "/feed/host.json/extra" is no feed path; a feed is read at "/feed/<name>.json", <name> as in its feed:<name> grant',
  ]);
});

test("a feed path built at run time is refused", () => {
  // Joined so no string holds "${": the code appended to the driver builds
  // its feed path at run time, and the linter refuses a placeholder in a
  // plain string.
  const p = after((d) => reads(d, "`/feed/" + "$" + "{String(1)}.json`"));
  assert.ok(
    p.some((x) => x.startsWith("dist/driver: fs on /feed: the driver builds a /feed/ path at run time")),
    p.join("\n"),
  );
});

test("a live input read with its grant, and one without", () => {
  const ok = after((d) => {
    json(d, "tehas-plugin.json", (v) => {
      asks(v).push("live:status");
    });
    reads(d, '"/live/status.json"');
  });
  assert.deepEqual(ok, []);
  const bad = after((d) => reads(d, '"/live/running.json"'));
  assert.deepEqual(bad, ['tehas-plugin.json: asks: the driver reads /live/running.json, which no grant covers; add "live:running" to asks']);
});

test("an unused grant: a live input the driver never reads", () => {
  const p = after((d) =>
    json(d, "tehas-plugin.json", (v) => {
      asks(v).push("live:status");
    }),
  );
  assert.deepEqual(p, [
    'tehas-plugin.json: asks[3]: "live:status" is declared but no part uses it (the driver names no "/live/<name>.json" for it); remove it from asks, or add the part that uses it',
  ]);
});

test("a feed grant does not cover a live path of the same name", () => {
  const p = after((d) => {
    json(d, "tehas-plugin.json", (v) => {
      asks(v).push("feed:status");
    });
    reads(d, '"/live/status.json"');
  });
  assert.deepEqual(p, [
    'tehas-plugin.json: asks: the driver reads /live/status.json, which no grant covers; add "live:status" to asks',
    'tehas-plugin.json: asks[3]: "feed:status" is declared but no part uses it (the driver names no "/feed/<name>.json" for it); remove it from asks, or add the part that uses it',
  ]);
});

test("a live grant does not cover a feed path of the same name", () => {
  const p = after((d) => {
    json(d, "tehas-plugin.json", (v) => {
      asks(v).push("live:status");
    });
    reads(d, '"/feed/status.json"');
  });
  assert.deepEqual(p, [
    'tehas-plugin.json: asks: the driver reads /feed/status.json, which no grant covers; add "feed:status" to asks',
    'tehas-plugin.json: asks[3]: "live:status" is declared but no part uses it (the driver names no "/live/<name>.json" for it); remove it from asks, or add the part that uses it',
  ]);
});

test("a live path that is malformed, or built at run time, is refused with live's words", () => {
  const p = after((d) => {
    json(d, "tehas-plugin.json", (v) => {
      asks(v).push("live:status");
    });
    reads(d, '"/live/status.json"', '"/live/status.json/extra"', "`/live/" + "$" + "{String(1)}.json`");
  });
  assert.ok(
    p.includes(
      'dist/driver: fs on /live: "/live/status.json/extra" is no live input path; a live input is read at "/live/<name>.json", <name> as in its live:<name> grant',
    ),
    p.join("\n"),
  );
  assert.ok(
    p.some((x) => x.startsWith("dist/driver: fs on /live: the driver builds a /live/ path at run time")),
    p.join("\n"),
  );
});

test("a check whose glob matches no file, as when it is copied from another plugin", () => {
  const p = after((d) => edit(d, "architecture.toml", (s) => s.replace('"src/driver/host.ts"', '"src/driver/gone.ts"')));
  assert.deepEqual(p, [
    'architecture.toml: check model-pure: the glob "src/driver/gone.ts" matches no file, so the check holds by checking nothing; name the files it should check, or remove the glob',
  ]);
});

test("a check's globs that cannot be read name why", () => {
  const p = after((d) => fs.rmSync(path.join(d, "scripts", "architecture.py")));
  assert.ok(p.includes("architecture.toml: files: its globs could not be checked (scripts/architecture.py is missing); fix what it names"), p.join("\n"));
});

test("an action that is not asked for", () => {
  const p = after((d) =>
    json(d, "tehas-plugin.json", (v) => {
      v.asks = asks(v).filter((a) => a !== "action:refresh");
    }),
  );
  assert.deepEqual(p, ['tehas-plugin.json: actions.refresh: the action "refresh" is not asked for; add "action:refresh" to asks']);
});

test("a feed read its grant does not cover, when the grant is gone", () => {
  const p = after((d) =>
    json(d, "tehas-plugin.json", (v) => {
      v.asks = asks(v).filter((a) => a !== "feed:host");
    }),
  );
  assert.deepEqual(p, ['tehas-plugin.json: asks: the driver reads /feed/host.json, which no grant covers; add "feed:host" to asks']);
});

test("a view shown with no grant for it", () => {
  const p = after((d) =>
    json(d, "tehas-plugin.json", (v) => {
      v.asks = asks(v).filter((a) => a !== "view:host");
    }),
  );
  assert.ok(
    p.some((x) => x.includes("view:host") && x.includes("asks")),
    p.join("\n"),
  );
});

test("a bad tehas.toml", () => {
  assert.deepEqual(
    after((d) => edit(d, "tehas.toml", (s) => s.replace('version = "v2"', 'version = "v9"').replace('typescript = "7.x"', 'typescript = "5.x"'))),
    [
      'tehas.toml: standard.version: is "v9"; write version = "v2" (v3 once it is approved)',
      'tehas.toml: platform.typescript: is "5.x"; write typescript = "7.x"',
      'tehas.toml: platform.typescript: is not declared; write typescript = "7.x" under [platform]',
    ],
  );
});

for (const flag of STRICT_FAMILY) {
  for (const config of ["tsconfig.base.json", "tsconfig.driver.json", "tsconfig.view.json", "tsconfig.tests.json"]) {
    test(`a loose tsconfig: ${flag} false in ${config}`, () => {
      const p = after((d) =>
        json(d, config, (v) => {
          v.compilerOptions = { ...(v.compilerOptions as object), [flag]: false };
        }),
      );
      assert.ok(p.includes(`${config}: compilerOptions.${flag}: turns a strict check off; remove "${flag}"`), p.join("\n"));
    });
  }
}

test("an unpinned dependency, and TypeScript that is not 7.x", () => {
  assert.deepEqual(
    after((d) =>
      json(d, "package.json", (v) => {
        (v.devDependencies as Record<string, string>).typescript = "^5.9.3";
      }),
    ),
    [
      'package.json: devDependencies.typescript: "^5.9.3" is not an exact version; pin one version, as 1.2.3, and run npm install',
      'package.json: devDependencies.typescript: is ^5.9.3, not 7.x; pin "typescript": "7.0.2", the version tehas pins',
    ],
  );
});

test("a driver module in a subfolder is read: its feed read counts, and so does its missing grant", () => {
  // hoststats already asks feed:host, so the subfolder read is covered as is.
  const used = after((d) => {
    fs.mkdirSync(path.join(d, "dist/driver/util"), { recursive: true });
    fs.writeFileSync(path.join(d, "dist/driver/util/read.js"), 'export const feed = "/feed/host.json";\n');
  });
  assert.deepEqual(used, []);
  const uncovered = after((d) => {
    fs.mkdirSync(path.join(d, "dist/driver/util"), { recursive: true });
    fs.writeFileSync(path.join(d, "dist/driver/util/read.js"), 'export const feed = "/feed/mesh.json";\n');
  });
  assert.deepEqual(uncovered, ['tehas-plugin.json: asks: the driver reads /feed/mesh.json, which no grant covers; add "feed:mesh" to asks']);
});

test("a file under dist/driver that is not .js is refused", () => {
  const p = after((d) => fs.writeFileSync(path.join(d, "dist/driver/old.mjs"), "export {};\n"));
  assert.deepEqual(p, ["dist/driver/old.mjs: (file): is not a .js module, so no check reads it and the operator won't load it; build it to .js, or remove it"]);
});

test("a link under dist/driver is refused and never followed", () => {
  const p = after((d) => {
    fs.writeFileSync(path.join(d, "outside.js"), "git.push(1);\n");
    fs.symlinkSync(path.join(d, "outside.js"), path.join(d, "dist/driver/out.js"));
    fs.symlinkSync("..", path.join(d, "dist/driver/loop"));
    fs.symlinkSync(path.join(d, "nowhere.js"), path.join(d, "dist/driver/dangling.js"));
  });
  assert.deepEqual(p, [
    "dist/driver/dangling.js: (file): is a link, which no check follows; make it a plain file",
    "dist/driver/loop: (file): is a link, which no check follows; make it a plain file",
    "dist/driver/out.js: (file): is a link, which no check follows; make it a plain file",
  ]);
});

test("an action not pinned by sha", () => {
  const p = after((d) => edit(d, ".github/workflows/check.yml", (s) => s.replace(/actions\/checkout@[0-9a-f]{40}/, "actions/checkout@v7")));
  assert.equal(p.length, 1);
  assert.match(p[0] ?? "", /^\.github\/workflows\/check\.yml: line \d+: actions\/checkout@v7 is not pinned by sha; /);
});

test("bin/validate says ready on hoststats", { skip: nested && "inside bin/validate" }, () => {
  const dir = copyTree();
  try {
    linkTools(dir);
    gitInit(dir);
    const r = sh(dir, "bin/validate");
    assert.equal(lastLine(r.out), "ready", r.out + r.err);
    assert.equal(r.status, 0);
  } finally {
    remove(dir);
  }
});

test("bin/validate names a broken test as the first thing to fix", { skip: nested && "inside bin/validate" }, () => {
  const dir = copyTree();
  try {
    linkTools(dir);
    fs.writeFileSync(
      path.join(dir, "tests/broken.test.ts"),
      'import assert from "node:assert/strict";\nimport { test } from "node:test";\n\ntest("a broken test", () => assert.equal(1, 2));\n',
    );
    gitInit(dir);
    const r = sh(dir, "bin/validate");
    assert.equal(r.status, 1, r.out + r.err);
    assert.equal(lastLine(r.out), "not ready: tests: a broken test");
  } finally {
    remove(dir);
  }
});

test("bin/validate refuses a dist/ that is not what src/ builds to, with no git involved", () => {
  const dir = copyTree();
  try {
    linkTools(dir);
    edit(dir, "src/driver/host.ts", (t) => t.replace(/^\/\/ .*/, "// A changed first line, so dist/ is stale."));
    const r = sh(dir, "bin/validate");
    assert.equal(r.status, 1, r.out + r.err);
    assert.equal(lastLine(r.out), "not ready: build: dist/ was not what src/ builds to; bin/build has now rebuilt it, so check the change and keep it");
  } finally {
    remove(dir);
  }
});
