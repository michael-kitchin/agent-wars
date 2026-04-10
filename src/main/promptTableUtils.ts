/**
 * Documents the module-scope binding `PROMPT_EMPTY_CELL` (PROMPT_EMPTY_CELL).

 * Purpose: Supports maintainability by documenting why `PROMPT_EMPTY_CELL` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const PROMPT_EMPTY_CELL = '—';

/**
 * Defines the `normalizePromptCell` function shape (function normalizePromptCell(value: unknown): string).

 * Purpose: Supports maintainability by documenting why `normalizePromptCell` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function normalizePromptCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return PROMPT_EMPTY_CELL;
  return String(value);
}

/**
 * Defines the `sanitizePromptTableCell` function shape (export function sanitizePromptTableCell(value: unknown): string).

 * Purpose: Supports maintainability by documenting why `sanitizePromptTableCell` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function sanitizePromptTableCell(value: unknown): string {
  return normalizePromptCell(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * Defines the `buildPromptTableLines` function shape (export function buildPromptTableLines().

 * Purpose: Supports maintainability by documenting why `buildPromptTableLines` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildPromptTableLines(
  headers: string[],
  rows: Array<Array<unknown>>,
  emptyRow?: Array<unknown>
): string[] {
  const formatRow = (cells: Array<unknown>): string =>
    `| ${cells.map((cell) => sanitizePromptTableCell(cell)).join(' | ')} |`;
  const lines = [formatRow(headers), formatRow(headers.map(() => '---'))];
  if (rows.length > 0) {
    for (const row of rows) lines.push(formatRow(row));
    return lines;
  }
  if (emptyRow) lines.push(formatRow(emptyRow));
  return lines;
}
