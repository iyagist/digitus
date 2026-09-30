import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules', '**/dist'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/vite.config.js', 'eslint.config.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
];
