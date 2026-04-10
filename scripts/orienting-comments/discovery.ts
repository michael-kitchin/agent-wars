import * as ts from 'typescript';

/**
 * Supported declaration shapes that require orienting comments under the repo contract.
 *
 * Purpose: Gives the tool a stable vocabulary for reporting, generation, and tests.
 * When to use: When classifying AST nodes discovered in TypeScript sources under src/.
 * Expected outcome: Each scanned declaration maps to at most one target record.
 * Exceptions: None.
 */
export type DeclarationKind =
  | 'field'
  | 'constructor'
  | 'method'
  | 'accessor'
  | 'enumMember'
  | 'functionOverload'
  | 'functionImplementation'
  | 'parameterProperty'
  | 'moduleVariable'
  | 'objectProperty'
  | 'interfaceDeclaration'
  | 'typeAliasDeclaration'
  | 'classDeclaration';

/**
 * Describes one declaration the orienting-comment pass may update.
 *
 * Purpose: Bundles the AST node with stable metadata for comment validation/generation.
 * When to use: After discovery determines a declaration is in scope and not excluded.
 * Expected outcome: Consumers can compute insertion ranges without re-walking parents.
 * Exceptions: None.
 */
export interface DeclarationTarget {
  readonly node: ts.Node;
  readonly kind: DeclarationKind;
  readonly displayName: string;
  readonly isInterfaceMember: boolean;
  readonly isAbstract: boolean;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly needsCommentReason: string;
  /** When set, overrides the usual interface-or-abstract contract heuristic for orienting text. */
  readonly orientingVariant?: 'contract' | 'implementation';
}

/**
 * Returns true when the declaration uses the `override` modifier (syntax-only exclusion).
 *
 * Purpose: Implements the execution plan's override exclusion rule.
 * When to use: Before enqueueing class methods, accessors, or properties.
 * Expected outcome: True only when an `override` keyword modifier is present.
 * Exceptions: None.
 */
export function hasOverrideModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  return mods?.some((m) => m.kind === ts.SyntaxKind.OverrideKeyword) ?? false;
}

/**
 * Collects orienting-comment targets from a parsed `SourceFile` without descending into function bodies.
 *
 * Purpose: Implements Phase 2 discovery with predictable scope boundaries.
 * When to use: Once per file during a repository scan.
 * Expected outcome: Returns all in-scope declarations for that file.
 * Exceptions: None.
 */
export function discoverTargets(sourceFile: ts.SourceFile): DeclarationTarget[] {
  const out: DeclarationTarget[] = [];
  for (const st of sourceFile.statements) walkStatement(st, out, sourceFile);
  return out;
}

function walkStatement(statement: ts.Statement, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  if (ts.isModuleDeclaration(statement)) {
    walkModuleDeclaration(statement, out, sourceFile);
    return;
  }
  if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
    const ex = statement.expression;
    if (ts.isClassExpression(ex)) {
      visitClassLike(ex, out, sourceFile);
    }
    return;
  }
  walkTopLevelDeclaration(statement, out, sourceFile);
}

function walkTopLevelDeclaration(statement: ts.Statement, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  if (ts.isModuleDeclaration(statement)) {
    walkModuleDeclaration(statement, out, sourceFile);
    return;
  }
  if (ts.isClassDeclaration(statement) || ts.isClassExpression(statement)) {
    visitClassLike(statement, out, sourceFile);
    return;
  }
  if (ts.isInterfaceDeclaration(statement)) {
    visitInterface(statement, out, sourceFile);
    return;
  }
  if (ts.isEnumDeclaration(statement)) {
    visitEnum(statement, out, sourceFile);
    return;
  }
  if (ts.isVariableStatement(statement)) {
    visitVariableStatement(statement, out, sourceFile);
    return;
  }
  if (ts.isTypeAliasDeclaration(statement)) {
    visitTypeAliasDeclaration(statement, out, sourceFile);
    return;
  }
  if (ts.isFunctionDeclaration(statement)) {
    if (isTopLevelFunctionContext(statement.parent)) {
      pushFunctionDeclaration(statement, out, sourceFile);
    }
  }
}

function walkModuleDeclaration(md: ts.ModuleDeclaration, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  if (md.body && ts.isModuleBlock(md.body)) {
    for (const st of md.body.statements) walkStatement(st, out, sourceFile);
    return;
  }
  if (md.body && ts.isModuleDeclaration(md.body)) {
    walkModuleDeclaration(md.body, out, sourceFile);
  }
}

