import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

const vitestGlobals = {
  describe: "readonly",
  it: "readonly",
  test: "readonly",
  expect: "readonly",
  vi: "readonly",
  beforeAll: "readonly",
  afterAll: "readonly",
  beforeEach: "readonly",
  afterEach: "readonly",
};

export default [
  {
    ignores: ["build/**", "node_modules/**", "coverage/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...react.configs.flat.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    files: ["**/*.test.{js,jsx}", "src/setupTests.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...vitestGlobals },
    },
  },
  {
    // Build-time tools. They run under Node, never in a browser, and reach for
    // Buffer, console and the filesystem as a matter of course.
    files: ["scripts/**/*.{js,mjs}"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  {
    // Cloudflare Pages Functions. They run on workerd, so the globals are the
    // service-worker set plus HTMLRewriter, which the platform provides and no
    // globals package knows about.
    files: ["functions/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.serviceworker, HTMLRewriter: "readonly" },
    },
  },
];
