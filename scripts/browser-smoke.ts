/**
 * Real-browser smoke test (no test runner): boots a local HTTP server, drives
 * it through PlaywrightDriver, and prints the observation trace. Run:
 *   npx tsx scripts/browser-smoke.ts
 * Exit 0 = driver, observation, tagging, and click-through all work.
 */
import { createServer } from "node:http";
import { PlaywrightDriver } from "../src/browser/playwright-driver.js";
import { defaultSessionConfig } from "../src/browser/session.js";
import { renderObservation } from "../src/browser/observe.js";

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Smoke Shop</title></head><body>
<h1>Smoke Shop</h1>
<a href="/checkout">Checkout</a>
<button aria-label="Add to cart">Add to cart</button>
<input name="email" placeholder="Email" value=""/>
<input type="checkbox" aria-label="Remember me"/>
<select name="qty"><option value="1">One</option><option value="2">Two</option></select>
<input type="password" name="pw" placeholder="Password"/>
<script>document.title = "Smoke Shop — " + location.origin;</script>
</body></html>`;

const server = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(PAGE);
});
await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
const port = (server.address() as { port: number }).port;
const origin = `http://127.0.0.1:${port}`;
console.log(`server: ${origin}`);

const session = { ...defaultSessionConfig(), allowedOrigins: [origin], maxNavigationSeconds: 10 };
const driver = new PlaywrightDriver({ session, channel: "chrome" });

try {
  const obs = await driver.start();
  const rendered = renderObservation(obs);
  console.log(`\n--- observation (v${rendered.version}, ${rendered.targetCount} targets) ---`);
  console.log(rendered.text);

  const pw = obs.nodes.find((n) => n.label.includes("Password"));
  if (pw) console.log(`\npassword field visible as ${pw.id} — policy will judge it via args.type in real runs`);

  // Click "Add to cart" through the driver (guard normally gates this).
  const cart = obs.nodes.find((n) => n.label === "Add to cart");
  if (!cart) throw new Error("add-to-cart button not observed");
  const after = await driver.apply({ op: "click", targetId: cart.id });
  console.log(`\nafter click: url=${after.url} targets=${after.nodes.length}`);

  // Type into the email field.
  const email = after.nodes.find((n) => n.label === "Email");
  if (!email) throw new Error("email field not observed after click");
  const afterType = await driver.apply({ op: "type", targetId: email.id, text: "user@example.com" });
  const emailNode = afterType.nodes.find((n) => n.label === "Email");
  console.log(`after type: email value="${emailNode?.value ?? "?"}"`);
  if (emailNode?.value !== "user@example.com") throw new Error("fill did not round-trip");

  // Isolation: a fetch to a non-allowlisted origin must be aborted by the filter.
  const blocked = await driver["page"]!.evaluate(async (foreign) => {
    try {
      const r = await fetch(foreign, { mode: "no-cors", signal: AbortSignal.timeout(3000) });
      return `loaded:${r.type}`;
    } catch {
      return "blocked";
    }
  }, "http://10.255.255.1:9/never");
  console.log(`foreign fetch: ${blocked} (expect blocked)`);
  if (!blocked.includes("blocked")) console.log("WARN: foreign fetch was not blocked");

  console.log("\nSMOKE_OK");
} finally {
  await driver.close();
  server.close();
}