function isTopLevelFunctionContext(parent: ts.Node | undefined): boolean {
  if (!parent) return false;
  return ts.isSourceFile(parent) || ts.isModuleBlock(parent);
}

function visitClassLike(node: ts.ClassLikeDeclaration, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  if (
    sourceFile.isDeclarationFile &&
    (ts.isClassDeclaration(node) || ts.isClassExpression(node)) &&
    node.name &&
    ts.isIdentifier(node.name)
  ) {
    const abstract = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword) ?? false;
    out.push({
      node,
      kind: 'classDeclaration',
      displayName: node.name.text,
      isInterfaceMember: false,
      isAbstract: abstract,
      confidence: 'high',
      needsCommentReason: 'ambient class declarations require orienting comments',
      orientingVariant: abstract ? 'contract' : 'implementation',
    });
  }
  for (const member of node.members) {
    if (ts.isConstructorDeclaration(member)) {
      visitConstructor(member, out, sourceFile);
      continue;
    }
    if (ts.isMethodDeclaration(member)) {
      visitMethod(member, out, sourceFile, false);
      continue;
    }
    if (ts.isPropertyDeclaration(member)) {
      visitClassProperty(member, out, sourceFile);
      continue;
    }
    if (ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
      visitAccessor(member, out, sourceFile);
    }
  }
}

function visitConstructor(member: ts.ConstructorDeclaration, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  out.push({
    node: member,
    kind: 'constructor',
    displayName: 'constructor',
    isInterfaceMember: false,
    isAbstract: false,
    confidence: 'high',
    needsCommentReason: 'constructors require orienting comments',
  });
  for (const p of member.parameters) {
    if (ts.isParameterPropertyDeclaration(p, member)) {
      out.push({
        node: p,
        kind: 'parameterProperty',
        displayName: p.name.getText(sourceFile),
        isInterfaceMember: false,
        isAbstract: false,
        confidence: 'high',
        needsCommentReason: 'parameter properties require orienting comments',
      });
    }
  }
}

function visitMethod(member: ts.MethodDeclaration, out: DeclarationTarget[], sourceFile: ts.SourceFile, isInterfaceMember: boolean): void {
  if (hasOverrideModifier(member)) return;
  const abstract = member.modifiers?.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword) ?? false;
  const name = member.name.getText(sourceFile);
  const kind: DeclarationKind = member.body ? 'method' : 'method';
  out.push({
    node: member,
    kind,
    displayName: name,
    isInterfaceMember,
    isAbstract: abstract,
    confidence: ts.isComputedPropertyName(member.name) ? 'medium' : 'high',
    needsCommentReason: abstract ? 'abstract methods require contract comments' : 'methods require orienting comments',
  });
}

function visitClassProperty(member: ts.PropertyDeclaration, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  if (hasOverrideModifier(member)) return;
  out.push({
    node: member,
    kind: 'field',
    displayName: member.name.getText(sourceFile),
    isInterfaceMember: false,
    isAbstract: false,
    confidence: ts.isComputedPropertyName(member.name) ? 'medium' : 'high',
    needsCommentReason: 'class fields require orienting comments',
  });
}

function visitAccessor(member: ts.GetAccessorDeclaration | ts.SetAccessorDeclaration, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  if (hasOverrideModifier(member)) return;
  out.push({
    node: member,
    kind: 'accessor',
    displayName: member.name.getText(sourceFile),
    isInterfaceMember: false,
    isAbstract: false,
    confidence: ts.isComputedPropertyName(member.name) ? 'medium' : 'high',
    needsCommentReason: 'accessors require orienting comments',
  });
}

function visitVariableStatement(statement: ts.VariableStatement, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  for (const decl of statement.declarationList.declarations) {
    visitTopLevelVariableDeclaration(decl, out, sourceFile);
  }
}

function visitTopLevelVariableDeclaration(decl: ts.VariableDeclaration, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  if (!ts.isIdentifier(decl.name)) return;
  out.push({
    node: decl,
    kind: 'moduleVariable',
    displayName: decl.name.text,
    isInterfaceMember: false,
    isAbstract: false,
    confidence: 'high',
    needsCommentReason: 'module-scope variables require orienting comments',
    orientingVariant: 'implementation',
  });
  if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
    visitObjectLiteralExpression(decl.initializer, out, sourceFile);
  }
}

