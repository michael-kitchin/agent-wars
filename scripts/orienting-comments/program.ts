import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/**
 * Creates a TypeScript program spanning all TypeScript inputs under src/ for AST tooling.
 *
 * Purpose: Ensures discovery runs with the same module settings the editor uses broadly.
 * When to use: CLI entry points before walking `SourceFile` nodes.
 * Expected outcome: Returns a program whose `getSourceFiles()` covers `src` TypeScript.
 * Exceptions: Throws if the tools tsconfig cannot be read from disk.
 */
export function createSrcAstProgram(repoRoot: string): ts.Program {
  const configPath = path.join(repoRoot, 'tsconfig.tools-src-ast.json');
  const read = (p: string) => fs.readFileSync(p, 'utf8');
  const configFile = ts.readConfigFile(configPath, read);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config!, ts.sys, repoRoot);
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
  });
  // Binding attaches `parent` pointers on statements; discovery relies on them for top-level checks.
  program.getTypeChecker();
  return program;
}
