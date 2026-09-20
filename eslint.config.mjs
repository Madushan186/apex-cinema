import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/lib/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/node_modules/**",
      ".firebase/**",
    ],
  },
  // Browser app (React)
  {
    files: ["app/src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  // Playwright e2e specs (Node + browser test runner)
  {
    files: ["app/e2e/**/*.ts", "app/playwright.config.ts", "app/vite.config.ts", "app/vitest.setup.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.browser },
    },
  },
  // Pure booking-core package (Node-buildable, framework-agnostic)
  {
    files: ["packages/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
  // Cloud Functions (Node backend)
  {
    files: ["functions/src/**/*.ts", "functions/tests/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
);