function visitObjectLiteralExpression(obj: ts.ObjectLiteralExpression, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const key = prop.name;
      if (ts.isIdentifier(key)) {
        pushObjectProperty(prop, key.text, out, sourceFile);
      } else if (ts.isStringLiteral(key)) {
        pushObjectProperty(prop, key.text, out, sourceFile);
      }
      continue;
    }
    if (ts.isShorthandPropertyAssignment(prop)) {
      pushObjectProperty(prop, prop.name.text, out, sourceFile);
      continue;
    }
    if (ts.isMethodDeclaration(prop)) {
      visitMethod(prop, out, sourceFile, false);
    }
  }
}

function pushObjectProperty(node: ts.ObjectLiteralElement, displayName: string, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  out.push({
    node,
    kind: 'objectProperty',
    displayName,
    isInterfaceMember: false,
    isAbstract: false,
    confidence: 'high',
    needsCommentReason: 'object literal properties require orienting comments',
    orientingVariant: 'implementation',
  });
}

function visitTypeAliasDeclaration(node: ts.TypeAliasDeclaration, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  out.push({
    node,
    kind: 'typeAliasDeclaration',
    displayName: node.name.text,
    isInterfaceMember: false,
    isAbstract: false,
    confidence: 'high',
    needsCommentReason: 'type aliases require orienting comments',
    orientingVariant: 'implementation',
  });
  walkTypeNodeForLiteralMembers(node.type, out, sourceFile);
}

function walkTypeNodeForLiteralMembers(t: ts.TypeNode | undefined, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  if (!t) return;
  if (ts.isTypeLiteralNode(t)) {
    for (const m of t.members) {
      if (ts.isPropertySignature(m)) {
        out.push({
          node: m,
          kind: 'field',
          displayName: m.name.getText(sourceFile),
          isInterfaceMember: true,
          isAbstract: false,
          confidence: ts.isComputedPropertyName(m.name) ? 'medium' : 'high',
          needsCommentReason: 'type literal properties require contract comments',
        });
        continue;
      }
      if (ts.isMethodSignature(m)) {
        visitMethodLikeSignature(m, out, sourceFile);
      }
    }
    return;
  }
  if (ts.isUnionTypeNode(t) || ts.isIntersectionTypeNode(t)) {
    for (const u of t.types) walkTypeNodeForLiteralMembers(u, out, sourceFile);
    return;
  }
  if (ts.isParenthesizedTypeNode(t)) {
    walkTypeNodeForLiteralMembers(t.type, out, sourceFile);
  }
}

function visitInterface(node: ts.InterfaceDeclaration, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  out.push({
    node,
    kind: 'interfaceDeclaration',
    displayName: node.name.text,
    isInterfaceMember: false,
    isAbstract: false,
    confidence: 'high',
    needsCommentReason: 'interface declarations require orienting comments',
    orientingVariant: 'implementation',
  });
  for (const m of node.members) {
    if (ts.isMethodSignature(m)) {
      visitMethodLikeSignature(m, out, sourceFile);
      continue;
    }
    if (ts.isPropertySignature(m)) {
      out.push({
        node: m,
        kind: 'field',
        displayName: m.name.getText(sourceFile),
        isInterfaceMember: true,
        isAbstract: false,
        confidence: ts.isComputedPropertyName(m.name) ? 'medium' : 'high',
        needsCommentReason: 'interface properties require contract comments',
      });
    }
  }
}

function visitMethodLikeSignature(m: ts.MethodSignature, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  out.push({
    node: m,
    kind: 'method',
    displayName: m.name.getText(sourceFile),
    isInterfaceMember: true,
    isAbstract: false,
    confidence: ts.isComputedPropertyName(m.name) ? 'medium' : 'high',
    needsCommentReason: 'interface methods require contract comments',
  });
}

function visitEnum(node: ts.EnumDeclaration, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  for (const member of node.members) {
    const name = member.name.getText(sourceFile);
    out.push({
      node: member,
      kind: 'enumMember',
      displayName: name,
      isInterfaceMember: false,
      isAbstract: false,
      confidence: 'high',
      needsCommentReason: 'enum members require orienting comments',
    });
  }
}

function pushFunctionDeclaration(fn: ts.FunctionDeclaration, out: DeclarationTarget[], sourceFile: ts.SourceFile): void {
  const name = fn.name?.text ?? '<anonymous>';
  const kind: DeclarationKind = fn.body ? 'functionImplementation' : 'functionOverload';
  out.push({
    node: fn,
    kind,
    displayName: name,
    isInterfaceMember: false,
    isAbstract: false,
    confidence: fn.name ? 'high' : 'low',
    needsCommentReason: fn.body ? 'function implementations require orienting comments' : 'function overload signatures require orienting comments',
  });
}
