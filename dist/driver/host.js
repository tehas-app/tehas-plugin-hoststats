// The driver's pure core: the paths, the answer's shape, and the one
// decision a run makes (is this press the refresh?). No DOM, no network,
// no clock, no storage (AGENTS R13): the effects live in main.ts.
// The feed path is the mount proposed in tehas-factory#3372; the driver
// reads it under the feed:host grant and copies the bytes out unchanged,
// as the floating spec part 5 wants of a feed input.
/** The host snapshot tehas writes for the plugin to read (feed:host). */
export const FEED = "/feed/host.json";
/** The snapshot's copy in the run's output, which the view draws. */
export const OUT = "/out/host.json";
/** The manifest's one action, the press that asks for the snapshot now. */
export const REFRESH = "refresh";
export const ok = (bytes) => ({ state: "ok", bytes });
export const failed = (why) => ({ state: "failed", why });
/** The press of a named action that is not this driver's, as its reason; null when the press is the refresh. */
export function unknownPress(ctx) {
    if (ctx.trigger !== "press")
        return null;
    return ctx.action === REFRESH ? null : `no action ${String(ctx.action)}`;
}
