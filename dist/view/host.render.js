import { template as _$template } from "@solidjs/web";
import { delegateEvents as _$delegateEvents } from "@solidjs/web";
import { addEvent as _$addEvent } from "@solidjs/web";
import { createComponent as _$createComponent } from "@solidjs/web";
import { setAttribute as _$setAttribute } from "@solidjs/web";
import { effect as _$effect } from "@solidjs/web";
import { insert as _$insert } from "@solidjs/web";
import { memo as _$memo } from "@solidjs/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class=host-head><h1 id=host-title>HOST</h1><p class=host-scope><span id=host-cpus></span> <span>LOAD</span> <span id=host-load></span> <span class=host-state id=host-state role=status></span> <span class=host-age id=host-age>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<p class=host-readings><span>CPU <span class=host-gauge id=host-cpu-gauge aria-hidden=true></span> <b id=host-cpu></b></span><span>MEMORY <span class=host-gauge id=host-mem-gauge aria-hidden=true></span> <b id=host-mem></b> <b id=host-mem-percent>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<i class=is-used>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<i>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<table class=host-table aria-label="Processes on the host"><thead><tr><th scope=col>PROCESS</th><th scope=col class=col-pid>PID</th><th scope=col class=num>CPU</th><th scope=col class="num col-mem">MEM</th><th scope=col class=num>UP</th></tr></thead><tbody id=host-rows>`),
  _tmpl$6 = /*#__PURE__*/_$template(`<tr><th scope=row></th><td class=col-pid></td><td class=num></td><td class="num col-mem"></td><td class=num>`),
  _tmpl$7 = /*#__PURE__*/_$template(`<table class="host-table host-units"id=host-units aria-label="Units of the factory"><thead><tr><th scope=col>UNIT</th><th scope=col>INSTALLED</th><th scope=col>STATE</th><th scope=col class="num col-next">NEXT</th></tr></thead><tbody id=host-unit-rows>`),
  _tmpl$8 = /*#__PURE__*/_$template(`<tr><th scope=row></th><td></td><td></td><td class="num col-next">`),
  _tmpl$9 = /*#__PURE__*/_$template(`<p class=host-none id=host-none>`),
  _tmpl$0 = /*#__PURE__*/_$template(`<section class=host id=host aria-labelledby=host-title><div class=host-body><!><!><!>`),
  _tmpl$1 = /*#__PURE__*/_$template(`<button type=button id=host-refresh>Refresh`),
  _tmpl$10 = /*#__PURE__*/_$template(`<p class=host-none id=host-status>`);
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
import { fromAnswer, fromOutput, lastReading, layout, REFRESH, reading, refreshLine, snapshot, waiting } from "./host.model.js";
import { connect } from "./source.js";
const bars = filled => Array.from({
  length: 10
}, (_, i) => i < filled);
// The figures of one reading, as the page writes them. Each takes the whole
// figure so no second read of the memo can be null where the first was not.
const stateText = v => v !== null && v.state === "live" ? "LIVE" : "STALE";
const memText = m => m ? `${m.used} of ${m.total} MB` : "-";
const memPercent = m => m ? `${m.percent}%` : "--";
const Head = props => (() => {
  var _el$ = _tmpl$(),
    _el$2 = _el$.firstChild,
    _el$3 = _el$2.nextSibling,
    _el$4 = _el$3.firstChild,
    _el$5 = _el$4.nextSibling,
    _el$6 = _el$5.nextSibling,
    _el$7 = _el$6.nextSibling,
    _el$8 = _el$7.nextSibling,
    _el$9 = _el$8.nextSibling,
    _el$0 = _el$9.nextSibling,
    _el$1 = _el$0.nextSibling,
    _el$10 = _el$1.nextSibling;
  _$insert(_el$4, () => props.view()?.cpus ?? "");
  _$insert(_el$8, () => props.view()?.load.join(" ") ?? "");
  _$insert(_el$0, () => stateText(props.view()));
  _$insert(_el$10, () => lastReading(props.view()));
  _$effect(() => props.view()?.state, _v$ => {
    _$setAttribute(_el$0, "data-state", _v$);
  });
  return _el$;
})();
const Readings = props => (() => {
  var _el$11 = _tmpl$2(),
    _el$12 = _el$11.firstChild,
    _el$13 = _el$12.firstChild,
    _el$15 = _el$13.nextSibling,
    _el$16 = _el$15.nextSibling,
    _el$17 = _el$16.nextSibling,
    _el$18 = _el$12.nextSibling,
    _el$19 = _el$18.firstChild,
    _el$21 = _el$19.nextSibling,
    _el$22 = _el$21.nextSibling,
    _el$23 = _el$22.nextSibling,
    _el$24 = _el$23.nextSibling,
    _el$25 = _el$24.nextSibling;
  _$insert(_el$15, _$createComponent(For, {
    get each() {
      return bars(props.view()?.cpuFilled ?? 0);
    },
    children: used => used ? _tmpl$3() : _tmpl$4()
  }));
  _$insert(_el$17, () => props.view()?.cpu ?? "--");
  _$insert(_el$21, _$createComponent(For, {
    get each() {
      return bars(props.view()?.memory?.filled ?? 0);
    },
    children: used => used ? _tmpl$3() : _tmpl$4()
  }));
  _$insert(_el$23, () => memText(props.view()?.memory));
  _$insert(_el$25, () => memPercent(props.view()?.memory));
  return _el$11;
})();
const ProcessTable = props => (() => {
  var _el$30 = _tmpl$5(),
    _el$31 = _el$30.firstChild,
    _el$32 = _el$31.nextSibling;
  _$insert(_el$32, _$createComponent(For, {
    get each() {
      return props.rows();
    },
    children: r => (() => {
      var _el$33 = _tmpl$6(),
        _el$34 = _el$33.firstChild,
        _el$35 = _el$34.nextSibling,
        _el$36 = _el$35.nextSibling,
        _el$37 = _el$36.nextSibling,
        _el$38 = _el$37.nextSibling;
      _$insert(_el$34, () => r.name);
      _$insert(_el$35, (() => {
        var _c$ = _$memo(() => r.pid == null);
        return () => _c$() ? "-" : String(r.pid);
      })());
      _$insert(_el$36, () => r.cpu);
      _$insert(_el$37, () => r.mem);
      _$insert(_el$38, () => r.up);
      return _el$33;
    })()
  }));
  return _el$30;
})();
const UnitsTable = props => (() => {
  var _el$39 = _tmpl$7(),
    _el$40 = _el$39.firstChild,
    _el$41 = _el$40.nextSibling;
  _$insert(_el$41, _$createComponent(For, {
    get each() {
      return props.view()?.units ?? [];
    },
    children: u => (() => {
      var _el$42 = _tmpl$8(),
        _el$43 = _el$42.firstChild,
        _el$44 = _el$43.nextSibling,
        _el$45 = _el$44.nextSibling,
        _el$46 = _el$45.nextSibling;
      _$insert(_el$43, () => u.name);
      _$insert(_el$44, () => u.installed);
      _$insert(_el$45, () => u.state);
      _$insert(_el$46, () => u.next);
      return _el$42;
    })()
  }));
  _$effect(() => props.view() === null ? undefined : props.view()?.units.length === 0, _v$ => {
    _$setAttribute(_el$39, "hidden", _v$);
  });
  return _el$39;
})();
function Host(props) {
  // The moment is passed into the pure model here, never read inside it.
  const view = createMemo(() => {
    const s = snapshot(props.seen());
    return s === null ? null : layout(s, Date.now());
  });
  return [(() => {
    var _el$47 = _tmpl$9();
    _$insert(_el$47, () => reading(props.seen()));
    _$effect(() => view() !== null, _v$ => {
      _$setAttribute(_el$47, "hidden", _v$);
    });
    return _el$47;
  })(), (() => {
    var _el$48 = _tmpl$0(),
      _el$49 = _el$48.firstChild,
      _el$50 = _el$49.firstChild,
      _el$51 = _el$50.nextSibling,
      _el$52 = _el$51.nextSibling;
    _$insert(_el$48, _$createComponent(Head, {
      view: view
    }), _el$49);
    _$insert(_el$49, _$createComponent(Readings, {
      view: view
    }), _el$50);
    _$insert(_el$49, _$createComponent(ProcessTable, {
      rows: () => view()?.rows ?? []
    }), _el$51);
    _$insert(_el$49, _$createComponent(UnitsTable, {
      view: view
    }), _el$52);
    _$effect(() => ({
      e: view() === null,
      t: view()?.label
    }), ({
      e,
      t
    }, _p$) => {
      e !== _p$?.e && _$setAttribute(_el$48, "hidden", e);
      t !== _p$?.t && _$setAttribute(_el$48, "aria-description", t);
    });
    return _el$48;
  })(), (() => {
    var _el$53 = _tmpl$1();
    _$addEvent(_el$53, "click", props.press, true);
    return _el$53;
  })(), " ", (() => {
    var _el$54 = _tmpl$10();
    _$insert(_el$54, () => refreshLine(props.seen()));
    return _el$54;
  })()];
}
export function mount(host, ctx) {
  const [seen, setSeen] = createSignal(waiting);
  host.replaceChildren();
  const channel = connect(window);
  const press = () => channel.press(REFRESH, {}).then(a => {
    if (!ctx.signal.aborted) setSeen(s => ({
      output: s.output,
      press: fromAnswer(a)
    }));
  });
  const dispose = render(() => _$createComponent(Host, {
    seen: seen,
    press: press
  }), host);
  void channel.output.then(r => {
    if (ctx.signal.aborted) return;
    const output = fromOutput(r);
    setSeen({
      output,
      press: {
        state: "waiting"
      }
    });
    if (output.state !== "ok") return;
    void press();
  });
  return {
    unmount: dispose
  };
}
_$delegateEvents(["click"]);
