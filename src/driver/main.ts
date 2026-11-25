// The driver's entry, and its one shell module: every host call is made
// here (AGENTS R13). One run copies the host snapshot from the feed mount
// to /out/host.json, the bytes unchanged; the view draws it from the run's
// output over its port (spec v2 rev 8 part 6.3). The press of "refresh"
// answers with the copy's outcome; every other trigger - a run by hand,
// and the timed runs once #3309 gives every: and clock: - copies too.
//
// The 1.x refresh filled /out with the view's files, which tehas served as
// the page; the v2 view is served from dist/, so the snapshot is what the
// run writes now, and it is written byte for byte as the feed gave it.
import { fs, log } from "tehas";
import { type Answer, type Ctx, FEED, failed, OUT, ok, unknownPress } from "./host.js";

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Copies the snapshot to /out, and answers with the copy or its reason. */
function copy(): Answer {
  let bytes: Uint8Array;
  try {
    bytes = fs.read(FEED);
  } catch (e) {
    const why = reason(e);
    log(`refresh: ${FEED} unreadable: ${why}`);
    return failed(`the feed is unreadable: ${why}`);
  }
  try {
    fs.write(OUT, bytes);
  } catch (e) {
    const why = reason(e);
    log(`refresh: ${OUT} unwritable: ${why}`);
    return failed(`the output is unwritable: ${why}`);
  }
  log(`refresh: copied ${bytes.length} byte(s) to ${OUT}`);
  return ok(bytes.length);
}

/** Runs once. `ctx` is what /run/context.json carried in 1.x, with the trigger. */
export function run(ctx: Ctx): Answer {
  const why = unknownPress(ctx);
  if (why !== null) throw new Error(why);
  return copy();
}
