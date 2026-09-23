import { PlaywrightDriver } from "../src/browser/playwright-driver.js";
import { defaultSessionConfig } from "../src/browser/session.js";

const t = Date.now();
const driver = new PlaywrightDriver({
  session: { ...defaultSessionConfig(), allowedOrigins: ["data:text/html,<h1>hi</h1>"] },
  channel: "chrome",
});
try {
  const obs = await driver.start();
  console.log(`launch+goto+observe ms: ${Date.now() - t}`);
  console.log(`targets: ${obs.nodes.length}`);
  console.log("LAUNCH_OK");
} finally {
  await driver.close();
}
