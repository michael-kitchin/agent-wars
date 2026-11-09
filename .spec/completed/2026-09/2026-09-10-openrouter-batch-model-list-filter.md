# OpenRouter batch model list filter

The Model-tab dropdown must not list OpenRouter batch slugs. Interactive models without a batch suffix stay. Display-label rules in `openrouter-model-list-display.md` are unchanged.

## Match rule

A model is excluded from `listModels` output when its `id` satisfies:

`modelId.toLowerCase().endsWith(':batch')`

Inspect `id` only. Do not trim. Do not read `name`, `description`, or pricing.

## Examples

Drop:

- `anthropic/claude-sonnet-4.5:batch`
- `openai/gpt-4o:BATCH`

Keep:

- `anthropic/claude-sonnet-4.5` (interactive twin)
- `anthropic/claude-sonnet-4.5:free`
- `provider/batch-foo` (the letters `batch` are not a `:batch` suffix)
- `provider/foo:batch-extra` (does not end with `:batch`)

## List pipeline

After a successful OpenRouter `/models` fetch, main process maps each `data` row with `mapOpenRouterModelRow`, drops `null` rows, drops batch ids by the match rule above, then sorts by `(name ?? id)` case-insensitively. That assembly is `buildOpenRouterModelList`. `listModels` is the fetch/auth wrapper around it.

The renderer keeps populating `#openrouter-model` from the IPC list. It does not apply a second filter.

If every usable row is a batch slug, the result is an empty `models` array (success), not an API error. The select shows only the placeholder `— Select model —`.

## Persistence

The persisted selection remains the model `id` string. Filtering the list does not clear `openrouter_selected_model`. After a refresh, a stored batch id will not match any option, so the control shows the placeholder until the user picks another model.

## Out of scope

- Filtering `:free` or any suffix other than `:batch`
- Matching on display name or description
- Clearing the persisted selected-model value
- Rejecting chat / order requests that still carry a batch id
- Changing option-label cost/reasoning suffixes
- Calling the live OpenRouter catalog from tests

## Verification

`src/main/openRouter/openRouterBatchModelId.test.ts` locks the match rule. `src/main/openRouter/buildOpenRouterModelList.test.ts` locks map + drop + sort composition. Do not add network tests against OpenRouter.
