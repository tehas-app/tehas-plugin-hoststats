// Defines one custom element that mounts a render module in the light DOM
// (spec v2 part 6). The kit's island() does the same, with hydrate triggers
// and props, and the gate serves it at `_kit/island.js` (rev 5 part 6.3).
// TODO: switch to island() once the simulator can serve the kit; the kit is
// tehas's, and this repository keeps no copy of it.
export function define(name, mount) {
    customElements.define(name, class extends HTMLElement {
        handle = null;
        stop = null;
        connectedCallback() {
            this.stop = new AbortController();
            this.handle = mount(this, { signal: this.stop.signal });
        }
        disconnectedCallback() {
            this.stop?.abort();
            this.handle?.unmount();
            this.handle = null;
        }
    });
}
