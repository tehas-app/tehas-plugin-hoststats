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
const said = (m) => `${m.code}: ${m.text}`;
function isHostMessage(d) {
    if (typeof d !== "object" || d === null)
        return false;
    const m = d;
    if (m.v !== V)
        return false;
    if (m.type === "output")
        return typeof m.files === "object" && m.files !== null;
    if (m.type === "answer")
        return typeof m.nonce === "string";
    return m.type === "error" && typeof m.code === "string" && typeof m.text === "string";
}
/** Opens the channel: waits for the host's port, then says `ready`. */
export function connect(frame, waitMs = 5000) {
    let port = null;
    let pending = null;
    // The host's next single-use nonce; a press spends it.
    let next = null;
    let gotOutput = () => undefined;
    const output = new Promise((ok) => {
        gotOutput = ok;
    });
    const timer = setTimeout(() => gotOutput({ state: "failed", why: "no port from the host" }), waitMs);
    const onMessage = (e) => {
        const p = e.ports[0];
        const d = e.data;
        if (e.source !== frame.parent || e.ports.length !== 1 || !p || d?.type !== "port" || d.v !== V)
            return;
        frame.removeEventListener("message", onMessage);
        port = p;
        port.onmessage = (m) => {
            const d = m.data;
            if (!isHostMessage(d))
                return;
            if (d.type !== "error" && typeof d.next === "string")
                next = d.next;
            if (d.type === "output") {
                clearTimeout(timer);
                gotOutput({ state: "ok", value: d.files });
            }
            else if (d.type === "answer" && pending && d.nonce === pending.nonce) {
                const done = pending.done;
                pending = null;
                done(d.error ? { state: "failed", why: said(d.error) } : { state: "ok", value: d.result });
            }
            else if (d.type === "error") {
                if (pending) {
                    const done = pending.done;
                    pending = null;
                    done({ state: "failed", why: said(d) });
                }
                else {
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
            if (!port)
                return Promise.resolve({ state: "failed", why: "no port from the host" });
            if (pending)
                return Promise.resolve({ state: "failed", why: "a press is in flight" });
            const n = next;
            if (n === null)
                return Promise.resolve({ state: "failed", why: "no nonce from the host" });
            next = null;
            const live = port;
            return new Promise((done) => {
                pending = { nonce: n, done };
                live.postMessage({ type: "press", v: V, action, nonce: n, args });
            });
        },
    };
}
