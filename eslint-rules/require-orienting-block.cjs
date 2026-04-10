/**
 * ESLint rule requiring orienting block comments on in-scope TypeScript declarations.
 *
 * Purpose: Catches missing orienting documentation before merge when type-aware lint is enabled.
 * When to use: As an `error` rule on TypeScript sources under src/ in this repository.
 * Expected outcome: Reports declarations whose nearest leading block comment fails validation.
 * Exceptions: None.
 */
'use strict';

/**
 * Normalizes a captured block comment value for line-based validation.
 *
 * Purpose: Mirrors the tool-side `normalizeBlockInterior` contract checks without a TS build step.
 * When to use: Before validating labeled orienting lines.
 * Expected outcome: Returns trimmed interior lines without star margins.
 * Exceptions: None.
 */
function normalizeBlockInterior(raw) {
  let t = String(raw).trim();
  if (!t.startsWith('/**')) return [];
  t = t.slice(3);
  const end = t.lastIndexOf('*/');
  if (end >= 0) t = t.slice(0, end);
  return t
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\*\s?/, '').trimEnd())
    .map((l) => l.replace(/^\s*$/, ''));
}

/**
 * Returns true when interior lines satisfy the orienting contract for the variant.
 *
 * Purpose: Shared boolean gate for ESLint reporting.
 * When to use: After extracting a candidate comment string.
 * Expected outcome: True only when required labeled lines exist with non-empty values.
 * Exceptions: None.
 */
function isValidOrientingInterior(lines, variant) {
  const nonEmpty = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (nonEmpty.length < 5) return false;
  const summary = nonEmpty[0];
  if (summary.includes('Purpose:') || summary.includes('Contract:') || summary.includes('When to use:')) return false;

  const labelLine = (label) => nonEmpty.some((l) => l.startsWith(label) && l.slice(label.length).trim().length > 0);

  const core =
    labelLine('When to use:') &&
    labelLine('Expected outcome:') &&
    labelLine('Exceptions:') &&
    (variant === 'contract' ? labelLine('Contract:') : labelLine('Purpose:'));

  return core;
}

function isValidOrientingBlock(raw, variant) {
  const trimmed = String(raw).trim();
  if ((trimmed.match(/\/\*\*/g) ?? []).length !== 1) return false;
  return isValidOrientingInterior(normalizeBlockInterior(raw), variant);
}

/**
 * Reads the first attached `/**` block immediately preceding a node's code span.
 *
 * Purpose: Matches how TypeScript associates leading JSDoc-style blocks with declarations.
 * When to use: From ESLint rule visitors after mapping to TypeScript nodes when possible.
 * Expected outcome: Returns raw comment text including delimiters, or null when absent.
 * Exceptions: None.
 */
function readLeadingOrientingRaw(sourceText, nodeStartIndex) {
  if (typeof nodeStartIndex !== 'number' || nodeStartIndex <= 0) return null;
  const head = sourceText.slice(0, nodeStartIndex);
  const re = /\/\*\*[\s\S]*?\*\//g;
  let m;
  let last = null;
  while ((m = re.exec(head)) !== null) last = m[0];
  if (!last) return null;
  if (!last.trimStart().startsWith('/**')) return null;
  return last;
}

/**
 * Maps ESLint AST nodes to orienting variants and performs source-level validation.
 *
 * Purpose: Implements the rule visitor body with minimal coupling to ESLint node shapes.
 * When to use: For each supported declaration node type.
 * Expected outcome: Reports a problem when validation fails.
 * Exceptions: None.
 */
function create(context) {
  const services = context.sourceCode.parserServices;
  if (!services || typeof services.esTreeNodeToTSNodeMap?.get !== 'function') {
    return {};
  }
  const map = services.esTreeNodeToTSNodeMap;
  const src = context.getSourceCode().text;

  function variantForEslintNode(node) {
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      return node.abstract ? 'contract' : 'implementation';
    }
    if (node.type === 'TSMethodSignature' || node.type === 'TSPropertySignature') return 'contract';
    if (node.type === 'MethodDefinition' && node.kind !== 'constructor') {
      const tsNode = map.get(node);
      const abstract =
        tsNode &&
        Array.isArray(tsNode.modifiers) &&
        tsNode.modifiers.some((m) => m.kind === 128); // SyntaxKind.AbstractKeyword
      return abstract ? 'contract' : 'implementation';
    }
    return 'implementation';
  }

  function shouldSkipMethodDefinition(node) {
    if (node.type !== 'MethodDefinition') return false;
    if (node.override === true) return true;
    return false;
  }

  function shouldSkipPropertyDefinition(node) {
    if (node.type !== 'PropertyDefinition') return false;
    if (node.override === true) return true;
    return false;
  }

  function checkNode(node) {
    if (shouldSkipMethodDefinition(node)) return;
    if (shouldSkipPropertyDefinition(node)) return;

    const tsNode = map.get(node);
    const startIndex = tsNode ? tsNode.getStart(undefined, false) : node.range[0];
    const raw = readLeadingOrientingRaw(src, startIndex);
    const variant = variantForEslintNode(node);
    const ok = raw && isValidOrientingBlock(raw, variant);
    if (ok) return;

    context.report({
      node,
      messageId: 'missingOrientingBlock',
    });
  }

  return {
    MethodDefinition(node) {
      if (node.parent?.type !== 'ClassBody') return;
      checkNode(node);
    },
    PropertyDefinition(node) {
      if (node.parent?.type !== 'ClassBody') return;
      checkNode(node);
    },
    TSMethodSignature(node) {
      if (node.parent?.type !== 'TSInterfaceBody') return;
      checkNode(node);
    },
    TSPropertySignature(node) {
      if (node.parent?.type !== 'TSInterfaceBody') return;
      checkNode(node);
    },
    TSInterfaceDeclaration(node) {
      if (node.parent?.type !== 'TSModuleBlock') return;
      checkNode(node);
    },
    ClassDeclaration(node) {
      if (node.parent?.type !== 'TSModuleBlock') return;
      checkNode(node);
    },
    TSEnumMember(node) {
      checkNode(node);
    },
    FunctionDeclaration(node) {
      const p = node.parent;
      if (!p || (p.type !== 'Program' && p.type !== 'TSModuleBlock')) return;
      checkNode(node);
    },
  };
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require orienting block comments on in-scope TypeScript declarations',
    },
    messages: {
      missingOrientingBlock:
        'Missing or invalid orienting block comment (see .spec/orienting-comments-style-contract-v1.md).',
    },
    schema: [],
  },
  defaultOptions: [],
  create,
};
