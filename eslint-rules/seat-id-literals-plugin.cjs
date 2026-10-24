/**
 * ESLint plugin that forbids raw seat-id and neutral-owner string literals.
 *
 * Purpose: Registers `no-seat-id-literals` next to the other local plugins.
 * When to use: Required from eslint.config.js for TypeScript under src/.
 * Expected outcome: Exposes `no-seat-id-literals` as `seat-id-literals/no-seat-id-literals`.
 * Exceptions: None.
 */
'use strict';

const FORBIDDEN = new Set(['opponent', 'opponent2', 'opponent3', 'opponent4', 'neutral']);

/**
 * True when a literal is part of a type, not a value.
 *
 * Purpose: Type positions name a seat without being a runtime literal the rule is meant to catch.
 * When to use: Before reporting a forbidden literal.
 * Expected outcome: True for a literal inside a TypeScript type node.
 * Exceptions: None.
 */
function inTypePosition(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'TSLiteralType' ||
      current.type === 'TSTypeAnnotation' ||
      current.type === 'TSTypeAliasDeclaration' ||
      current.type === 'TSTypeReference' ||
      current.type === 'TSUnionType' ||
      current.type === 'TSIntersectionType'
    ) {
      return true;
    }
    if (current.type === 'TSAsExpression' || current.type === 'TSTypeAssertion') return false;
    current = current.parent;
  }
  return false;
}

const noSeatIdLiterals = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid raw seat-id and neutral-owner string literals in value position',
    },
    schema: [],
    messages: {
      useSeatConstants: "Use the constants and predicates in src/shared/seatIds.ts instead of '{{value}}'.",
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value !== 'string' || !FORBIDDEN.has(node.value)) return;
        if (inTypePosition(node)) return;
        context.report({ node, messageId: 'useSeatConstants', data: { value: node.value } });
      },
    };
  },
};

module.exports = {
  meta: { name: 'seat-id-literals', version: '1.0.0' },
  rules: {
    'no-seat-id-literals': noSeatIdLiterals,
  },
};
