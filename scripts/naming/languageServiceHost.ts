import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/**
 * Creates a language service over `tsconfig.tools-src-ast.json` for rename locations.
 *
 * Purpose: Lets apply use the same file set as editor rename, including import updates.
 * When to use: Before `findRenameLocations` or `getEditsForFileRename`.
 * Expected outcome: A service whose host reads files from disk under `repoRoot`.
 * Exceptions: Throws when the tsconfig cannot be read or parsed.
 */
export function createNamingLanguageHost(repoRoot: string): ts.LanguageService {
  const configPath = path.join(repoRoot, 'tsconfig.tools-src-ast.json');
  const configFile = ts.readConfigFile(configPath, (p) => fs.readFileSync(p, 'utf8'));
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => parsed.options,
    getScriptFileNames: () => parsed.fileNames,
    getScriptVersion: () => '1',
    getScriptSnapshot: (fileName) => {
      if (!ts.sys.fileExists(fileName)) return undefined;
      return ts.ScriptSnapshot.fromString(ts.sys.readFile(fileName, 'utf8') ?? '');
    },
    getCurrentDirectory: () => repoRoot,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  return ts.createLanguageService(host);
}
