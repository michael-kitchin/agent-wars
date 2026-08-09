import type { OpenRouterModel } from './ipc/openRouterTypes';

/**
 * Parses a pricing field into a finite per-token USD number when possible.

 * Purpose: Shared coercion for string/number OpenRouter price fields used in option suffixes.
 * When to use: Building the cost part of `formatModelOptionSuffix`.
 * Expected outcome: Finite number, or `null` when missing/invalid/non-finite.
 * Exceptions: None.
 */
function parseFinitePrice(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Formats a per-million-token USD amount for the cost suffix.

 * Purpose: Keeps `$…/M` rendering consistent (up to 4 decimals, trimmed trailing zeros).
 * When to use: After summing usable per-token rates and multiplying by `1e6`.
 * Expected outcome: Compact decimal string without a trailing `.` or useless zeros.
 * Exceptions: None.
 */
function formatUsdPerMillion(perMillion: number): string {
  const fixed = perMillion.toFixed(4);
  return fixed.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');
}

/**
 * Builds the reasoning status phrase for a model option suffix when applicable.

 * Purpose: Summarizes default/mandatory reasoning for the Model-tab dropdown.
 * When to use: Inside `formatModelOptionSuffix` after the optional cost part.
 * Expected outcome: `reasoning: <effort>`, `reasoning: default`, or `null` when off/unknown.
 * Exceptions: None.
 */
function formatReasoningStatusPart(model: OpenRouterModel): string | null {
  const reasoning = model.reasoning;
  const enabled = reasoning?.default_enabled === true;
  const mandatory = reasoning?.mandatory === true;
  if (!enabled && !mandatory) return null;
  const effortRaw = reasoning?.default_effort;
  const effort =
    effortRaw !== undefined && effortRaw !== null ? String(effortRaw).trim() : '';
  return effort ? `reasoning: ${effort}` : 'reasoning: default';
}

/**
 * Builds the bracket suffix for a model dropdown option.

 * Purpose: Encodes optional cost and optional reasoning status into Model-tab list lines.
 * When to use: When rendering OpenRouter model `<option>` labels after a successful list fetch.
 * Expected outcome: `""`, `" [$…/M]"`, `" [reasoning: …]"`, or both parts joined; omit empty parts.
 * Exceptions: None.
 */
export function formatModelOptionSuffix(model: OpenRouterModel): string {
  const parts: string[] = [];

  const prompt = parseFinitePrice(model.pricing?.prompt);
  const completion = parseFinitePrice(model.pricing?.completion);
  if (prompt !== null || completion !== null) {
    const sumPerToken = (prompt ?? 0) + (completion ?? 0);
    const perMillion = sumPerToken * 1_000_000;
    if (Number.isFinite(perMillion)) {
      parts.push(`$${formatUsdPerMillion(perMillion)}/M`);
    }
  }

  const reasoningPart = formatReasoningStatusPart(model);
  if (reasoningPart) parts.push(reasoningPart);

  if (parts.length === 0) return '';
  return ` [${parts.join(', ')}]`;
}

/**
 * Builds the full Model-tab option label for one OpenRouter model.

 * Purpose: Combines display name (or id) with the metadata suffix for the dropdown.
 * When to use: When creating or refreshing `#openrouter-model` options.
 * Expected outcome: `(name ?? id)` plus `formatModelOptionSuffix`.
 * Exceptions: None.
 */
export function formatModelOptionLabel(model: OpenRouterModel): string {
  return `${model.name ?? model.id}${formatModelOptionSuffix(model)}`;
}
