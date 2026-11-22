// The view as the plugin web part's policy sees it: scripts and styles from the view's own files, no inline script,
// no handler attribute, nothing from another site, and requests only to the feeds the manifest asks for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const viewDir = path.join(root, 'view');
const files = fs.readdirSync(viewDir, { recursive: true }).filter((f) => fs.statSync(path.join(viewDir, f)).isFile());
const read = (f) => fs.readFileSync(path.join(viewDir, f), 'utf8');
const ofType = (ext) => files.filter((f) => f.endsWith(ext));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tehas-plugin.json'), 'utf8'));

// The paths the grants open: live:<feed> is /_live/<feed>.json, feed:<name> is /_feed/<name>.json.
const allowed = new Set(manifest.asks.flatMap((a) => {
  const m = /^(live|feed):([a-z]+)$/.exec(a);
  return m ? [`/_${m[1]}/${m[2]}.json`] : [];
}));
// Addresses a script may name that the page never loads: GitHub links and the SVG namespace.
const NAMED = ['https://github.com/', 'http://www.w3.org/2000/svg'];

test('the view has an index.html, its scripts, its styles and nothing else', () => {
  assert.ok(files.includes('index.html'));
  for (const f of files) assert.match(f, /\.(html|css|js)$/, f);
});

test('no inline script, style block, handler attribute, refresh, frame or base in the HTML', () => {
  for (const f of ofType('.html')) {
    const html = read(f);
    for (const tag of html.match(/<script\b[^>]*>/gi) || []) assert.match(tag, /\ssrc="[^"]+"/, `${f}: ${tag}`);
    assert.doesNotMatch(html, /<script\b[^>]*>[^<\s]/i, `${f}: a script with a body`);
    assert.doesNotMatch(html, /<style\b/i, f);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, f);
    assert.doesNotMatch(html, /\sstyle\s*=/i, f);
    assert.doesNotMatch(html, /http-equiv\s*=\s*"?refresh/i, f);
    assert.doesNotMatch(html, /<(iframe|frame|object|embed|base)\b/i, f);
    assert.doesNotMatch(html, /javascript:/i, f);
  }
});

test('every script and stylesheet is one of the view\'s own files, by a relative path', () => {
  for (const f of ofType('.html')) {
    const html = read(f);
    const refs = [...html.matchAll(/<(?:script|link)\b[^>]*\s(?:src|href)="([^"]+)"/gi)].map((m) => m[1]);
    assert.ok(refs.length > 0);
    for (const r of refs) {
      assert.doesNotMatch(r, /^([a-z]+:|\/)/i, `${f}: ${r}`);
      assert.ok(files.includes(path.join(path.dirname(f), r)), `${f}: ${r} is not in view/`);
    }
  }
});

test('no address of another site in the HTML or the styles, and no import or url() in the styles', () => {
  for (const f of [...ofType('.html'), ...ofType('.css')]) assert.doesNotMatch(read(f), /\bhttps?:\/\/|(^|[^a-z])\/\/[a-z0-9]/i, f);
  for (const f of ofType('.css')) {
    assert.doesNotMatch(read(f), /@import/i, f);
    assert.doesNotMatch(read(f), /url\(/i, f);
  }
});

test('the scripts load nothing from elsewhere and build no markup from text', () => {
  for (const f of ofType('.js')) {
    const js = read(f);
    for (const bad of ['eval(', 'new Function', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'import(',
      'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'localStorage', 'sessionStorage', 'setAttribute("on', 'setAttribute("style']) {
      assert.ok(!js.includes(bad), `${f}: ${bad}`);
    }
    for (const m of js.matchAll(/^import\b[^;]*from\s+"([^"]+)"/gm)) {
      assert.match(m[1], /^\.\/[a-z-]+\.js$/, `${f}: ${m[1]}`);
      assert.ok(files.includes(m[1].slice(2)), `${f}: ${m[1]}`);
    }
    for (const m of js.matchAll(/https?:\/\/[^\s"'`)]*/g)) assert.ok(NAMED.some((n) => m[0].startsWith(n)), `${f}: ${m[0]}`);
  }
});

test('one fetch in the whole view, and the only paths it can be given are the granted feeds', () => {
  const js = ofType('.js').map(read).join('\n');
  assert.equal((js.match(/\bfetch\(/g) || []).length, 1);
  const paths = new Set([...js.matchAll(/(["'`])(\/[^"'`\s]*)\1/g)].map((m) => m[2]));
  assert.deepEqual([...paths].sort(), [...allowed].sort());
  assert.ok(allowed.size >= 1 && allowed.size <= 4);
});
