import * as ts from 'typescript';
import type { DeclarationKind, DeclarationTarget } from './discovery.js';
import { variantForFlags } from './commentValidate.js';

/**
 * Builds a single-line signature hint used inside generated orienting comments.
 *
 * Purpose: Gives maintainers a compact anchor tying prose to the declaration shape.
 * When to use: When generating summaries for methods, accessors, and signatures.
 * Expected outcome: Returns a short, single-line signature fragment.
 * Exceptions: None.
 */
export function buildSignatureHint(sourceFile: ts.SourceFile, node: ts.Node): string {
  const start = node.getStart(sourceFile, false);
  const text = sourceFile.text;

  if (ts.isInterfaceDeclaration(node)) {
    const lineEnd = sourceFile.getLineEndOfPosition(start);
    let span = text.substring(start, Math.min(lineEnd, start + 160));
    const brace = span.indexOf('{');
    if (brace >= 0) span = span.slice(0, brace);
    return span.replace(/\s+/g, ' ').trim();
  }

  if (ts.isTypeAliasDeclaration(node)) {
    const lineEnd = sourceFile.getLineEndOfPosition(start);
    let span = text.substring(start, Math.min(lineEnd, start + 160));
    const eq = span.indexOf('=');
    if (eq >= 0) span = span.slice(0, eq);
    return span.replace(/\s+/g, ' ').trim();
  }

  if (ts.isVariableDeclaration(node)) {
    const lineEnd = sourceFile.getLineEndOfPosition(start);
    const eqPos = text.indexOf('=', start);
    const end =
      eqPos >= 0 && eqPos < node.end ? Math.min(eqPos, lineEnd, start + 160) : Math.min(lineEnd, start + 160);
    const span = text.substring(start, Math.max(start, end));
    return span.replace(/\s+/g, ' ').trim();
  }

  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
    const lineEnd = sourceFile.getLineEndOfPosition(start);
    let span = text.substring(start, Math.min(lineEnd, start + 220));
    const brace = span.indexOf('{');
    if (brace >= 0) span = span.slice(0, brace);
    return span.replace(/\s+/g, ' ').trim();
  }

  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    const lineEnd = sourceFile.getLineEndOfPosition(start);
    let span = text.substring(start, Math.min(lineEnd, start + 220));
    if (ts.isArrowFunction(node)) {
      const arrow = span.indexOf('=>');
      if (arrow >= 0) span = span.slice(0, arrow);
    }
    const brace = span.indexOf('{');
    if (brace >= 0) span = span.slice(0, brace);
    return span.replace(/\s+/g, ' ').trim();
  }

  const span = text.substring(start, Math.min(node.end, start + 160));
  return span.replace(/\s+/g, ' ').trim();
}

/**
 * Produces the orienting comment block text for a declaration target.
 *
 * Purpose: Ensures generated comments match `.spec/orienting-comments-style-contract-v1.md`.
 * When to use: Whenever a declaration is missing or has an invalid orienting block.
 * Expected outcome: Returns a formatted orienting block comment string with required labeled lines.
 * Exceptions: None.
 */
export function generateOrientingBlock(target: DeclarationTarget, sourceFile: ts.SourceFile): string {
  const variant =
    target.orientingVariant ??
    variantForFlags({
      isInterfaceMember: target.isInterfaceMember,
      isAbstract: target.isAbstract,
    });
  const hint = buildSignatureHint(sourceFile, target.node);
  const name = target.displayName;

  const summary =
    variant === 'contract'
      ? summarizeContract(name, target.kind, hint)
      : summarizeImplementation(name, target.kind, hint);

  const contractOrPurpose =
    variant === 'contract'
      ? ` * Contract: Describes stable behavior for callers of \`${name}\` in this codebase.`
      : ` * Purpose: Supports maintainability by documenting why \`${name}\` exists.`;

  const when =
    ' * When to use: Use per team conventions when this declaration is the correct extension point for the current task.';
  const expected =
    ' * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.';
  const exceptions = ' * Exceptions: None.';

  const lines = ['/**', ` * ${summary}`, '', contractOrPurpose, when, expected, exceptions, ' */'];
  return lines.join('\n');
}

function summarizeImplementation(name: string, kind: DeclarationKind, hint: string): string {
  switch (kind) {
    case 'field':
      return `Documents and orients maintainers to the \`${name}\` field (${hint}).`;
    case 'constructor':
      return `Constructs the instance for \`${name}\` (${hint}).`;
    case 'method':
    case 'accessor':
      return `Implements behavior for \`${name}\` (${hint}).`;
    case 'enumMember':
      return `Defines the enum case \`${name}\`.`;
    case 'functionOverload':
    case 'functionImplementation':
      return `Defines the \`${name}\` function shape (${hint}).`;
    case 'parameterProperty':
      return `Declares the parameter property \`${name}\` on the containing constructor (${hint}).`;
    case 'moduleVariable':
      return `Documents the module-scope binding \`${name}\` (${hint}).`;
    case 'objectProperty':
      return `Documents the object literal property \`${name}\` (${hint}).`;
    case 'interfaceDeclaration':
      return `Documents the \`${name}\` interface as a named contract surface (${hint}).`;
    case 'typeAliasDeclaration':
      return `Documents the \`${name}\` type alias (${hint}).`;
    case 'classDeclaration':
      return `Documents the \`${name}\` class as an ambient type surface (${hint}).`;
    default:
      return `Documents \`${name}\` (${hint}).`;
  }
}

function summarizeContract(name: string, kind: DeclarationKind, hint: string): string {
  switch (kind) {
    case 'method':
    case 'accessor':
      return `Specifies the contract for \`${name}\` (${hint}).`;
    case 'field':
      return `Specifies the contract for the \`${name}\` member (${hint}).`;
    case 'classDeclaration':
      return `Specifies the contract for the \`${name}\` class surface (${hint}).`;
    default:
      return `Specifies the contract for \`${name}\` (${hint}).`;
  }
}
