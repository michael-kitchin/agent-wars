const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const orientingComments = require('./eslint-rules/orienting-comments-plugin.cjs');
const namingConventions = require('./eslint-rules/naming-conventions-plugin.cjs');

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
      'naming-conventions': namingConventions,
    },
    rules: {
      'orienting-comments/require-orienting-block': 'error',
      'naming-conventions/require-src-path-casing': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['PascalCase'] },
        {
          selector: 'variable',
          modifiers: ['const'],
          format: ['camelCase', 'UPPER_CASE'],
        },
        { selector: 'function', format: ['camelCase'] },
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'import', format: ['camelCase', 'PascalCase'] },
        { selector: 'objectLiteralProperty', format: null },
        { selector: 'typeProperty', format: null },
      ],
    },
  }
);
