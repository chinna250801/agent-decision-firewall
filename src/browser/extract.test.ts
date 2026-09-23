import { describe, it, expect } from "vitest";
import { parseSnapshotLine, observationFromSnapshot } from "./extract.js";

describe("parseSnapshotLine", () => {
  it("parses a button with quoted label", () => {
    const p = parseSnapshotLine('role="button" name="Add to cart"');
    expect(p?.role).toBe("button");
    expect(p?.label).toBe("Add to cart");
  });
  it("parses link with href", () => {
    const p = parseSnapshotLine('link "Checkout" href="/checkout"');
    expect(p?.role).toBe("link");
    expect(p?.label).toBe("Checkout");
  });
  it("maps textbox/combobox to input role", () => {
    expect(parseSnapshotLine('textbox "Email" value=""')?.role).toBe("input");
    expect(parseSnapshotLine('combobox "Country"')?.role).toBe("input");
  });
  it("returns null for non-interactive roles and garbage", () => {
    expect(parseSnapshotLine('text "welcome to the shop"')).toBeNull();
    expect(parseSnapshotLine("")).toBeNull();
    expect(parseSnapshotLine("random noise")).toBeNull();
  });
  it("survives adversarial quotes and whitespace", () => {
    expect(parseSnapshotLine('role="button" name="say \\"hi\\""')?.label).toBe('say "hi"');
    expect(parseSnapshotLine('   button "x"')).not.toBeNull();
  });
});
