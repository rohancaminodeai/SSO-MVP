import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Look for *.test.ts across all workspace packages.
    include: ["packages/**/*.test.ts"],
    // Integration tests that need Postgres should skip themselves when it is
    // unavailable (see helpers), so the default suite stays runnable anywhere.
    environment: "node",
    globals: true,
  },
});
