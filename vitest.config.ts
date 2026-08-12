import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "packages/*/src/**/*.ts",
        "apps/cli/src/**/*.ts",
        "apps/web/server/**/*.ts",
      ],
      exclude: ["**/*.test.ts", "**/dist/**"],
    },
  },
});
