// A refresh: the view's files, and only those, land in /out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { copyView } from '../driver/main.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const view = path.join(root, 'view');
const main = path.join(root, 'driver', 'main.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-out-'));

test('a refresh copies every file of the view to /out and replaces what was there', () => {
  const out = tmp();
  fs.writeFileSync(path.join(out, 'old.html'), 'stale');
  const said = execFileSync('node', [main], { env: { ...process.env, PLUGIN_OUT: out }, encoding: 'utf8' });
  const want = fs.readdirSync(view).sort();
  assert.deepEqual(fs.readdirSync(out).sort(), want);
  for (const f of want) assert.equal(fs.readFileSync(path.join(out, f), 'utf8'), fs.readFileSync(path.join(view, f), 'utf8'));
  assert.match(said, new RegExp(`copied ${want.length} file`));
});

test('"refresh" is the one word it takes; anything else is 64', () => {
  const out = tmp();
  assert.equal(spawnSync('node', [main, 'refresh'], { env: { ...process.env, PLUGIN_OUT: out } }).status, 0);
  assert.equal(spawnSync('node', [main, 'hook'], { env: { ...process.env, PLUGIN_OUT: out } }).status, 64);
});

test('a view with no index.html fails the run and leaves /out as it was', () => {
  const empty = tmp(), out = tmp();
  fs.writeFileSync(path.join(out, 'index.html'), 'last good');
  assert.throws(() => copyView(empty, out), /no index\.html/);
  assert.equal(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), 'last good');
  assert.equal(spawnSync('node', [main], { env: { ...process.env, PLUGIN_OUT: out, PLUGIN_VIEW: empty } }).status, 1);
});
