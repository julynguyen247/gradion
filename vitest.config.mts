import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcPath = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": srcPath } },
  test: {
    projects: [
      {
        resolve: { alias: { "@": srcPath } },
        test: {
          name: "backend",
          environment: "node",
          include: ["src/lib/server/**/*.test.ts"],
          testTimeout: 10_000,
        },
      },
      {
        resolve: { alias: { "@": srcPath } },
        test: {
          name: "frontend",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./src/test/setup.ts"],
        },
      },
    ],
  },
});
