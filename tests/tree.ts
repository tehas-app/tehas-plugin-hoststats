// Temporary copies of the repository and temporary git repositories, for the
// tests of bin/.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { root } from "../sim/root.ts";

/** Set inside bin/validate: the tests that run it again skip, so it nests once. */
export const nested = process.env.TEHAS_EXAMPLE_VALIDATING === "1";

/** A copy of the tracked tree in a new temporary directory, minus `skip`. */
export function copyTree(skip: (f: string) => boolean = () => false): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-example-"));
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  for (const f of files) {
    if (skip(f) || !fs.existsSync(path.join(root, f))) continue;
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.copyFileSync(path.join(root, f), path.join(dir, f));
    fs.chmodSync(path.join(dir, f), fs.statSync(path.join(root, f)).mode);
  }
  return dir;
}

/** The installed tools in `dir`, as a link: no second install, no network. */
export function linkTools(dir: string): void {
  fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
}

export const remove = (dir: string) => fs.rmSync(dir, { recursive: true, force: true });

export function edit(dir: string, f: string, change: (s: string) => string): void {
  const p = path.join(dir, f);
  fs.writeFileSync(p, change(fs.readFileSync(p, "utf8")));
}

/** Runs a command in `dir` and gives its exit status and output, never throwing. */
export function sh(dir: string, cmd: string, args: string[] = []): { status: number; out: string; err: string } {
  // Without NODE_TEST_CONTEXT, a nested `node --test` runs as its own runner,
  // not as a child reporting to this one (which would hide its failures).
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;
  const r = spawnSync(cmd, args, { cwd: dir, encoding: "utf8", env: { ...env, GIT_CONFIG_NOSYSTEM: "1" } });
  return { status: r.status ?? -1, out: r.stdout, err: r.stderr };
}

/** Makes `dir` a git repository on main with one commit of what is in it. */
export function gitInit(dir: string): void {
  const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  git("add", "-A");
  git("commit", "-q", "-m", "The first commit");
}

export const lastLine = (s: string) => s.trim().split("\n").pop() ?? "";
