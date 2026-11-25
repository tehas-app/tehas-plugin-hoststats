// The driver's pure core: the paths, the answer's shape, and the one
// decision a run makes (is this press the refresh?). No DOM, no network,
// no clock, no storage (AGENTS R13): the effects live in main.ts.
// The feed path is the mount proposed in tehas-factory#3372; the driver
// reads it under the feed:host grant and copies the bytes out unchanged,
// as the floating spec part 5 wants of a feed input.

/** The run's context (spec v2 rev 8 part 5): why it started, and for a press its action. */
export interface Ctx {
  /** `clock`, `press` or `once`; a later minor may add values. */
  trigger?: string;
  action?: string;
}

/** The host snapshot tehas writes for the plugin to read (feed:host). */
export const FEED = "/feed/host.json";
/** The snapshot's copy in the run's output, which the view draws. */
export const OUT = "/out/host.json";
/** The manifest's one action, the press that asks for the snapshot now. */
export const REFRESH = "refresh";

/** What the refresh press answers: the copy done, or why it is not. */
export type Answer = { state: "ok"; bytes: number } | { state: "failed"; why: string };

export const ok = (bytes: number): Answer => ({ state: "ok", bytes });
export const failed = (why: string): Answer => ({ state: "failed", why });

/** The press of a named action that is not this driver's, as its reason; null when the press is the refresh. */
export function unknownPress(ctx: Ctx): string | null {
  if (ctx.trigger !== "press") return null;
  return ctx.action === REFRESH ? null : `no action ${String(ctx.action)}`;
}
