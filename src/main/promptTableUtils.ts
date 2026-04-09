export const PROMPT_EMPTY_CELL = '—';

function normalizePromptCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return PROMPT_EMPTY_CELL;
  return String(value);
}

/**
 * Why this exists:
 *     Escapes markdown table-sensitive characters so prompt tables remain parseable and readable.
 * When to use:
 *     Before writing dynamic content into table cells.
 * What to expect:
 *     Returns a single-line string with pipes escaped and newlines collapsed.
 */
export function sanitizePromptTableCell(value: unknown): string {
  return normalizePromptCell(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * Why this exists:
 *     Builds markdown table lines consistently across prompt sections.
 * When to use:
 *     Rendering prompt tables with stable separators and optional empty fallback row.
 * What to expect:
 *     Returns header + separator + body rows; inserts emptyRow when body is empty and emptyRow is provided.
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
