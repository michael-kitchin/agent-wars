# Cursor usage-export enrichment

Enrich agent-wars session JSON with Cursor **usage events** CSV downloads. The CSV has no session or request ids. Unmatched rows are treated as other projects and ignored. One user turn often produces many model calls, so a turn receives **all events in its time span**.

This document extends [completed/cursor-agent-session-extract-execution-plan.md](completed/cursor-agent-session-extract-execution-plan.md). Schema version stays `"1"`. Never `git commit` or `git push`. Never copy `state.vscdb`.

## Matching

Event `Date` matches a session when it falls in `[createdAt - 30s, lastUpdatedAt + 120s]`. If `lastUpdatedAt` is missing, `createdAt` is the end (still plus 120s). Slack is required because billing timestamps can land a few seconds after `lastUpdatedAt`.

**Model family:** lowercase; strip a leading `cursor-`; repeatedly strip trailing `-thinking-high`, `-thinking-xhigh`, `-thinking`, `-xhigh`, `-high`, `-medium`, `-fast`. Map `default` and `auto` to `auto`. Names that contain `(` (for example `Premium (Codex 5.3)`) are not suffix-stripped, so they do not match a bare `premium`.

**Ambiguity:** nested subagents are more specific than parents. If several windows match at the same nesting level, pick the shortest `[createdAt, lastUpdatedAt]` span (slack is not part of duration). Equal spans prefer the end time closest to the event. Remaining ties are skipped.

**Per-turn:** parse `submittedAt` as ISO when it starts with `YYYY-MM-DDT` (do not treat weekday labels as ISO — `Saturday` contains `T`). Otherwise parse Cursor labels like `Saturday, Aug 29, 2026, 10:08 AM (UTC-6)` with English month names, independent of locale. Each event goes to the latest turn with `turnTime <= event.Date`. Events before the first turn time attach to turn 0 when still in the session window. `submittedAt: null` is not a boundary. Minute-precision labels are a known limit. Turns are ordered by parsed time, then turn index.

Header-only sessions (zero turns) keep events on `header.usage` only.

## Schema

`header.usage` is `null` when no events matched. Otherwise:

- `eventCount`, `sourceFiles`
- `input` ← CSV Input (w/o Cache Write); `cacheWrite` ← Input (w/ Cache Write); `cacheRead`; `output`; `totalTokens` (null if every contributing cell was blank)
- `costUsd`: sum of `Cost` values that parse as numbers; `Included` / `Free` are not dollars
- `costLabels`, `kinds`: counts
- `method`: `usage_export`

Turn `tokens` with at least one event: the same numeric fields, plus `eventCount`, `method: usage_export`. Other turns keep their prior method. Session `tokenSummary.method` is `usage_export` when every non-empty prompt turn received usage, else `mixed` if some did, else unchanged. Keep `contextUsed` from the composer snapshot; do not copy it onto turns.

`index.json` rows include `usageEventCount` (0 if none). `inventory.json` gains `usageCsvs` (path + `rowCount`), `usageMatchedEvents`, `usageIgnoredEvents`. Add `usageCsv` to `header.sources` when any event matched. Do not store unused CSV rows in session JSON.

## CLI and replace

Repeatable `--usage-csv PATH`. If omitted, use `usage-events-*.csv` already in `--out`. Those names are allowed dump files and are copied into the new dump so they survive replace. If Windows cannot rename `--out` because a file is open, the extractor copies the new dump over the existing folder instead. Missing or unreadable CSV: log ERROR, record a skip reason on inventory, continue without usage. Duplicate rows across files (same Date, Model, token columns, Kind, Cost) are kept once.

## Tokens priority (after overlay)

`usage_export` > `stored` > `context_snapshot` > `char_estimate` > `none`. Local synthesis still runs first; usage replaces matched turns afterward.

## Verify

- Unit tests with a tiny fixture CSV (not the live 10k-row export).
- Live run: CSV still in `.social/analysis/cursor-sessions/`; known session `4ecac104-2954-49f7-bb0c-777b844cd75f` has usage near 1.3M total tokens; `copiedStateDb` false; unmatched CSV rows do not become session files.
