// bin/next-version and bin/tag, each on temporary git repositories.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { root } from "../sim/root.ts";
import { copyTree, edit, gitInit, lastLine, linkTools, nested, remove, sh } from "./tree.ts";

/** A repository holding only bin/next-version, on main, with no tag. */
function versionRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hoststats-git-"));
  fs.mkdirSync(path.join(dir, "bin"));
  fs.copyFileSync(path.join(root, "bin/next-version"), path.join(dir, "bin/next-version"));
  gitInit(dir);
  return dir;
}
const git = (dir: string, ...a: string[]) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
const commit = (dir: string, subject: string, trailer?: string) =>
  git(dir, "commit", "-q", "--allow-empty", "-m", subject, ...(trailer ? ["-m", `Release: ${trailer}`] : []));
const next = (dir: string) => sh(dir, "bin/next-version").out.trim();

test("next-version: the first release is v0.1.0", () => {
  const dir = versionRepo();
  try {
    commit(dir, "A change", "major");
    assert.equal(next(dir), "v0.1.0");
  } finally {
    remove(dir);
  }
});

test("next-version: a commit with no trailer is a patch", () => {
  const dir = versionRepo();
  try {
    git(dir, "tag", "-a", "v0.1.0", "-m", "v0.1.0");
    commit(dir, "A fix");
    assert.equal(next(dir), "v0.1.1");
  } finally {
    remove(dir);
  }
});

test("next-version: minor and major trailers, and the highest wins", () => {
  const dir = versionRepo();
  try {
    git(dir, "tag", "-a", "v1.2.3", "-m", "v1.2.3");
    commit(dir, "A fix");
    commit(dir, "A part", "minor");
    assert.equal(next(dir), "v1.3.0");
    commit(dir, "A break", "major");
    commit(dir, "Another fix", "patch");
    assert.equal(next(dir), "v2.0.0");
  } finally {
    remove(dir);
  }
});

test("next-version: before 1.0.0 a major counts as a minor", () => {
  const dir = versionRepo();
  try {
    git(dir, "tag", "-a", "v0.3.1", "-m", "v0.3.1");
    commit(dir, "A break", "major");
    assert.equal(next(dir), "v0.4.0");
  } finally {
    remove(dir);
  }
});

test("next-version: a merge counts its merged commits' trailers", () => {
  const dir = versionRepo();
  try {
    git(dir, "tag", "-a", "v1.0.0", "-m", "v1.0.0");
    git(dir, "checkout", "-q", "-b", "part");
    commit(dir, "A part", "minor");
    git(dir, "checkout", "-q", "main");
    git(dir, "merge", "-q", "--no-ff", "-m", "Merge the part", "part");
    assert.equal(next(dir), "v1.1.0");
  } finally {
    remove(dir);
  }
});

test("next-version: outside a git repository it exits 1", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hoststats-nogit-"));
  try {
    fs.mkdirSync(path.join(dir, "bin"));
    fs.copyFileSync(path.join(root, "bin/next-version"), path.join(dir, "bin/next-version"));
    const r = sh(dir, "bin/next-version");
    assert.deepEqual([r.status, r.out], [1, ""]);
    assert.match(r.err, /not a git repository/);
  } finally {
    remove(dir);
  }
});

test("next-version: no commits since the tag prints nothing", () => {
  const dir = versionRepo();
  try {
    git(dir, "tag", "-a", "v0.1.0", "-m", "v0.1.0");
    const r = sh(dir, "bin/next-version");
    assert.deepEqual([r.status, r.out], [0, ""]);
  } finally {
    remove(dir);
  }
});

/** A whole copy of the plugin as a git repository on main. */
function pluginRepo(): string {
  const dir = copyTree();
  linkTools(dir);
  gitInit(dir);
  return dir;
}

test("tag: a dirty tree is refused", () => {
  const dir = pluginRepo();
  try {
    fs.writeFileSync(path.join(dir, "scratch.txt"), "x");
    const r = sh(dir, "bin/tag");
    assert.equal(r.status, 1);
    assert.match(r.err, /the tree has changes/);
  } finally {
    remove(dir);
  }
});

test("tag: a commit that is not on main is refused", () => {
  const dir = pluginRepo();
  try {
    git(dir, "checkout", "-q", "-b", "side");
    commit(dir, "A side change");
    const r = sh(dir, "bin/tag");
    assert.equal(r.status, 1);
    assert.match(r.err, /HEAD is not on main/);
  } finally {
    remove(dir);
  }
});

test("tag: an existing tag is refused and never moved", () => {
  const dir = pluginRepo();
  try {
    git(dir, "tag", "-a", "v0.1.0", "-m", "v0.1.0", "HEAD");
    // v0.1.1 already names a commit that main does not reach, so the next
    // version from main's history is taken.
    git(dir, "checkout", "-q", "-b", "side");
    commit(dir, "A side change");
    git(dir, "tag", "-a", "v0.1.1", "-m", "elsewhere");
    git(dir, "checkout", "-q", "main");
    commit(dir, "A fix");
    const before = git(dir, "rev-parse", "v0.1.1");
    // From a subdirectory: bin/tag works from the repository's root.
    const r = sh(path.join(dir, "src"), "../bin/tag");
    assert.equal(r.status, 1, r.out + r.err);
    assert.match(r.err, /v0\.1\.1 exists; a tag is never moved/);
    assert.equal(git(dir, "rev-parse", "v0.1.1"), before);
  } finally {
    remove(dir);
  }
});

test("tag: an invalid plugin is refused", () => {
  const dir = pluginRepo();
  try {
    edit(dir, "tehas-plugin.json", (s) => s.replace('"plugin": 2', '"plugin": 1'));
    git(dir, "commit", "-q", "-am", "A broken manifest");
    const r = sh(dir, "bin/tag");
    assert.equal(r.status, 1);
    assert.match(r.err, /bin\/validate says not ready: checks: tehas-plugin\.json: plugin: must be 2/);
    assert.equal(git(dir, "tag", "-l"), "");
  } finally {
    remove(dir);
  }
});

test("tag: --dry-run changes nothing, then a ready plugin is tagged", { skip: nested && "inside bin/validate" }, () => {
  const dir = pluginRepo();
  try {
    const dry = sh(path.join(dir, "src", "view"), "../../bin/tag", ["--dry-run"]);
    assert.equal(dry.status, 0, dry.out + dry.err);
    assert.match(dry.out, /would tag v0\.1\.0 on [0-9a-f]+:/);
    assert.match(dry.out, /Plugin spec 2\.0\.0-r8 \(tehas-plugin\.json "spec"\)\.\n\n- The first commit/);
    assert.equal(git(dir, "tag", "-l"), "");
    const r = sh(dir, "bin/tag");
    assert.equal(lastLine(r.out), "tagged v0.1.0", r.out + r.err);
    assert.equal(git(dir, "cat-file", "-t", "v0.1.0").trim(), "tag");
  } finally {
    remove(dir);
  }
});
