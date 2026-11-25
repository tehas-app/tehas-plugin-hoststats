// The view's one channel to its host element (spec v2 rev 5 part 6.3, H8).
// The host transfers one MessagePort per frame load; the view takes the
// first, ignores any other, and talks only on that port, never on
// `parent.postMessage`. A new load gets a new port, so old nonces are dead.
//
// Messages carry `type` and `v` (1): the view sends `ready` and `press`; the
// host sends `output`, `answer` and `error`. The host issues each press's
// single-use nonce, as `next` in `output` and `answer`. It caps message size
// and rate and allows one press in flight; a drop comes back as `error`
// (`too-large`, `too-many`, `busy`).
//
// The handshake (rev 6, tehas-factory#3350): the first message is
// `{type: "port", v: 1}` from the parent with exactly one port; the view
// drops anything before it and takes no second port.

export const V = 1;

export type Read<T> = { state: "ok"; value: T } | { state: "failed"; why: string };
/** The last run's output: each /out path to its text. */
export type Files = Readonly<Record<string, string>>;

type HostMessage =
  | { type: "output"; v: number; run: { id: string; at: string }; files: Record<string, string>; next?: string }
  | { type: "answer"; v: number; nonce: string; result?: unknown; error?: { code: string; text: string }; next?: string }
  | { type: "error"; v: number; code: string; text: string };

export interface Channel {
  /** The output the host pushes on `ready`. */
  readonly output: Promise<Read<Files>>;
  /** Presses `action` once; one press in flight at a time. */
  press(action: string, args: Readonly<Record<string, unknown>>): Promise<Read<unknown>>;
}

/** What a view needs of its window: the parent, and its messages. */
export interface Frame {
  readonly parent: unknown;
  addEventListener(type: "message", fn: (e: MessageEvent) => void): void;
  removeEventListener(type: "message", fn: (e: MessageEvent) => void): void;
}

const said = (m: { code: string; text: string }) => `${m.code}: ${m.text}`;

function isHostMessage(d: unknown): d is HostMessage {
  if (typeof d !== "object" || d === null) return false;
  const m = d as Record<string, unknown>;
  if (m.v !== V) return false;
  if (m.type === "output") return typeof m.files === "object" && m.files !== null;
  if (m.type === "answer") return typeof m.nonce === "string";
  return m.type === "error" && typeof m.code === "string" && typeof m.text === "string";
}

/** Opens the channel: waits for the host's port, then says `ready`. */
export function connect(frame: Frame, waitMs = 5000): Channel {
  let port: MessagePort | null = null;
  let pending: { nonce: string; done: (r: Read<unknown>) => void } | null = null;
  // The host's next single-use nonce; a press spends it.
  let next: string | null = null;
  let gotOutput: (r: Read<Files>) => void = () => undefined;
  const output = new Promise<Read<Files>>((ok) => {
    gotOutput = ok;
  });
  const timer = setTimeout(() => gotOutput({ state: "failed", why: "no port from the host" }), waitMs);

  const onMessage = (e: MessageEvent) => {
    const p = e.ports[0];
    const d = e.data as { type?: unknown; v?: unknown } | null;
    if (e.source !== frame.parent || e.ports.length !== 1 || !p || d?.type !== "port" || d.v !== V) return;
    frame.removeEventListener("message", onMessage);
    port = p;
    port.onmessage = (m: MessageEvent) => {
      const d: unknown = m.data;
      if (!isHostMessage(d)) return;
      if (d.type !== "error" && typeof d.next === "string") next = d.next;
      if (d.type === "output") {
        clearTimeout(timer);
        gotOutput({ state: "ok", value: d.files });
      } else if (d.type === "answer" && pending && d.nonce === pending.nonce) {
        const done = pending.done;
        pending = null;
        done(d.error ? { state: "failed", why: said(d.error) } : { state: "ok", value: d.result });
      } else if (d.type === "error") {
        if (pending) {
          const done = pending.done;
          pending = null;
          done({ state: "failed", why: said(d) });
        } else {
          clearTimeout(timer);
          gotOutput({ state: "failed", why: said(d) });
        }
      }
    };
    port.postMessage({ type: "ready", v: V });
  };
  frame.addEventListener("message", onMessage);

  return {
    output,
    press(action, args) {
      if (!port) return Promise.resolve({ state: "failed", why: "no port from the host" });
      if (pending) return Promise.resolve({ state: "failed", why: "a press is in flight" });
      const n = next;
      if (n === null) return Promise.resolve({ state: "failed", why: "no nonce from the host" });
      next = null;
      const live = port;
      return new Promise((done) => {
        pending = { nonce: n, done };
        live.postMessage({ type: "press", v: V, action, nonce: n, args });
      });
    },
  };
}
