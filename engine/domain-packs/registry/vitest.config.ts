import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "../../../scripts/pack-export.test.ts"],
  },
});
