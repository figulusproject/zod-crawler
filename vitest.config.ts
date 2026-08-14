import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

// A Vitest browser project with no Chromium installed (`npx playwright
// install chromium`) throws a hard, unskippable error - keeping it out of
// the default "node" project (and thus out of `npm test`/`npm run
// coverage`) preserves zero-required-local-setup for a green `npm test`.
// Run it explicitly with `npm run test:browser`.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          exclude: [
            "**/node_modules/**",
            "**/.git/**",
            "**/*.browser.test.ts",
            "tools/cors-proxy/**",
            "tools/site-router/**",
          ],
        },
      },
      "tools/cors-proxy",
      "tools/site-router",
      {
        test: {
          name: "pipeline-browser",
          include: ["packages/pipeline-browser/src/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
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
        // Only exercised by the pipeline-browser project's browser test (npm run test:browser), which `npm run coverage` doesn't run.
        "packages/pipeline-browser/src/**",
        // Runs under the cors-proxy/site-router projects' workerd pool, which doesn't support v8 coverage.
        "tools/cors-proxy/src/**",
        "tools/site-router/src/**",
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
