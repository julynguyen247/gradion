import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/lib/server/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
