import type { BannedSuffix, Violation } from './types.js';

const BANNED_SUFFIXES: readonly BannedSuffix[] = [
  'Utils',
  'Impl',
  'Manager',
  'Service',
  'Processor',
  'Controller',
];

/**
 * Returns true when `name` is lowerCamelCase with no hyphens or underscores.
 *
 * Purpose: Shared casing predicate for file stems and exported function names.
 * When to use: Before classifying a file or function as contract-compliant.
 * Expected outcome: True only for identifiers like `hexCoordinates` or `res1Hex`.
 * Exceptions: None.
 */
export function isCamelCaseIdentifier(name: string): boolean {
  return /^[a-z][a-zA-Z0-9]*$/.test(name);
}

/**
 * Returns true when `name` is PascalCase with no hyphens or underscores.
 *
 * Purpose: Shared casing predicate for exported types, interfaces, and classes.
 * When to use: When classifying an exported type-like identifier.
 * Expected outcome: True only for identifiers like `GameStateSnapshot`.
 * Exceptions: None.
 */
export function isPascalCaseIdentifier(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

/**
 * Returns true when `segment` is kebab-case (contains a hyphen).
 *
 * Purpose: Detects directory and file stems that violate the camelCase path contract.
 * When to use: When classifying a path segment under `src/`.
 * Expected outcome: True for `game-actions`; false for `gameActions`.
 * Exceptions: None.
 */
export function isKebabCaseSegment(segment: string): boolean {
  return segment.includes('-');
}

/**
 * Returns the banned role suffix in `name`, if any.
 *
 * Purpose: Enforces the closed suffix allowlist (`Utils` → `Helpers`, no `Impl`).
 * When to use: On file stems and exported identifiers.
 * Expected outcome: The matching suffix or null when the name is allowed.
 * Exceptions: None.
 */
export function bannedSuffixIn(name: string): BannedSuffix | null {
  const found = BANNED_SUFFIXES.find((suffix) => name.endsWith(suffix));
  return found ?? null;
}

/**
 * Returns true when `name` encodes a milestone or tool-group number.
 *
 * Purpose: Finds `tool1Pathfinding` / `TOOL2_NAMES` style identifiers forbidden by the contract.
 * When to use: On file stems and exported const/function names.
 * Expected outcome: True for `tool2Assessment` and `TOOL2_NAMES`; false for `assessment`.
 * Exceptions: None.
 */
export function isNumberedToolName(name: string): boolean {
  return /tool\d/i.test(name) || /^TOOL\d_/.test(name);
}

/**
 * Converts a kebab-case segment to camelCase.
 *
 * Purpose: Supplies a deterministic suggested name for kebab path violations.
 * When to use: When emitting a `directoryCasing` or `fileCasing` violation.
 * Expected outcome: `game-actions` becomes `gameActions`.
 * Exceptions: None.
 */
export function kebabToCamel(segment: string): string {
  return segment.replace(/-([a-z0-9])/g, (_all, ch: string) => ch.toUpperCase());
}

/**
 * Returns a directory-casing violation for `dirPathFromSrc`, or null when valid.
 *
 * Purpose: Classifies kebab directories and the all-lowercase `openrouter` brand folder.
 * When to use: For each directory path relative to `src/` (no `src/` prefix).
 * Expected outcome: A `directoryCasing` violation for `main/game-actions` or `main/openrouter`.
 * Exceptions: None.
 */
export function directoryViolations(dirPathFromSrc: string): Violation | null {
  const segments = dirPathFromSrc.split(/[\\/]/).filter((part) => part.length > 0);
  const segment = segments[segments.length - 1];
  if (!segment) return null;
  const filePath = `src/${dirPathFromSrc.replace(/\\/g, '/')}`;
  if (segment === 'openrouter') {
    return {
      category: 'directoryCasing',
      filePath,
      currentName: segment,
      suggestedName: 'openRouter',
      detail: 'Brand directory must use camelCase openRouter',
    };
  }
  if (isKebabCaseSegment(segment)) {
    return {
      category: 'directoryCasing',
      filePath,
      currentName: segment,
      suggestedName: kebabToCamel(segment),
      detail: 'Directory segments under src/ must be camelCase',
    };
  }
  return null;
}
