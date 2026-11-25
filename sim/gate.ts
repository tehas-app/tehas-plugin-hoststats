// A stub of the host, the view's side of the interface, for development and
// the tests: a page that plays `<tehas-plugin-view>` around the view, on
// localhost. bin/sim and tests/ both use it.
//
// - The view runs in an `<iframe sandbox="allow-scripts">`, an opaque origin,
//   as spec v2 H8 frames it, under the frame's policy (`viewPolicy`, rev 8
//   part 6): `default-src 'none'` and `connect-src 'none'`. Its files are served with CORS for that
//   origin, and its page gets an inline import map for `solid-js` and
//   `@solidjs/web`, pointed at the kit's Solid release from node_modules.
// - On each frame load the stub host transfers one MessageChannel port, and
//   answers on it only (part 6.3): `output` on `ready`, `answer` to a
//   `press`, each with the `next` single-use nonce it issues; `error` for a
//   message past a limit (`too-large`, `too-many`), a press in flight
//   (`busy`), a nonce it did not issue or saw before (`nonce`), or a plugin
//   that is down.
// - The host page carries a TEST DATA badge: what it shows is the stub's.
// - With `reload`, the host page reloads when the simulator rebuilds.
//
// TODO(#3297): replace with what tehas ships for running a view locally, if
// it does.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { root } from "./root.ts";

const dist = path.join(root, "dist", "view");
const modules = path.join(root, "node_modules");

const IMPORT_MAP = JSON.stringify({
  imports: {
    "solid-js": "/_solid/solid-js/dist/solid.js",
    "solid-js/internal": "/_solid/solid-js/dist/internal.js",
    "@solidjs/web": "/_solid/@solidjs/web/dist/web.js",
    "@solidjs/signals": "/_solid/@solidjs/signals/dist/prod/index.js",
  },
});
const BADGE = `<div class="sim-badge" style="position:fixed;top:0.5rem;right:0.5rem;padding:0.125rem 0.5rem;background:#b42318;color:#fff;font:bold 12px/1.5 system-ui,sans-serif;border-radius:3px">TEST DATA</div>`;
const RELOAD = `<script type="module">new EventSource("/_sim/events").onmessage = () => location.reload();</script>`;
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

export interface HostError {
  code: string;
  text: string;
}
/** What the stub host answers on the view's port. */
export interface Plan {
  /** The last run's output files, or the error the host sends instead. */
  output: { files: Record<string, string> } | { error: HostError };
  /** The answer to the view's press: its result, or a refusal. */
  answer?: { result: unknown } | { error: HostError };
  /** How long each answer takes. */
  delayMs?: number;
  /** Leave the view's scripts out, as if they failed to load. */
  blockScript?: boolean;
  /** Serve the reload script and its events. */
  reload?: boolean;
}

// The host element's side, run in the host page.
const HOST = `
const plan = JSON.parse(document.getElementById("plan").textContent);
const frame = document.getElementById("view");
const later = (f) => setTimeout(f, plan.delayMs || 0);
frame.addEventListener("load", () => {
  // A new load: a new port, and the old one's nonces are dead with it.
  const ch = new MessageChannel();
  const issued = new Set();
  let inFlight = false, count = 0, second = 0, inSecond = 0;
  const nonce = () => {
    const n = "test-nonce-" + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
    issued.add(n);
    return n;
  };
  const send = (m) => ch.port1.postMessage({ v: 1, ...m });
  const refuse = (code, text) => send({ type: "error", code, text });
  ch.port1.onmessage = (e) => {
    const m = e.data;
    const now = Math.floor(Date.now() / 1000);
    if (now !== second) { second = now; inSecond = 0; }
    count++; inSecond++;
    if (count > 2000 || inSecond > 20) return refuse("too-many", "past the messages a load may send");
    if (JSON.stringify(m ?? null).length > 65536) return refuse("too-large", "a message is at most 64 KiB");
    if (!m || m.v !== 1) return refuse("dropped", "not a message of channel v1");
    if (m.type === "ready") {
      later(() => send("error" in plan.output ? { type: "error", ...plan.output.error } : { type: "output", run: { id: "test-run-1", at: "2000-01-01T00:00:00.000Z" }, files: plan.output.files, next: nonce() }));
    } else if (m.type === "press") {
      if (inFlight) return refuse("busy", "a press is in flight");
      if (typeof m.nonce !== "string" || !issued.delete(m.nonce)) return refuse("nonce", "not a nonce this host issued, or used before");
      inFlight = true;
      later(() => {
        inFlight = false;
        const a = plan.answer || { error: { code: "no-action", text: "no answer in this plan" } };
        send({ type: "answer", nonce: m.nonce, next: nonce(), ...("error" in a ? { error: a.error } : { result: a.result }) });
      });
    }
  };
  frame.contentWindow.postMessage({ type: "port", v: 1 }, "*", [ch.port2]);
});
`;

