// The host view's entry: one custom element. Until it mounts, the server
// HTML in index.html stands, and says the view did not load.
import { define } from "./element.js";
import { mount } from "./host.render.js";
define("plugin-host", mount);
