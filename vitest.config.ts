import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: true,
    // La suite intera in parallelo rallenta jsdom: con 5s alcuni test di
    // pagina andavano in timeout solo sotto carico.
    testTimeout: 20_000,
  },
})