function hostPage(plan: Plan, view: string): string {
  const data = JSON.stringify(plan).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Stub host</title>${plan.reload ? RELOAD : ""}
<style>body{margin:0}iframe{border:0;width:100%;height:100vh}</style></head>
<body>
${BADGE}
<script type="application/json" id="plan">${data}</script>
<iframe id="view" sandbox="allow-scripts" src="/view/${view}"></iframe>
<script type="module">${HOST}</script>
</body></html>`;
}

export interface Site {
  url: string;
  /** Tells every open host page to reload. */
  reload(): void;
  close(): Promise<void>;
}

const IMPORT_MAP_HASH = `'sha256-${createHash("sha256").update(IMPORT_MAP).digest("base64")}'`;

/** The view frame's Content-Security-Policy, for the stub on `host`. */
export function viewPolicy(host: string): string {
  const self = `http://${host}`;
  return [
    "default-src 'none'",
    `script-src ${self} ${IMPORT_MAP_HASH}`,
    `style-src ${self}`,
    "connect-src 'none'",
    "worker-src blob:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/** Serves the stub host on 127.0.0.1. `plan` is read on each page load. */
export async function serve(plan: Plan | (() => Plan), port = 0): Promise<Site> {
  const listeners = new Set<http.ServerResponse>();
  const now = () => (typeof plan === "function" ? plan() : plan);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    try {
      if (url.pathname === "/") return send(res, 200, TYPES[".html"] ?? "", hostPage(now(), "index.html"));
      if (url.pathname === "/notes") return send(res, 200, TYPES[".html"] ?? "", hostPage(now(), "notes.html"));
      if (url.pathname === "/_sim/events" && now().reload) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
        listeners.add(res);
        req.on("close", () => listeners.delete(res));
        return;
      }
      if (url.pathname.startsWith("/_solid/")) return send(res, 200, "text/javascript", await fs.readFile(inside(modules, url.pathname.slice(8))));
      if (!url.pathname.startsWith("/view/")) return send(res, 404, "text/plain", "not found");
      const file = url.pathname.slice(6);
      if (now().blockScript && file.endsWith(".js")) return send(res, 404, "text/plain", "blocked");
      const raw = await fs.readFile(inside(dist, file));
      const body = file.endsWith(".html") ? raw.toString().replace("<head>", `<head>\n<script type="importmap">${IMPORT_MAP}</script>`) : raw;
      // Every view response carries the frame's policy (spec v2 rev 8 part 6,
      // 6.1): nothing by default, scripts and styles from this server and the
      // import map by hash, `connect-src 'none'`, and workers only from
      // `blob:` URLs (the policy can't hold the worker's type). The host lists each script and style by hash;
      // the stub allows its own server in their place. A worker script fetched
      // by URL is refused, and every response carries the policy, so none
      // escapes it.
      const csp = { "content-security-policy": viewPolicy(req.headers.host ?? "127.0.0.1") };
      return send(res, 200, TYPES[path.extname(file)] ?? "application/octet-stream", body, csp);
    } catch {
      return send(res, 404, "text/plain", "not found");
    }
  });
  await new Promise<void>((ok) => server.listen(port, "127.0.0.1", () => ok()));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    reload: () => {
      for (const l of listeners) l.write("data: reload\n\n");
    },
    close: () => {
      for (const l of listeners) l.end();
      return new Promise<void>((ok) => server.close(() => ok()));
    },
  };
}

function send(res: http.ServerResponse, status: number, type: string, body: string | Uint8Array, extra: Record<string, string> = {}) {
  // The view's frame is an opaque origin; its scripts and styles need CORS.
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "access-control-allow-origin": "*", ...extra });
  res.end(body);
}

/** A path under `base`, never outside it. */
function inside(base: string, rel: string) {
  const p = path.resolve(base, rel);
  if (!p.startsWith(base + path.sep)) throw new Error("outside");
  return p;
}
