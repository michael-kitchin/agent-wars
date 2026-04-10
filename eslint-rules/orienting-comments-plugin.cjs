'use strict';

// ESLint plugin entry for orienting-comment enforcement (see .spec/orienting-comments-style-contract-v1.md).

const ORIENTING_RULE = require('./require-orienting-block.cjs');

module.exports = {
  meta: { name: 'orienting-comments', version: '1.0.0' },
  rules: {
    'require-orienting-block': ORIENTING_RULE,
  },
};
