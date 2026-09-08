import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "json/**", "coverage/**"],
  },
  js.configs.recommended,
  {
    // .cjs too: test/fixtures/*.cjs are CommonJS Node scripts like the rest.
    // The extension is what keeps them out of requireResolution.test.js's scan,
    // which reads a probe's require() literals as broken requires.
    files: ["**/*.{js,cjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
];
