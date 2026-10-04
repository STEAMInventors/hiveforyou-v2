import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 120_000,
    environment: "node",
    server: {
      deps: {
        inline: ["pdfjs-dist"],
      },
    },
  },
});
