// What tehas reads from this repository before it runs anything: the manifest and the Dockerfile's rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const NAME = 'hoststats';
const ASKS = ['view', 'menu', 'feed:host'];

test('the manifest asks what the spec says, with the fields of a batch plugin with a view', () => {
  assert.deepEqual(JSON.parse(read('tehas-plugin.json')), {
    plugin: 1,
    kind: 'batch',
    name: NAME,
    label: 'Host',
    license: 'Apache-2.0',
    build: 'Dockerfile',
    asks: ASKS,
    timeout: 60,
    view: { label: 'Host' },
  });
});

test('the manifest keeps the reader\'s rules', () => {
  const m = JSON.parse(read('tehas-plugin.json'));
  assert.match(m.name, /^[a-z][a-z0-9]{0,11}$/);
  for (const l of [m.label, m.view.label]) assert.ok(l.length >= 1 && l.length <= 24 && !/[\u0000-\u001f\u007f-\u009f]/.test(l));
  assert.ok(m.timeout >= 60 && m.timeout <= 14400);
  assert.equal(new Set(m.asks).size, m.asks.length);
  assert.ok(fs.existsSync(path.join(root, m.build)));
  assert.ok(Buffer.byteLength(read('tehas-plugin.json')) <= 64 * 1024);
});

test('the Dockerfile keeps the build rules: base by digest, no syntax line, no ADD, no ONBUILD, uid 10001', () => {
  const lines = read('Dockerfile').split('\n');
  const froms = lines.filter((l) => /^\s*FROM\s/i.test(l));
  assert.equal(froms.length, 1);
  assert.match(froms[0], /^FROM node:22-bookworm@sha256:[0-9a-f]{64}$/);
  assert.ok(!lines.some((l) => /^#\s*syntax\s*=/i.test(l)));
  assert.ok(!lines.some((l) => /^\s*(ADD|ONBUILD)\s/i.test(l)));
  assert.ok(lines.includes('USER 10001:10001'));
  assert.ok(lines.some((l) => l.startsWith('RUN ["node", "--test"')));
  assert.ok(lines.some((l) => l.startsWith('ENTRYPOINT') && l.includes('/plugin/driver/main.mjs')));
});

test('the README gives the spec\'s grant line for the tehas-tehas instance', () => {
  const line = `TEHAS_PLUGIN_GRANTS_${NAME.toUpperCase()}="<commit> ${ASKS.join(' ')}"`;
  assert.ok(read('README.md').split('\n').includes(line), line);
});

test('the licence is Apache-2.0, and the notice names it and where the code came from', () => {
  assert.match(read('LICENSE'), /Apache License\s+Version 2\.0/);
  assert.match(read('NOTICE'), /Apache License, Version 2\.0/);
  assert.match(read('NOTICE'), /f4759c1ab1b4b8984089cafc98371d8326ceeef1/);
});
