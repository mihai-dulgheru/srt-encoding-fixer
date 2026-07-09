const js = require("@eslint/js");
const globals = require("globals");
const prettier = require("eslint-config-prettier");

module.exports = [
  { ignores: ["node_modules/**", "srt/**", ".superpowers/**"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      // The encoding detector intentionally swallows decode failures.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  // Keep formatting concerns to Prettier; turn off conflicting ESLint rules.
  prettier,
];
