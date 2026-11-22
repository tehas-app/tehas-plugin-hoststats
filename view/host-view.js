// The host view: fetches the host feed on tehas's own period and puts the
// figures host-data.js gives into the panel and its two tables. Process and
// unit names come from the host and are untrusted: text only, never markup.
//
// Copied from tehas host/fun/host-view.js, without the floor's chip.

import { FEED, PERIOD, agoText, dueToRead, layout } from "./host-data.js";

if (typeof document !== "undefined" && document.getElementById("host")) {
  const $ = (id) => document.getElementById(id);
  let data = null, serverAt = 0, localAt = 0, drawn = "", missedAt = 0;

  function drawRow(body, name, values) {
    const tr = body.insertRow();
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = name;
    tr.append(th);
    for (const [value, cls] of values) {
      const td = tr.insertCell();
      td.textContent = value;
      if (cls) td.className = cls;
    }
  }
  function gauge(id, filled) {
    const bars = [];
    for (let i = 0; i < 10; i++) {
      const b = document.createElement("i");
      if (i < filled) b.className = "is-used";
      bars.push(b);
    }
    $(id).replaceChildren(...bars);
  }

  function render() {
    $("host").hidden = !data;
    $("host-none").hidden = Boolean(data);
    if (!data) return;
    const view = layout(data, serverAt + (performance.now() - localAt));
    // Nothing changed since the last draw: leave the rows and the status tag
    // alone, so a selection stays and a screen reader is not told again.
    const age = view.state === "stale" && view.ageSeconds != null ? `last reading ${agoText(view.ageSeconds)}` : "";
    const json = JSON.stringify([view, age]);
    if (json === drawn) return;
    drawn = json;

    $("host-cpus").textContent = view.cpus;
    $("host-load").textContent = view.load.join(" ");
    $("host-cpu").textContent = view.cpu;
    gauge("host-cpu-gauge", view.cpuFilled);
    $("host-mem").textContent = view.memory ? `${view.memory.used} of ${view.memory.total} MB` : "-";
    $("host-mem-percent").textContent = view.memory ? `${view.memory.percent}%` : "--";
    gauge("host-mem-gauge", view.memory ? view.memory.filled : 0);
    $("host-state").textContent = view.state === "live" ? "LIVE" : "STALE";
    $("host-state").dataset.state = view.state;
    $("host-age").textContent = age;
    $("host").setAttribute("aria-description", view.label);

    const rows = $("host-rows");
    rows.replaceChildren();
    for (const r of view.rows) {
      drawRow(rows, r.name, [[r.pid == null ? "-" : String(r.pid), "col-pid"], [r.cpu, "num"], [r.mem, "num col-mem"], [r.up, "num"]]);
    }
    // The units sit below the processes, as they do in the terminal.
    const units = $("host-unit-rows");
    units.replaceChildren();
    for (const u of view.units) drawRow(units, u.name, [[u.installed], [u.state], [u.next, "num col-next"]]);
    $("host-units").hidden = view.units.length === 0;
  }

  async function refresh() {
    // A host that samples nothing is not asked again every five seconds.
    if (!dueToRead({ hidden: document.hidden, missedAt }, Date.now())) return;
    try {
      const r = await fetch(FEED, { cache: "no-store", credentials: "same-origin" });
      if (r.status === 404) {
        data = null;
        missedAt = Date.now();
        $("host-none").textContent = "No host reading: tehas is not sampling the host for this plugin.";
      } else if (r.ok) {
        const next = await r.json();
        if (next && typeof next === "object" && !Array.isArray(next)) {
          // Staleness is judged by the server's clock, not the visitor's.
          const date = Date.parse(r.headers.get("Date") || "");
          data = next;
          serverAt = Number.isFinite(date) ? date : Date.now();
          localAt = performance.now();
          missedAt = 0;
        }
      }
    } catch { /* unreachable: what is on screen stays and grows stale */ }
    render();
  }

  refresh();
  setInterval(refresh, PERIOD * 1000);
  // Coming back to the page asks again at once, whatever the last answer was.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { missedAt = 0; refresh(); } });
}
