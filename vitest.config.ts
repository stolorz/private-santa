import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": path.join(root, "test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["test/setup.ts"],
    exclude: [...configDefaults.exclude, "**/.next/**", "**/data/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: [
        "lib/**/*.ts",
        "app/api/**/*.ts",
        "hooks/**/*.ts",
        "instrumentation.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*-types.ts",
        "lib/db/schema.ts",
        "lib/phone-send.ts",
      ],
      thresholds: {
        statements: 100,
        functions: 100,
        lines: 100,
        branches: 100,
      },
    },
  },
});
