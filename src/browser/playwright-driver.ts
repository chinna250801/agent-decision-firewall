import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { isolationViolations, type BrowserSessionConfig } from "./session.js";
import { observationFromSnapshot } from "./extract.js";
import type { PageObservation } from "./observe.js";
import type { BrowserDriver } from "./loop.js";
import type { BrowserOperation } from "./step.js";

/** Chrome-for-Testing channel names we accept for `launch()` discovery. */
const CHANNELS = ["chrome", "msedge", "chrome-beta"] as const;

export interface PlaywrightDriverConfig {
  session: BrowserSessionConfig;
  /** chrome | msedge | chrome-beta — resolved against installed browsers. */
  channel?: (typeof CHANNELS)[number];
  /** Test hook: a pre-built Playwright chromium launcher. */
  chromiumFactory?: typeof chromium;
}

/**
 * The real driver behind the BrowserDriver contract. Launch is fail-closed:
 * any isolation violation aborts before a browser exists, and launch failure
 * surfaces as an exception the run loop converts to `executor_error`.
 *
 * Observation tags every visible interactive element with `data-tid=tN` in the
 * same order the observation assigns ids — so an approved `click t3` resolves
 * to the exact element the model saw, even after unrelated DOM changes.
 */
export class PlaywrightDriver implements BrowserDriver {
  private cfg: PlaywrightDriverConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(cfg: PlaywrightDriverConfig) {
    this.cfg = cfg;
  }

  async start(): Promise<PageObservation> {
    const session = this.cfg.session;
    const violations = isolationViolations(session);
    if (violations.length > 0) throw new Error(`isolation violations: ${violations.join(", ")}`);

    const chromiumImpl = this.cfg.chromiumFactory ?? chromium;
    const channels = this.cfg.channel ? [this.cfg.channel] : [...CHANNELS];
    let lastError = "no chrome channel available";
    for (const channel of channels) {
      try {
        this.browser = await chromiumImpl.launch({ channel, headless: true, args: session.browserArgs });
        break;
      } catch (e) {
        lastError = String(e).slice(0, 200);
      }
    }
    if (!this.browser) throw new Error(`browser launch failed: ${lastError}`);

    this.context = await this.browser.newContext({ acceptDownloads: false, serviceWorkers: "block" });
    this.page = await this.context.newPage();
    // Runs before any page script: tag visible interactive elements with
    // data-tids numbered the same way observation numbers them. Re-tags on DOM
    // mutations so ids stay valid as the page changes.
    await this.page.addInitScript(
      `(() => {
        const SELECTOR = "a[href], button, input, select, textarea, [role=button], [role=link], [role=checkbox]";
        const tag = () => {
          let n = 0;
          const els = Array.from(document.querySelectorAll(SELECTOR)).slice(0, 200);
          for (const el of els) {
            const r = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            const hidden = r.width <= 0 || r.height <= 0 || style.visibility === "hidden" || style.display === "none";
            if (hidden) { el.removeAttribute("data-tid"); continue; }
            n += 1;
            el.setAttribute("data-tid", "t" + n);
            if (r.top > (window.innerHeight || 600)) el.setAttribute("data-below-fold", "1");
            else el.removeAttribute("data-below-fold");
          }
        };
        document.addEventListener("DOMContentLoaded", tag);
        window.addEventListener("load", tag);
        new MutationObserver(tag).observe(document.documentElement, { subtree: true, childList: true, attributes: true });
      })()`,
    );
    if (session.blockNonAllowlistedRequests) this.installRequestFilter(session.allowedOrigins);
    if (session.maxNavigationSeconds > 0) {
      this.page.setDefaultNavigationTimeout(session.maxNavigationSeconds * 1000);
      this.page.setDefaultTimeout(session.maxNavigationSeconds * 1000);
    }
    const first = session.allowedOrigins[0];
    if (!first) throw new Error("session has no allowed origins");
    await this.page.goto(first, { waitUntil: "domcontentloaded" });
    return this.observe();
  }

  /** Request denylist via route interception: non-allowlisted origins never hit the network. */
  private installRequestFilter(allowedOrigins: string[]): void {
    this.page?.route("**/*", (route) => {
      try {
        const origin = new URL(route.request().url()).origin;
        if (allowedOrigins.includes(origin)) {
          void route.continue();
        } else {
          void route.abort();
        }
      } catch {
        void route.abort();
      }
    });
  }

