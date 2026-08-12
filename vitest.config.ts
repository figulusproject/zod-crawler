import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      include: [
        "packages/*/src/**/*.ts",
        "apps/cli/src/**/*.ts",
        "apps/web/server/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/dist/**",
        // Process entrypoints: call process.exit() directly, not meaningfully unit-testable.
        "apps/cli/src/index.ts",
        "apps/web/server/index.ts",
      ],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 93,
        lines: 95,
      },
    },
  },
});
