#!/usr/bin/env node
// The plugin's entrypoint: one refresh, which copies the view's files to /out.
//
// usage: node driver/main.mjs [refresh]
//
// The view is static: it reads the factory's feeds in the browser, through
// the gate, so a refresh asks for nothing and only puts the files in place.
// PLUGIN_VIEW and PLUGIN_OUT move the two folders for tests and by-hand runs.
//
// exit: 0 done; 1 the copy failed (the last good view stays); 64 usage.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Copies every file of `view` into `out`, which it empties first. Returns the paths copied, relative to `out`. */
export function copyView(view, out) {
  const files = fs.readdirSync(view, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(view, path.join(e.parentPath, e.name)))
    .sort();
  if (!files.includes('index.html')) throw new Error(`${view} has no index.html`);
  fs.mkdirSync(out, { recursive: true });
  for (const e of fs.readdirSync(out)) fs.rmSync(path.join(out, e), { recursive: true, force: true });
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
    fs.copyFileSync(path.join(view, f), path.join(out, f));
  }
  return files;
}

function main(args) {
  if (args.length > 1 || (args.length === 1 && args[0] !== 'refresh')) {
    process.stderr.write('usage: node driver/main.mjs [refresh]\n');
    return 64;
  }
  const view = process.env.PLUGIN_VIEW || path.resolve(here, '..', 'view');
  const out = process.env.PLUGIN_OUT || '/out';
  try {
    const files = copyView(view, out);
    process.stdout.write(`refresh: copied ${files.length} file(s) to ${out}\n`);
    return 0;
  } catch (e) {
    process.stderr.write(`refresh: ${e.message}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
