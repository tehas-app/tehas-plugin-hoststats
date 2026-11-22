// The pure part of the view against a fixed feed: test/fixtures/host.json is shaped like the snapshot of
// `tehas top` cut to its published keys (PUBLISHED in tehas's console/src/top.rs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FEED, MISS_RETRY, PERIOD, ROWS, STALE_AFTER, UNITS, agoText, dueToRead, layout, uptime } from '../view/host-data.js';

const host = JSON.parse(fs.readFileSync(new URL('./fixtures/host.json', import.meta.url), 'utf8'));
const AT = Date.parse(host.generatedAt);

test('the view reads the host feed and nothing else, on tehas\'s five-second period', () => {
  assert.equal(FEED, '/_feed/host.json');
  assert.equal(PERIOD, 5);
});

test('the fixture holds only the published keys', () => {
  assert.deepEqual(Object.keys(host).sort(), ['cycle', 'energy', 'factory', 'generatedAt', 'host', 'queue', 'units']);
});

test('the readings: cpus, load, cpu and memory with their gauges', () => {
  const v = layout(host, AT + 4000);
  assert.equal(v.state, 'live');
  assert.equal(v.present, true);
  assert.equal(v.ageSeconds, 4);
  assert.equal(v.cpus, '8 CPUs');
  assert.deepEqual(v.load, ['1.20', '0.90', '0.70']);
  assert.equal(v.cpu, '18.5%');
  assert.equal(v.cpuFilled, 2);
  assert.deepEqual(v.memory, { used: '12000', total: '32000', percent: 38, filled: 4 });
  assert.equal(v.label, 'Host: 8 cpus, using 18.5% of its cpus.');
});

test('the processes as the feed orders them, a row with no name left out, no reading as "--"', () => {
  const v = layout(host, AT);
  assert.deepEqual(v.rows, [
    { pid: 300, name: 'agent', cpu: '40%', mem: '7.3%', up: '16 min' },
    { pid: 200, name: 'tehas-cycle', cpu: '2%', mem: '4.9%', up: '1 min' },
    { pid: 100, name: 'systemd', cpu: '--', mem: '1.8%', up: '1 d' },
  ]);
});

test('the units: name, installed, state and the next firing', () => {
  assert.deepEqual(layout(host, AT).units, [
    { name: 'tehas-dispatch.timer', installed: 'enabled', state: 'active', next: '12:02:00' },
    { name: 'tehas-cycle@41.service', installed: '-', state: 'active', next: '' },
  ]);
});

test('a snapshot older than 30 seconds is stale', () => {
  assert.equal(STALE_AFTER, 30);
  assert.equal(layout(host, AT + 30000).state, 'live');
  const v = layout(host, AT + 31000);
  assert.equal(v.state, 'stale');
  assert.equal(v.label, 'Host: 8 cpus, no recent reading of /proc.');
  assert.equal(agoText(v.ageSeconds), 'just now');
  assert.equal(agoText(layout(host, AT + 600000).ageSeconds), '10 min ago');
});

test('a feed with no host section, or no time, is stale and draws empty', () => {
  for (const file of [{}, null, { ...host, host: null }, { ...host, generatedAt: 'x' }]) assert.equal(layout(file, AT).state, 'stale');
  const v = layout({}, AT);
  assert.equal(v.present, false);
  assert.equal(v.ageSeconds, null);
  assert.deepEqual(v.rows, []);
  assert.deepEqual(v.units, []);
  assert.equal(v.memory, null);
});

test('a longer list is cut to what the page draws, and names to 64 characters', () => {
  const many = { ...host,
    host: { ...host.host, processes: Array.from({ length: 40 }, (_, i) => ({ pid: i + 1, name: 'p'.repeat(100) })) },
    units: Array.from({ length: 50 }, (_, i) => ({ id: `u${i}.service` })) };
  const v = layout(many, AT);
  assert.equal(v.rows.length, ROWS);
  assert.equal(v.rows[0].name.length, 64);
  assert.equal(v.units.length, UNITS);
});

test('uptime reads in the coarsest unit', () => {
  assert.deepEqual([30, 61, 3600, 90000, -1, null].map(uptime), ['30 s', '1 min', '1 h', '1 d', '-', '-']);
});

test('no read while hidden, and a missing feed is asked again only after a minute', () => {
  assert.equal(dueToRead({}, 1000), true);
  assert.equal(dueToRead({ hidden: true }, 1000), false);
  assert.equal(dueToRead({ missedAt: 1000 }, 1000 + MISS_RETRY * 1000 - 1), false);
  assert.equal(dueToRead({ missedAt: 1000 }, 1000 + MISS_RETRY * 1000), true);
});
