# OpenRouter Model List Display

Rules for the Model tab dropdown labels and the selected-model description tooltip.

## Fields from the models API

Only these OpenRouter model fields are used for UI:

- `id` (required)
- `name` (optional display name)
- `description` (optional; tooltip text)
- `pricing.prompt` / `pricing.completion` (optional; cost suffix)
- `reasoning.default_effort` / `reasoning.default_enabled` / `reasoning.mandatory` (optional; reasoning status suffix)

Other API fields are ignored.

## Option label suffix

Each populated model option’s text is `(name ?? id)` plus an optional bracket suffix.

Suffix shape: a single space, then `[` … `]` with present parts joined by `", "`.

Part order when present:

1. **Cost** (optional) — `$<value>/M` where `<value>` is the sum of usable per-token `prompt` and `completion` rates, multiplied by `1_000_000`.
2. **Reasoning status** (optional) — see below.

Omit empty parts and their commas. If neither part applies, omit the whole bracket suffix.

### Cost parsing

- Accept string or number inputs.
- A field is usable only when `Number(...)` is finite.
- Sum usable fields only; omit the cost part when neither field is usable.
- After scaling by `1e6`, omit the cost part if the result is not finite.
- Format as dollars and cents: always two fractional digits, rounded half-up to the nearest cent (examples: `$18.00/M`, `$0.15/M`, `$1.50/M`).

### Reasoning status

- When `reasoning.default_enabled === true` **or** `reasoning.mandatory === true`:
  - with non-empty trimmed `default_effort` → `reasoning: <effort>`
  - otherwise → `reasoning: default`
- When `default_enabled === false` and `mandatory === false`, **or** reasoning status cannot be determined (missing `reasoning` object, or flags not on): omit the reasoning part entirely (display nothing).
- Booleans use strict `=== true` / `=== false` (no truthy coercion).

### Examples

| Inputs | Suffix |
| --- | --- |
| cost only (no reasoning section) | ` [$9.00/M]` |
| cost + enabled + effort `high` | ` [$9.00/M, reasoning: high]` |
| enabled, no effort | ` [reasoning: default]` |
| mandatory + effort `medium` | ` [reasoning: medium]` |
| explicitly off (`enabled` and `mandatory` false) | _(no suffix / no reasoning text)_ |
| nothing else | _(no suffix)_ |

### Non-model options

- Placeholder `— Select model —`: no suffix.
- Pre-refresh id-only stub options: no suffix until a successful models refresh replaces them.

## Description tooltip

- Element: `#model-description-tooltip` with class `hex-tooltip` (same visual format as hex details). Mount it as a body-level peer of `#sidebar` (not inside `#canvas-container`) so fixed positioning is not trapped under the sidebar stacking context.
- Delay: `HEX_DETAILS_TOOLTIP_DELAY_MS` (750 ms).
- Position offset: `TOOLTIP_OFFSET_PX` from the pointer.
- Content: trimmed `description` of the **currently selected** model, set with `textContent` (never HTML).
- Whitespace-only or missing description: no tooltip.
- Show only while the native `<select>` is **closed**. Suppress (cancel timer and hide) when the list opens (`mousedown` / keys that open the list). Resume only after a fresh hover dwell once the control is closed again.
- Also hide/cancel on pointer leave, blur, empty selection, models refresh, and when the newly selected model has no description.
- Do not use native `title` on the select or options. Do not attach tooltips to open-list `<option>` rows (native OS popups do not expose reliable per-option hover).

## Persistence and sorting

- Persisted selection remains the model `id` only.
- Sort models by `(name ?? id)` case-insensitively; do not sort by the display suffix.
