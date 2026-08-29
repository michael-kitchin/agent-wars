/**
 * ESLint plugin entry for src/ path casing (see .spec/naming-conventions-contract-v1.md).
 *
 * Purpose: Registers the file/directory camelCase rule next to other local plugins.
 * When to use: Required from eslint.config.js for TypeScript under src/.
 * Expected outcome: Exposes `require-src-path-casing` as `naming-conventions/require-src-path-casing`.
 * Exceptions: None.
 */
'use strict';

const REQUIRE_SRC_PATH_CASING = require('./require-src-path-casing.cjs');

module.exports = {
  meta: { name: 'naming-conventions', version: '1.0.0' },
  rules: {
    'require-src-path-casing': REQUIRE_SRC_PATH_CASING,
  },
};
