/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Repo-root public/ (not app/public) so public/brand/apex-logo.png stays
  // at the path docs/CLAUDE.md and PROJECT_BRIEF.md reference.
  publicDir: fileURLToPath(new URL("../public", import.meta.url)),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  optimizeDeps: {
    // @apex-cinema/booking-core is an npm workspace package, so its
    // node_modules entry is a symlink to ../packages/booking-core — Vite
    // treats symlinked ("linked") packages as part of the app's own source
    // and serves them straight from disk via /@fs/, skipping esbuild
    // pre-bundling by default. That's fine for real ESM source, but this
    // package's tsc build (`module: "nodenext"`, no `"type": "module"` in
    // its package.json — required so Cloud Functions' CommonJS `require()`
    // of it keeps working, see functions/lib/index.js) emits CommonJS, and
    // a raw CommonJS file served directly as a native ES module has no
    // static `export` statements, so the browser's module loader can't see
    // named exports like `SLOT_TIMES` ("does not provide an export named").
    // Explicitly including it here forces esbuild to pre-bundle it like any
    // other dependency, which performs the same CJS→ESM interop production
    // builds already get for free via Rollup — this only affects `vite dev`.
    include: ["@apex-cinema/booking-core"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**"],
  },
});
