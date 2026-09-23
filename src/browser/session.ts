/**
 * Browser session isolation contract. Every session the firewall ever drives
 * must pass `isolationViolations` with an empty list — validated at launch.
 */
export interface BrowserSessionConfig {
  headless: boolean;
  /** Origins the session may load; no wildcards allowed. */
  allowedOrigins: string[];
  /** Block every request whose origin is not allowlisted. */
  blockNonAllowlistedRequests: boolean;
  allowDownloads: boolean;
  allowRemoteFonts: boolean;
  /** Storage is ephemeral: no cookies/localStorage survive the session. */
  persistentStorage: boolean;
  /** Hard ceilings; the loop must stop when either is exceeded. */
  maxSteps: number;
  maxNavigationSeconds: number;
  /** Extra argv for the browser binary (must not weaken isolation). */
  browserArgs: string[];
}

export function defaultSessionConfig(): BrowserSessionConfig {
  return {
    headless: true,
    allowedOrigins: ["https://example.com"],
    blockNonAllowlistedRequests: true,
    allowDownloads: false,
    allowRemoteFonts: false,
    persistentStorage: false,
    maxSteps: 25,
    maxNavigationSeconds: 30,
    browserArgs: ["--disable-extensions", "--no-first-run", "--disable-sync"],
  };
}

const FORBIDDEN_ARGS = ["--disable-web-security", "--no-sandbox", "--allow-file-access", "--remote-debugging-address"];

/** Returns a list of violation codes; empty means the config is safe to launch. */
export function isolationViolations(cfg: BrowserSessionConfig): string[] {
  const v: string[] = [];
  if (cfg.allowedOrigins.length === 0 || cfg.allowedOrigins.includes("*")) v.push("wildcard_origins");
  if (!cfg.blockNonAllowlistedRequests) v.push("requests_unfiltered");
  if (cfg.allowDownloads) v.push("downloads_enabled");
  if (cfg.persistentStorage) v.push("persistent_storage");
  if (!Number.isFinite(cfg.maxSteps) || cfg.maxSteps <= 0) v.push("bad_max_steps");
  if (cfg.maxNavigationSeconds <= 0) v.push("bad_timeout");
  for (const arg of cfg.browserArgs) {
    if (FORBIDDEN_ARGS.some((f) => arg.startsWith(f))) v.push(`forbidden_arg:${arg}`);
  }
  return v;
}
