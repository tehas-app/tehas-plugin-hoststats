// The host view render module, in Solid JSX. It follows the kit island
// contract: mount(host, ctx) -> { unmount }. Solid comes from the kit,
// through the import map the gate writes (spec v2 part 6).
//
// The subtree of #host is the 1.x page markup exactly, kept as the golden in
// the tests directory for the render test: the head, the readings with their
// gauges, and the two tables with their ids, classes and texts. Only two
// things are new and both sit outside #host: the Refresh button that triggers
// the press, and the status line the press answer needs. Names come from the
// host and are untrusted: text only, never markup.

import { render } from "@solidjs/web";
import { createMemo, createSignal, For } from "solid-js";
import {
  fromAnswer,
  fromOutput,
  type Layout,
  lastReading,
  layout,
  type Memory,
  REFRESH,
  reading,
  refreshLine,
  type Seen,
  snapshot,
  waiting,
} from "./host.model.js";
import { connect } from "./source.js";

const bars = (filled: number): boolean[] => Array.from({ length: 10 }, (_, i) => i < filled);
// The figures of one reading, as the page writes them. Each takes the whole
// figure so no second read of the memo can be null where the first was not.
const stateText = (v: Layout | null): string => (v !== null && v.state === "live" ? "LIVE" : "STALE");
const memText = (m: Memory | null | undefined): string => (m ? `${m.used} of ${m.total} MB` : "-");
const memPercent = (m: Memory | null | undefined): string => (m ? `${m.percent}%` : "--");

const Head = (props: { view: () => Layout | null }) => (
  <div class="host-head">
    <h1 id="host-title">HOST</h1>
    <p class="host-scope">
      <span id="host-cpus">{props.view()?.cpus ?? ""}</span> <span>LOAD</span> <span id="host-load">{props.view()?.load.join(" ") ?? ""}</span>{" "}
      <span class="host-state" id="host-state" role="status" data-state={props.view()?.state}>
        {stateText(props.view())}
      </span>{" "}
      <span class="host-age" id="host-age">
        {lastReading(props.view())}
      </span>
    </p>
  </div>
);

const Readings = (props: { view: () => Layout | null }) => (
  <p class="host-readings">
    <span>
      CPU{" "}
      <span class="host-gauge" id="host-cpu-gauge" aria-hidden="true">
        <For each={bars(props.view()?.cpuFilled ?? 0)}>{(used) => (used ? <i class="is-used" /> : <i />)}</For>
      </span>{" "}
      <b id="host-cpu">{props.view()?.cpu ?? "--"}</b>
    </span>
    <span>
      MEMORY{" "}
      <span class="host-gauge" id="host-mem-gauge" aria-hidden="true">
        <For each={bars(props.view()?.memory?.filled ?? 0)}>{(used) => (used ? <i class="is-used" /> : <i />)}</For>
      </span>{" "}
      <b id="host-mem">{memText(props.view()?.memory)}</b> <b id="host-mem-percent">{memPercent(props.view()?.memory)}</b>
    </span>
  </p>
);

const ProcessTable = (props: { rows: () => Layout["rows"] }) => (
  <table class="host-table" aria-label="Processes on the host">
    <thead>
      <tr>
        <th scope="col">PROCESS</th>
        <th scope="col" class="col-pid">
          PID
        </th>
        <th scope="col" class="num">
          CPU
        </th>
        <th scope="col" class="num col-mem">
          MEM
        </th>
        <th scope="col" class="num">
          UP
        </th>
      </tr>
    </thead>
    <tbody id="host-rows">
      <For each={props.rows()}>
        {(r) => (
          <tr>
            <th scope="row">{r.name}</th>
            <td class="col-pid">{r.pid == null ? "-" : String(r.pid)}</td>
            <td class="num">{r.cpu}</td>
            <td class="num col-mem">{r.mem}</td>
            <td class="num">{r.up}</td>
          </tr>
        )}
      </For>
    </tbody>
  </table>
);

const UnitsTable = (props: { view: () => Layout | null }) => (
  <table
    class="host-table host-units"
    id="host-units"
    aria-label="Units of the factory"
    hidden={props.view() === null ? undefined : props.view()?.units.length === 0}
  >
    <thead>
      <tr>
        <th scope="col">UNIT</th>
        <th scope="col">INSTALLED</th>
        <th scope="col">STATE</th>
        <th scope="col" class="num col-next">
          NEXT
        </th>
      </tr>
    </thead>
    <tbody id="host-unit-rows">
      <For each={props.view()?.units ?? []}>
        {(u) => (
          <tr>
            <th scope="row">{u.name}</th>
            <td>{u.installed}</td>
            <td>{u.state}</td>
            <td class="num col-next">{u.next}</td>
          </tr>
        )}
      </For>
    </tbody>
  </table>
);

function Host(props: { seen: () => Seen; press: () => void }) {
  // The moment is passed into the pure model here, never read inside it.
  const view = createMemo<Layout | null>(() => {
    const s = snapshot(props.seen());
    return s === null ? null : layout(s, Date.now());
  });
  return (
    <>
      <p class="host-none" id="host-none" hidden={view() !== null}>
        {reading(props.seen())}
      </p>
      <section class="host" id="host" aria-labelledby="host-title" hidden={view() === null} aria-description={view()?.label}>
        <Head view={view} />
        <div class="host-body">
          <Readings view={view} />
          <ProcessTable rows={() => view()?.rows ?? []} />
          <UnitsTable view={view} />
        </div>
      </section>
      <button type="button" id="host-refresh" onClick={props.press}>
        Refresh
      </button>{" "}
      <p class="host-none" id="host-status">
        {refreshLine(props.seen())}
      </p>
    </>
  );
}

export function mount(host: HTMLElement, ctx: { signal: AbortSignal }): { unmount: () => void } {
  const [seen, setSeen] = createSignal<Seen>(waiting);
  host.replaceChildren();
  const channel = connect(window);
  const press = () =>
    channel.press(REFRESH, {}).then((a) => {
      if (!ctx.signal.aborted) setSeen((s) => ({ output: s.output, press: fromAnswer(a) }));
    });
  const dispose = render(() => <Host seen={seen} press={press} />, host);
  void channel.output.then((r) => {
    if (ctx.signal.aborted) return;
    const output = fromOutput(r);
    setSeen({ output, press: { state: "waiting" } });
    if (output.state !== "ok") return;
    void press();
  });
  return { unmount: dispose };
}
