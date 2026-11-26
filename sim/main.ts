// bin/sim's Node half: build, play the scenario, serve, and on each change
// under src/ build, play and reload again.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { type Plan, serve } from "./gate.ts";
import { root } from "./root.ts";
import { load, SCENARIOS } from "./scenario.ts";

const args = process.argv.slice(2);
let name = "ok";
let port = 8040;
let watch = true;
let build = true;
let smoke = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--scenario") name = args[++i] ?? "";
  else if (a === "--port") port = Number(args[++i]);
  else if (a === "--no-watch") watch = false;
  else if (a === "--no-build") build = false;
  else if (a === "--smoke") smoke = true;
  else {
    console.error("usage: bin/sim [--scenario <name>] [--port <n>] [--no-watch] [--no-build] | bin/sim --smoke");
    process.exit(64);
  }
}
if (!SCENARIOS.includes(name)) {
  console.error(`sim: no scenario ${name}; there are ${SCENARIOS.join(", ")}`);
  process.exit(64);
}

function rebuild() {
  execFileSync(path.join(root, "bin", "build"), { stdio: ["ignore", "ignore", "inherit"] });
}

function playFresh(name: string): Plan {
  const argv = [...process.execArgv, path.join(import.meta.dirname, "play.js"), name];
  return JSON.parse(execFileSync(process.execPath, argv, { encoding: "utf8" })) as Plan;
}

// bin/sim has built already, unless --no-build.
void build;

if (smoke) {
  // Every scenario once: the host page and the view are served, and the
  // plan says what the scenario means.
  for (const s of SCENARIOS) {
    const plan = playFresh(s);
    const site = await serve(plan, 0);
    try {
      const page = await fetch(site.url);
      const view = await fetch(new URL("view/index.html", site.url));
      const up = load(s).backend === "up";
      if (!page.ok || !(await page.text()).includes("TEST DATA")) throw new Error(`${s}: the host page was not served`);
      if (!view.ok) throw new Error(`${s}: the view was not served`);
      if ("files" in plan.output !== up) throw new Error(`${s}: the plan's output does not match backend ${load(s).backend}`);
      console.log(`sim: ${s}: ok`);
    } finally {
      await site.close();
    }
  }
  process.exit(0);
}

const scenario = load(name);
let plan = playFresh(name);
const site = await serve(() => ({ ...plan, reload: true }), port);
console.log(`sim: ${name}: ${scenario.what}`);
console.log(`sim: ${site.url}`);

if (watch) {
  let timer: NodeJS.Timeout | undefined;
  fs.watch(path.join(root, "src"), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        rebuild();
        plan = playFresh(name);
        site.reload();
        console.log("sim: rebuilt and reloaded");
      } catch {
        console.error("sim: the build failed; the last good build stays");
      }
    }, 200);
  });
}
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => void site.close().then(() => process.exit(0)));
