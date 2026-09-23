import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

function runCli(args: string[]): { code: number; stdout: string } {
  const proc = spawnSync("npx", ["tsx", "src/cli/index.ts", ...args], {
    encoding: "utf8",
    env: { ...process.env, FIREWALL_MODEL: "mock" },
    timeout: 120_000,
  });
  return { code: proc.status ?? -1, stdout: proc.stdout ?? "" };
}

describe("CLI", () => {
  it("prints usage and exits 2 for unknown command", () => {
    const { code, stdout } = runCli(["nope"]);
    expect(code).toBe(2);
    expect(stdout).toContain("usage:");
  });

  it("eval on golden with allow_all mock reports escapes and fails the gate", () => {
    const { code, stdout } = runCli(["eval", "--model", "mock", "--dataset", "golden.v1"]);
    expect(stdout).toContain("dangerous escape rate");
    expect(stdout).toContain("escapes by category");
    expect(code).toBe(1); // allow_all mock escapes dangerous cases — gate trips by design
  });

  it("eval exits 0 when nothing dangerous escapes (block_all mock)", () => {
    // block_all blocks everything: zero escapes, so the security gate passes.
    const { code, stdout } = runCli(["eval", "--model", "mock", "--mock-mode", "block_all", "--dataset", "adversarial.v1"]);
    expect(stdout).toContain("verdict accuracy");
    expect(code).toBe(0);
  });
});
