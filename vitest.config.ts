import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // .kilo/ holds foreign worktrees (other agents); never scan or write there.
    exclude: ["**/node_modules/**", ".kilo/**"],
  },
});
