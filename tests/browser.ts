// Headless Chromium on the stub host (sim/gate.ts), for the view tests. The
// view runs in the host page's sandboxed frame; the tests read that frame.
import { type Browser, chromium, type Frame, type Page } from "playwright";
import { type Plan, serve } from "../sim/gate.ts";

export type { Browser, Frame, Page };
export const launch = (): Promise<Browser> => chromium.launch();

export interface ViewOptions {
  /** Runs on the page before it opens: freeze its clock, route its requests. */
  init?: (page: Page) => Promise<void> | void;
}

/** Opens the host page at `path` under `plan` and hands its view's frame to `fn`. */
export async function withView(
  browser: Browser,
  plan: Plan,
  fn: (view: Frame, errors: string[], page: Page) => Promise<void>,
  path = "",
  options: ViewOptions = {},
) {
  const site = await serve(plan);
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await options.init?.(page);
    await page.goto(site.url + path);
    const handle = await page.waitForSelector("#view");
    const view = await handle.contentFrame();
    if (!view) throw new Error("no view frame");
    await view.waitForLoadState("load");
    await fn(view, errors, page);
  } finally {
    await page.close();
    await site.close();
  }
}

/** The hop lines as the view shows them: [state, text] for each. */
export function hopLines(view: Frame): Promise<[string, string][]> {
  return view.$$eval(".hop", (lis) =>
    lis.map((li): [string, string] => [(li as HTMLElement).dataset.state ?? "", (li.textContent ?? "").replace(/\s+/g, " ").trim()]),
  );
}
