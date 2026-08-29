import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/**
 * Creates a TypeScript program from a repo-relative tsconfig path.
 *
 * Purpose: Lets the scanner reuse the same file sets the rest of the tooling uses.
 * When to use: Before walking source files for exported-identifier checks.
 * Expected outcome: A program whose `getSourceFiles()` covers that tsconfig's inputs.
 * Exceptions: Throws when the tsconfig cannot be read or parsed.
 */
export function createProgramFromTsconfig(repoRoot: string, tsconfigRel: string): ts.Program {
  const configPath = path.join(repoRoot, tsconfigRel);
  const configFile = ts.readConfigFile(configPath, (p) => fs.readFileSync(p, 'utf8'));
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
  });
  program.getTypeChecker();
  return program;
}
