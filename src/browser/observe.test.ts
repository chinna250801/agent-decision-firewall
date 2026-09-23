import { describe, it, expect } from "vitest";
import { renderObservation, type PageObservation } from "./observe.js";

const obs: PageObservation = {
  url: "https://example.com/search",
  title: "Example Search",
  nodes: [
    { id: "t1", role: "heading", label: "Search products", visible: true, aboveFold: true },
    { id: "t2", role: "input", label: "Search query", value: "", visible: true, aboveFold: true },
    { id: "t3", role: "button", label: "Search", visible: true, aboveFold: true },
    { id: "t4", role: "link", label: "Advanced", value: "https://example.com/advanced", visible: true, aboveFold: false },
    { id: "t5", role: "button", label: "Hidden admin", visible: false, aboveFold: true },
    { id: "t6", role: "select", label: "Category", value: "all", visible: true, aboveFold: false },
  ],
};

describe("renderObservation", () => {
  it("indexes only visible interactive targets", () => {
    const out = renderObservation(obs);
    expect(out.text).toContain("[t2] input:");
    expect(out.text).toContain("[t3] button:");
    expect(out.text).toContain("[t4] link: \"Advanced\"");
    expect(out.text).toContain("below-fold");
    expect(out.text).not.toContain("Hidden admin");
    expect(out.text).not.toContain("heading");
    expect(out.targetCount).toBe(4);
  });

  it("marks its version and clips to target budget", () => {
    const many: PageObservation = {
      ...obs,
      nodes: Array.from({ length: 60 }, (_, i) => ({
        id: `t${i + 1}`,
        role: "button" as const,
        label: `btn ${i}`,
        visible: true,
        aboveFold: true,
      })),
    };
    const out = renderObservation(many);
    expect(out.version).toBe(1);
    expect(out.targetCount).toBe(40);
    expect(out.text).toContain("(further targets omitted)");
  });

  it("is deterministic", () => {
    expect(renderObservation(obs).text).toBe(renderObservation(obs).text);
  });
});
