const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const orientingComments = require('./eslint-rules/orienting-comments-plugin.cjs');

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.main.json', './tsconfig.renderer.json'],
        tsconfigRootDir: __dirname,
      },
    },
    files: ['src/**/*.ts', 'src/**/*.d.ts'],
    plugins: {
      'orienting-comments': orientingComments,
    },
    rules: {
      'orienting-comments/require-orienting-block': 'error',
    },
  }
);
