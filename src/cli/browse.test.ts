import { describe, it, expect } from "vitest";
import { parseBrowseArgs } from "./browse.js";

describe("parseBrowseArgs", () => {
  it("positional goal + flags", () => {
    const a = parseBrowseArgs(["--url", "http://x/", "--model", "laya", "find the pricing link"]);
    expect(a.goal).toBe("find the pricing link");
    expect(a.model).toBe("laya");
    expect(a.url).toBe("http://x/");
  });

  it("goal containing flag-like values is never misparsed", () => {
    const a = parseBrowseArgs(["--url", "http://x/", "--model", "laya", "--max-steps", "3", "type \"x\" then stop"]);
    expect(a.goal).toBe('type "x" then stop');
    expect(a.maxSteps).toBe(3);
  });

  it("goal flag beats positional; values after value-flags are consumed", () => {
    const a = parseBrowseArgs(["--goal", "quoted goal", "positional goal"]);
    expect(a.goal).toBe("quoted goal");
  });

  it("switches and defaults", () => {
    const a = parseBrowseArgs(["g", "-v", "--no-audit"]);
    expect(a.verbose).toBe(true);
    expect(a.audit).toBe(false);
  });

  it("missing goal throws", () => {
    expect(() => parseBrowseArgs(["--model", "laya"])).toThrow(/needs a goal/);
  });
});
