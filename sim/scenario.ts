// A scenario: stub data in sim/scenarios/<name>.json, played through the real
// driver on the stub: a run by hand and a press of "refresh". Its result is
// the stub host's plan: the output files it pushes and the answer to the
// press. The plugin has no clock, no random and no viewer, so a scenario is
// only its feed snapshot and whether the plugin is up.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FEED, REFRESH } from "#dist/driver/host.js";
import type { Plan } from "./gate.ts";
import { root } from "./root.ts";
import { stand } from "./stub/state.ts";

export interface Scenario {
  what: string;
  /**
   * The host snapshot tehas wrote for this run, as it stands at FEED
   * (feed:host, the mount of tehas-factory#3372). Absent: there is no feed.
   */
  feed?: unknown;
  /** "down": the host cannot reach the plugin, and says so on the port. */
  backend: "up" | "down";
}

const dir = path.join(root, "sim", "scenarios");

export const SCENARIOS = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -5))
  .sort();

export function load(name: string): Scenario {
  if (!SCENARIOS.includes(name)) throw new Error(`no scenario ${name}; there are ${SCENARIOS.join(", ")}`);
  return JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8")) as Scenario;
}

/** Runs the driver under `scenario` and gives the stub host's plan. */
export async function play(scenario: Scenario): Promise<Plan> {
  if (scenario.backend === "down") return { output: { error: { code: "down", text: "test-error: the plugin is not running" } } };
  stand.reset();
  if (scenario.feed !== undefined) stand.files.set(FEED, new TextEncoder().encode(`${JSON.stringify(scenario.feed, null, 2)}\n`));
  // bin/sim runs each play in a fresh process, so a rebuild is picked up.
  const url = `${pathToFileURL(path.join(root, "dist", "driver", "main.js")).href}?play=${Date.now()}`;
  const { run } = (await import(url)) as typeof import("#dist/driver/main.js");
  run({ trigger: "once" });
  const result: unknown = run({ trigger: "press", action: REFRESH });
  const files: Record<string, string> = {};
  for (const [p, bytes] of stand.files) if (p.startsWith("/out/")) files[p] = new TextDecoder().decode(bytes);
  return { output: { files }, answer: { result } };
}
