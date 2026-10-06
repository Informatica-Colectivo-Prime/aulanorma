import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    pool: "forks",
    restoreMocks: true,
    sequence: {
      shuffle: false,
    },
    setupFiles: ["tests/setup/no-network.ts"],
  },
});
