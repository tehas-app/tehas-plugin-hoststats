export const STALE_AFTER = 30; // six missed publishes: the numbers are not the host's now
export const ROWS = 15; // the snapshot holds the busiest fifteen processes only
export const UNITS = 30; // one factory has far fewer units; this bounds what a page draws
/** The last run's copy of the snapshot, which the host pushes as output. */
export const OUT = "/out/host.json";
/** The press that asks for the snapshot now (the manifest's `actions`). */
export const REFRESH = "refresh";
/** What the page says while the reading is on its way (the 1.x loading line). */
export const LOADING = "Reading the host feed.";
/** What the page says when there is no snapshot to draw (the 1.x missing-feed line). */
export const NO_READING = "No host reading: tehas is not sampling the host for this plugin.";
/** The reason fromOutput gives when the run wrote no snapshot at all. */
export const MISSING = `no ${OUT} in the run output`;
export const waiting = { output: { state: "waiting" }, press: { state: "waiting" } };
const list = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
// Process names come from the host and are untrusted: text, cut to a length.
const text = (v) => (typeof v === "string" ? v.slice(0, 64) : "");
const object = (v) => typeof v === "object" && v !== null && !Array.isArray(v) ? v : null;
// A share of ten blocks, for the gauges.
const blocks = (share) => Math.max(0, Math.min(10, Math.round(share * 10)));
// One figure with as little rounding as the reading needs, or "--" where the
// snapshot has no reading. A percentage is null when the two readings of /proc
// measured nothing, which is not the same as zero.
const pct = (v) => {
    const n = num(v);
    return n == null ? "--" : `${Math.round(n * 10) / 10}%`;
};
const mb = (v) => {
    const n = num(v);
    return n == null ? "--" : String(Math.round(n));
};
const load = (v) => {
    const each = list(v).map(num);
    return each.length === 3 && each.every((n) => n != null) ? each.map((n) => n.toFixed(2)) : null;
};
// How long a process has been running, in the coarsest unit that reads well.
export function uptime(secs) {
    const s = num(secs);
    if (s == null || s < 0)
        return "-";
    if (s < 60)
        return `${Math.round(s)} s`;
    if (s < 3600)
        return `${Math.floor(s / 60)} min`;
    if (s < 86400)
        return `${Math.floor(s / 3600)} h`;
    return `${Math.floor(s / 86400)} d`;
}
// How long ago, in the same coarse units. A snapshot stamped just ahead of the
// clock it is read with is "just now", not a negative age.
export function agoText(secs) {
    const s = num(secs);
    if (s == null)
        return "";
    const at = Math.max(0, s);
    if (at < 90)
        return "just now";
    if (at < 5400)
        return `${Math.round(at / 60)} min ago`;
    if (at < 129600)
        return `${Math.round(at / 3600)} h ago`;
    return `${Math.round(at / 86400)} d ago`;
}
// data: the parsed host snapshot. nowMs: the present, passed in by the render.
export function layout(data, nowMs) {
    const file = object(data) ?? {};
    const host = object(file.host);
    const generated = Date.parse(String(file.generatedAt));
    const stale = !host || !(nowMs - generated <= STALE_AFTER * 1000);
    const mem = host ? object(host.memory) : null;
    const total = num(mem?.totalMb);
    const used = num(mem?.usedMb);
    const share = total != null && total > 0 && used != null ? Math.min(1, used / total) : null;
    const cpus = num(host?.cpus);
    const cpu = num(host?.cpuPercent);
    return {
        state: stale ? "stale" : "live",
        present: Boolean(host),
        // Seconds between the moment the publisher wrote the file and nowMs, or
        // null where the file names no moment at all.
        ageSeconds: Number.isFinite(generated) ? (nowMs - generated) / 1000 : null,
        cpus: cpus == null ? "-" : `${Math.round(cpus)} CPUs`,
        load: (host && load(host.load)) || ["-", "-", "-"],
        cpu: pct(cpu),
        cpuFilled: cpu == null ? 0 : blocks(cpu / 100),
        memory: share == null ? null : { used: mb(used), total: mb(total), percent: Math.round(share * 100), filled: blocks(share) },
        // The snapshot is already the busiest first; this only drops what a longer
        // file would hold and what is not a row at all.
        rows: list(host?.processes)
            .filter((p) => {
            const o = object(p);
            return o !== null && text(o.name) !== "";
        })
            .slice(0, ROWS)
            .map((p) => {
            const o = p;
            return { pid: num(o.pid), name: text(o.name), cpu: pct(o.cpuPercent), mem: pct(o.memPercent), up: uptime(o.upSeconds) };
        }),
        // The units of the factory, as tehas top lists them: name, whether systemd
        // has it installed, its state, and when a timer next fires.
        units: list(file.units)
            .filter((u) => {
            const o = object(u);
            return o !== null && text(o.id) !== "";
        })
            .slice(0, UNITS)
            .map((u) => {
            const o = u;
            return { name: text(o.id), installed: text(o.unitFileState) || "-", state: text(o.activeState) || "-", next: text(o.next) };
        }),
        label: `Host: ${cpus == null ? "no cpu count" : `${Math.round(cpus)} cpus`}, ` +
            (stale || !host ? "no recent reading of /proc." : `using ${pct(cpu)} of its cpus.`),
    };
}
/** The age line of a stale drawing, empty while the reading is fresh or absent. */
export function lastReading(v) {
    return v !== null && v.state === "stale" && v.ageSeconds != null ? `last reading ${agoText(v.ageSeconds)}` : "";
}
/** True when the value is a snapshot as the view will draw it; layout is the guard. */
export function isSnapshot(v) {
    return object(v) !== null;
}
/** The refresh answer in a press's result, as the driver gives it. */
export function isRefreshAnswer(v) {
    const o = object(v);
    if (o === null)
        return false;
    if (o.state === "ok")
        return typeof o.bytes === "number" && Number.isFinite(o.bytes);
    return o.state === "failed" && typeof o.why === "string";
}
/** The snapshot in the host's output: none before the first run writes one. */
export function fromOutput(r) {
    if (r.state === "failed")
        return r;
    const raw = r.value[OUT];
    if (raw === undefined)
        return { state: "failed", why: MISSING };
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return { state: "failed", why: `${OUT} is not JSON` };
    }
    return isSnapshot(parsed) ? { state: "ok", value: parsed } : { state: "failed", why: `${OUT} is not a host snapshot` };
}
/** The refresh answer in a press's result. */
export function fromAnswer(r) {
    if (r.state === "failed")
        return r;
    return isRefreshAnswer(r.value) ? { state: "ok", value: r.value } : { state: "failed", why: "not a refresh answer" };
}
/** The snapshot to draw, or null where there is none. */
export function snapshot(seen) {
    return seen.output.state === "ok" ? seen.output.value : null;
}
/** The line the no-drawing paragraph holds: why there is nothing on screen. */
export function reading(seen) {
    if (seen.output.state === "waiting")
        return LOADING;
    if (seen.output.state === "failed")
        return seen.output.why === MISSING ? NO_READING : `No host reading: ${seen.output.why}.`;
    return "";
}
/** The line the refresh status holds, once there is a snapshot to press for. */
export function refreshLine(seen) {
    if (seen.output.state !== "ok")
        return "";
    const p = seen.press;
    if (p.state === "waiting")
        return LOADING;
    if (p.state === "failed")
        return `Refresh failed: ${p.why}.`;
    const a = p.value;
    return a.state === "ok" ? `Refreshed: ${a.bytes} bytes.` : `Refresh failed: ${a.why}.`;
}