  async observe(): Promise<PageObservation> {
    const page = this.page;
    if (!page) throw new Error("driver not started");
    const url = page.url();
    const title = await page.title();
    // Element data as JSON strings: serialization-safe across the CDP boundary.
    const raw = (await page.evaluate(
      `(() => {
        const fold = window.innerHeight || 600;
        const out = [];
        const selector = "a[href], button, input, select, textarea, [role=button], [role=link], [role=checkbox]";
        const els = Array.from(document.querySelectorAll(selector)).slice(0, 200);
        let n = 0;
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          const style = window.getComputedStyle(el);
          if (style.visibility === "hidden" || style.display === "none") continue;
          n += 1;
          el.setAttribute("data-tid", "t" + n);
          const tag = el.tagName.toLowerCase();
          const inputType = el.tagName === "INPUT" ? el.getAttribute("type") : null;
          const role =
            tag === "a" ? "link"
            : (tag === "button" || el.getAttribute("role") === "button") ? "button"
            : tag === "select" ? "combobox"
            : (inputType === "checkbox" || el.getAttribute("role") === "checkbox") ? "checkbox"
            : "textbox";
          const label = String(el.tagName === "SELECT"
            ? (el.getAttribute("aria-label") || el.getAttribute("name") || "")
            : (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.getAttribute("value") || el.getAttribute("name") || ""));
          const value = (el.tagName === "INPUT" || el.tagName === "TEXTAREA") ? String(el.value || "") : "";
          out.push(JSON.stringify({
            role: role,
            label: label,
            value: value,
            href: tag === "a" ? el.href : "",
            below: r.top > fold,
          }));
        }
        return out;
      })()`,
    )) as string[];

    const lines = raw.map((s) => {
      const o = JSON.parse(s) as { role: string; label: string; value: string; href: string; below: boolean };
      const clean = (v: string) => v.replace(/\\/g, "").replace(/"/g, "").replace(/[\r\n]+/g, " ").trim().slice(0, 80);
      let line = `role="${o.role}" name="${clean(o.label)}"`;
      if (o.value) line += ` value="${clean(o.value)}"`;
      if (o.href) line += ` href="${o.href}"`;
      if (o.below) line += " [below-fold]";
      return line;
    });
    return observationFromSnapshot({ url, title, lines });
  }

  async apply(op: BrowserOperation): Promise<PageObservation> {
    const page = this.page;
    if (!page) throw new Error("driver not started");
    const timeout = this.cfg.session.maxNavigationSeconds * 1000;
    switch (op.op) {
      case "click": {
        const el = page.locator(`[data-tid="${op.targetId}"]`).first();
        if ((await el.count()) > 0) await el.click({ timeout });
        else await this.applyByScan(op.targetId, (h) => h.click());
        break;
      }
      case "type": {
        const el = page.locator(`[data-tid="${op.targetId}"]`).first();
        if ((await el.count()) > 0) await el.fill(op.text, { timeout });
        else await this.applyByScan(op.targetId, (h) => h.fill(op.text));
        break;
      }
      case "select": {
        const el = page.locator(`[data-tid="${op.targetId}"]`).first();
        if ((await el.count()) > 0) await el.selectOption(op.option, { timeout });
        else await this.applyByScan(op.targetId, async (h) => {
          await h.selectOption(op.option);
        });
        break;
      }
      case "scroll":
        await page.mouse.wheel(0, 600);
        break;
      case "wait":
        await page.waitForTimeout(500);
        break;
      case "stop":
        break;
    }
    await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => {});
    return this.observe();
  }

  /** Fallback resolution by re-deriving observation order (no stale handles). */
  private async applyByScan(targetId: string, act: (h: import("playwright-core").Locator) => Promise<void>): Promise<void> {
    const page = this.page;
    if (!page) throw new Error("driver not started");
    const ordinal = Number(targetId.replace(/^t/, ""));
    if (!Number.isInteger(ordinal) || ordinal < 1) throw new Error(`unknown target ${targetId}`);
    const selector = "a[href], button, input, select, textarea, [role=button], [role=link], [role=checkbox]";
    const handles = await page.locator(selector).all();
    const visible: import("playwright-core").Locator[] = [];
    for (const h of handles) {
      const box = await h.boundingBox();
      if (box && box.width > 0 && box.height > 0) visible.push(h);
    }
    const target = visible[ordinal - 1];
    if (!target) throw new Error(`unknown target ${targetId}`);
    await act(target);
  }

  async close(): Promise<void> {
    try {
      await this.context?.close();
      await this.browser?.close();
    } catch {
      /* close is best-effort; the session is ephemeral either way */
    }
    this.browser = this.context = this.page = null;
  }
}
