# Execution Plan: Cursor Agent Session Extract

*Version 1.0 — September 2026*

> **For the executing agent:** Work one numbered section at a time. Complete that section’s verification before starting the next. Locked decisions in this document are authoritative. Never `git commit` or `git push`. Identifiers used to name sections of this document must not appear in Python module names, CLI flags, log messages, or output JSON keys.

**Goal:** A stdlib Python CLI that reads Cursor’s local agent stores for the agent-wars workspace family and writes one JSON file per parent agent session (subagents nested) under `f:/Projects/Personal/agent-wars/.social/analysis/cursor-sessions/`.

**Architecture:** Transcript-first, then keyed SQLite enrichment. Session identity is the composer/transcript UUID. Discovery is the union of (a) parent JSONL folders under the agent-wars project slugs and (b) `composerHeaders` rows whose workspace id is in the allowlist and whose `unifiedMode` is `agent`. Each run replaces the output directory via an atomic swap. The global `state.vscdb` is never copied. Lookups are by primary key or exact `cursorDiskKV` key only.

**Tech stack:** Python 3.11+ stdlib only (`pathlib`, `json`, `sqlite3`, `argparse`, `logging`, `tempfile`, `unittest`, `dataclasses`, `datetime`). No tokenizer package. No writes into any Cursor directory.

---

## Global constraints

Copy these into every later artifact that is not this plan. Do not re-decide them.

- Never `git commit` or `git push`.
- Never write, copy-over, or delete files under `%APPDATA%\Cursor` or `%USERPROFILE%\.cursor`.
- Never copy `state.vscdb` (observed ~13.8 GB). Open `file:<posix-path>?mode=ro`. Query `composerHeaders` by `composerId`. Query `cursorDiskKV` with `WHERE key = ?` only. Never `SELECT * FROM cursorDiskKV`. Never `LIKE '%…%'` on `value`.
- Do not match the substring `agent-wars` inside header JSON (false-positive: story-garden). Use the workspace-id allowlist and project slugs below.
- Python modules: PEP 8 snake_case files and functions; PascalCase for types. No `Utils` or `Impl` suffixes.
- Public functions get orienting comments (why / when / result / exceptions).
- Logging via stdlib `logging`: DEBUG on public entry points, ERROR on caught exceptions, DEBUG on read-only getters (Python has no TRACE). Check log level before interpolating large strings.
- Tests: happy paths and essential failures only. No tests of argparse wiring that only delegates. Fixtures in-repo; the live 13.8 GB DB is not a unit-test dependency. One optional live smoke uses composer id `4ecac104-2954-49f7-bb0c-777b844cd75f`.
- Desirable module size 600 lines, hard 1000. Desirable function arity 6, hard 10; use a frozen config object when needed.
- CLI `--out` must resolve outside Cursor app data and outside this Python package. Refuse if `--out` is inside `%APPDATA%\Cursor`, `%USERPROFILE%\.cursor`, or the package directory.

---

## Confirmed decisions

- **Workspace:** agent-wars family on this machine: current multi-root `.code-workspace`, the folder workspace, and the older `.spec/agent-wars.code-workspace`. Folders that share this window (Data, agent-wars-meta, agent-wars-scratch) are covered because their chats live under those workspace ids / project slugs. Other projects (including story-garden) are out.
- **Code:** `f:/Projects/Personal/agent-wars/.social/analysis/cursor_session_extract/`. **Dumps:** `f:/Projects/Personal/agent-wars/.social/analysis/cursor-sessions/`.
- **Session set:** Every parent session with an `agent-transcripts` JSONL under the agent-wars project slugs (any `unifiedMode`, including plan/debug), **plus** agent-mode composers whose workspace id is in the allowlist even if JSONL is missing. Chat/Ask/Edit/Tab without an agent transcript are skipped. Nested subagents stay inside the parent JSON.
- **Prompts:** User-typed prompt text in full. Injected material is an **inventory** (name, kind, byte length, token length when stored) — not the bodies.
- **Tokens:** Prefer stored non-zero bubble counts, then `composerData.promptTokenBreakdown` / context snapshots, then `len(userPrompt)//4`. Always record `method`. `{0,0}` is absent, not zero usage.
- **Omit:** assistant/response text, thinking, tool results, file diffs, checkpoint `diffs/` and `files/`, `agent-tools/*.txt` bodies, injected prompt bodies.
- **Re-run:** full overwrite of `cursor-sessions/` via write-to-temp then replace.

---

## Observed stores (Windows hints, not a closed schema)

- Transcripts: `%USERPROFILE%\.cursor\projects\f-Projects-Personal-agent-wars\agent-transcripts\<sessionId>\<sessionId>.jsonl` and `subagents\`. Second slug: `f-Projects-Personal-agent-wars-spec-agent-wars-code-workspace`.
- Global DB: `%APPDATA%\Cursor\User\globalStorage\state.vscdb`. Tables: `ItemTable`, `cursorDiskKV`, `composerHeaders`.
- `composerHeaders` columns: `composerId`, `workspaceId`, `createdAt`, `lastUpdatedAt`, `isArchived`, `isSubagent`, `recency`, `checkpointAt`, `value` (JSON), `subagentTypeName`.
- Allowlist workspace ids (32-char hex): `20ef68785a4a4e652811d3e817cf8e95`, `071a46caf4fd2b192287602459fba42f`, `e21e254715bba77b99ff7ace1cea01b0`. Some rows store a numeric timestamp in the `workspaceId` **column**; those are not allowlist ids. Prefer `workspaceIdentifier.id` from JSON `value`. Treat the column as a match only when it is one of the three hex ids.
- `composerData:<id>` holds `promptTokenBreakdown` (including `categories` with `id`/`label`/`estimatedTokens`), `contextTokensUsed`, `modelConfig.modelName`, `fullConversationHeadersOnly`, `unifiedMode`.
- `bubbleId:<composerId>:<bubbleId>`: `type` 1 observed as user-side, `type` 2 as assistant-side; classify by transcript `role` first. `tokenCount` often `{inputTokens:0,outputTokens:0}`. `modelInfo.modelName` on user bubbles. Do not dump assistant `text`.
- `messageRequestContext:` was 0. `prompt_history.json` absent. Sparse `store.db`. `ai-code-tracking.db` out of scope except last-resort model/time if a header has no model.

Default project slugs:

- `f-Projects-Personal-agent-wars`
- `f-Projects-Personal-agent-wars-spec-agent-wars-code-workspace`

---

## Layout

```
.social/analysis/cursor_session_extract/
  README.md
  cursor_session_extract/
    __init__.py
    __main__.py
    cli.py
    config.py
    paths.py
    sqlite_access.py
    inventory.py
    session_discovery.py
    transcript_parser.py
    header_reader.py
    bubble_reader.py
    prompt_inventory.py
    token_synthesis.py
    redaction.py
    session_writer.py
    run_replace.py
    extract.py
  tests/
    test_transcript_parser.py
    test_redaction.py
    test_token_synthesis.py
    test_session_discovery.py
    test_session_writer.py
    test_run_replace.py
    test_prompt_inventory.py
    fixtures/
.social/analysis/cursor-sessions/
  inventory.json
  index.json
  sessions/<sessionId>.json
```

Run from `.social/analysis/cursor_session_extract/`:

```
python -m unittest discover -s tests
python -m cursor_session_extract
```

Default `--out` is `.social/analysis/cursor-sessions` (parent of the project root).

---

## Frozen JSON schema (version 1)

Each `sessions/<sessionId>.json` matches this shape. Unknown extras from Cursor may be ignored; do not invent fields.

```json
{
  "schemaVersion": "1",
  "header": {
    "sessionId": "uuid",
    "createdAt": "ISO-8601",
    "lastUpdatedAt": "ISO-8601-or-null",
    "name": "string-or-null",
    "unifiedMode": "agent|plan|debug|chat|null",
    "forceMode": "string-or-null",
    "isSubagent": false,
    "subagentTypeName": null,
    "parentSessionId": null,
    "workspaceId": "hex-or-null",
    "workspacePath": "string-or-null",
    "model": "string-or-null",
    "contextUsagePercent": null,
    "numSubComposers": 0,
    "sources": ["transcripts", "composerHeaders", "composerData", "bubbles"],
    "injectedPromptParts": [
      { "kind": "system", "name": "System prompt", "byteLength": null, "tokenLength": 1070 }
    ],
    "coverage": {
      "errors": [],
      "missingStores": [],
      "classificationNotes": []
    },
    "tokenSummary": {
      "input": null,
      "output": null,
      "cacheRead": null,
      "cacheWrite": null,
      "contextUsed": null,
      "estimatedInput": null,
      "method": "stored|context_snapshot|char_estimate|mixed|none",
      "turnCount": 0,
      "turnsWithStoredTokens": 0,
      "turnsWithEstimatedTokens": 0
    }
  },
  "turns": [],
  "subagents": []
}
```

Turn object:

- `turnIndex` (int, 0-based)
- `userPrompt` (string, full user-typed text)
- `submittedAt` (ISO-8601 or null)
- `model` (string or null)
- `unifiedMode` (string or null; stringify numeric bubble modes if the header has no string; prefer the header string on turns)
- `requestId` (string or null)
- `tokens`: `input`, `output`, `cacheRead`, `cacheWrite`, `contextUsed`, `method`
- `toolInvocations`: `{ "name", "argNames", "omitted": ["result", "content"] }`
- `injectedPromptParts`: same shape as header list

`index.json`: `generatedAt`, `sessionCount`, `outputDir`, `sessions` array of `{sessionId, name, createdAt, unifiedMode, turnCount, subagentCount, tokenMethod, hasTranscript, path}`.

`injectedPromptParts.kind` allowlist: `cursorRule`, `skill`, `system`, `toolSchema`, `mcpDescriptor`, `attachedFile`, `contextPiece`, `capability`, `other`. Extend only when a store actually contains a new kind.

Map `promptTokenBreakdown.categories[].id` as: `system_prompt` → `system`, `tools` → `toolSchema`, `rules` → `cursorRule`, `skills` → `skill`, `mcp` → `mcpDescriptor`, others → `other` with `name` = category `label`. Skip categories `conversation` and `summarized_conversation` (those are chat text, not injected inventory).

ISO-8601: Cursor epoch-ms → UTC with `Z`. Already-ISO strings pass through. Missing → `null`, never `0`.

---

## Session discovery rules

Include a parent id if **either**:

1. Directory `%USERPROFILE%\.cursor\projects\<slug>\agent-transcripts\<id>\` exists for a default slug and contains `<id>.jsonl`, or
2. JSON `value.unifiedMode` is `"agent"` **and** `workspaceIdentifier.id` (preferred) or a hex `workspaceId` column is in the allowlist.

Skip Chat composers that lack a transcript. Include plan/debug if they have a transcript. Header-only `plan`/`debug`/`chat` without a transcript: skip.

Same UUID under both slugs: **one** file; list both transcript paths in coverage.

JSONL under `subagents\` is never a top-level file. Nest it. If that UUID also exists as a parent folder, keep it nested and add a classification note.

---

## Redaction

Keep: user-typed text; tool names and argument names; `modelInfo` scalars; `requestId`; `unifiedMode`; non-zero `tokenCount`; `promptTokenBreakdown` scalars and category inventory; attached file **paths**; rule/skill names; lengths.

Drop: assistant `text`; `allThinkingBlocks`; `toolResults`; `gitDiffs`; `suggestedCodeBlocks`; assistant `richText`; checkpoint diffs/files; attached file contents; rule/skill bodies; `composer.content.*` bodies (optional: key suffix + byte length as `kind: other`).

Do not verify with an “I'll” substring. Verify by `role` / bubble type / fixtures.

---

## Token synthesis

Per turn, first match wins:

1. `stored` if any of `inputTokens`, `outputTokens`, or cache fields is a number `> 0`.
2. Otherwise leave the turn `method` as `none` for now.

Session rollup:

- If any turn is `stored` and estimates are also used → session `method` = `mixed`.
- Else if any turn is `stored` → `stored`.
- Else if `promptTokenBreakdown.totalUsedTokens` or `contextTokensUsed` is a number `> 0` → session `contextUsed` from that value, `method` = `context_snapshot`. Do **not** copy that value onto every turn.
- Else set each turn `estimatedInput = len(userPrompt)//4` (integer division), turn `method` = `char_estimate`, session `estimatedInput` = sum, `method` = `char_estimate`.
- Else `none`.

`{0,0}` is absent.

---

## Atomic overwrite

1. Create sibling `{parent}/.cursor-sessions-staging-<runId>/` (parent of `--out`). Write `inventory.json`, `index.json`, `sessions/*.json` there.
2. If `--out` exists, rename it to `{parent}/.cursor-sessions-bak-<runId>`.
3. Rename staging to `--out`.
4. Delete the bak directory.
5. On failure after the bak rename, restore bak to `--out`.

Refuse if `--out` contains unrecognized files other than a previous dump (`inventory.json`, `index.json`, `sessions/`). Abort if `--out` is the Python package or under Cursor app/user data. Before staging, leftover sibling `.cursor-sessions-staging-*` and `.cursor-sessions-bak-*` directories are deleted; a leftover that cannot be deleted is logged and the run continues. Failure to delete the bak directory after a successful swap is logged and does not fail the extract.

---

## Module contracts

Names below are locked. `extract.py` is the orchestrator (allowed addition).

- `config.ExtractConfig` — frozen dataclass: `project_slugs`, `workspace_ids`, `out_dir`, `skip_sqlite`, `sqlite_timeout_seconds`, `cursor_user_home` (optional test override), `user_profile` (optional test override).
- `paths.cursor_user_home() -> Path` — `%APPDATA%/Cursor` on Windows; `~/Library/Application Support/Cursor` on macOS; `~/.config/Cursor` on Linux. Tests inject via config.
- `paths.agent_transcript_roots(user_profile: Path, project_slugs: tuple[str, ...]) -> list[Path]`
- `paths.global_state_db(cursor_user_home: Path) -> Path`
- `sqlite_access.connect_readonly(db_path: Path, timeout_seconds: float) -> sqlite3.Connection` — URI `mode=ro`; raises `SqliteUnavailable` after retries; never copies the file.
- `sqlite_access.get_header(conn, composer_id: str) -> dict | None` — row dict including parsed `value` JSON when possible.
- `sqlite_access.get_disk_value(conn, key: str) -> str | None`
- `sqlite_access.list_headers(conn) -> list[dict]` — `composerHeaders` table only (small).
- `session_discovery.discover_session_ids(transcript_roots, conn | None, workspace_ids: frozenset[str]) -> tuple[list[SessionRef], dict[str, list[SessionRef]]]`
- `SessionRef`: `session_id`, `transcript_path | None`, `extra_transcript_paths`, `is_subagent`, `parent_session_id | None`
- `transcript_parser.parse_transcript(path: Path) -> ParsedTranscript`
- `redaction.strip_user_query_wrapper(text: str) -> str`
- `header_reader.workspace_id_from_header(value: dict, column_workspace_id: str | None) -> str | None`
- `header_reader.is_allowlisted(workspace_id: str | None, allowlist: frozenset[str]) -> bool`
- `header_reader.workspace_path_from_header(value: dict) -> str | None`
- `prompt_inventory.from_bubble(bubble: dict) -> list[PromptPart]`
- `prompt_inventory.from_token_breakdown(breakdown: dict | None) -> list[PromptPart]`
- `token_synthesis.synthesize_turn(...) -> TokenBlock`
- `token_synthesis.synthesize_session(turns, composer_data) -> TokenSummary`
- `session_writer.empty_session(session_id: str) -> dict`
- `session_writer.write_session(path: Path, payload: dict) -> None`
- `run_replace.replace_output_dir(final_dir: Path, staged_dir: Path) -> None`
- `run_replace.assert_out_dir_allowed(out_dir: Path, package_dir: Path, cursor_user_home: Path, user_profile: Path) -> None`

---

## Sections (do not put these headings in code)

Work in this order. Each section is independently verifiable with prior sections.

### 1. Inventory

**Files:** `paths.py`, `sqlite_access.py`, `inventory.py`, `config.py`

Write `inventory.json` into the staging dir (or a temp dir in tests): path existence, sizes, table names, `composerHeaders` row count, transcript parent counts per slug, allowlist ids, `copiedStateDb: false`. If SQLite fails, set `sqliteUnavailable: true` and continue.

**Verify:** file exists; `copiedStateDb` is false; no `sessions/` required yet. Unit test with a fake Cursor root (temp dirs + tiny sqlite `composerHeaders` table).

### 2. Schema writer and discovery tests

**Files:** `session_writer.py`, `session_discovery.py`, `header_reader.py`, tests listed in Layout.

Fixtures: empty session, one-turn, nested subagent, allowlisted header-only agent, story-garden header rejected, duplicate slug merged.

**Verify:** `python -m unittest discover -s tests` from the project root, no live DB.

### 3. Transcript parser

**Files:** `transcript_parser.py`, `redaction.py`, `tests/test_transcript_parser.py`, `tests/test_redaction.py`, `tests/fixtures/sample.jsonl`

Keep `role=user` text after wrapper strip; collect `tool_use` names and input keys from assistant messages; ignore assistant prose and tool results. Truncated last JSONL line → skip + error string. Empty file → zero turns.

**Verify:** fixture user text present; a fixture assistant paragraph is absent from `userPrompt`; user text containing `I'll` is preserved.

### 4. Transcript export

Walk default slugs, parse parent JSONL, nest `subagents/`, write session JSON and `index.json` into staging.

**Verify:** parent folder count equals parent files; known id `4ecac104-2954-49f7-bb0c-777b844cd75f` present when that transcript exists on disk; no second top-level file for a nested subagent UUID.

### 5. Header enrichment and header-only agents

Join `composerHeaders` by id. Fill name, mode, timestamps, workspace path. Add allowlisted `unifiedMode==agent` ids that lack JSONL (empty `turns` allowed).

**Verify:** unit tests for story-garden exclusion and allowlisted header-only include. Live smoke: known session `workspacePath` contains `agent-wars`.

### 6. Bubble metadata and prompt inventory

Keyed `composerData:<id>` and `bubbleId:<id>:<bubbleId>` from `fullConversationHeadersOnly`. Fill model, request ids, non-zero token counts, injected-part inventory (breakdown categories + per-bubble names/lengths).

**Verify:** inventory entries have `name`/`kind` and optional lengths; dumps do not contain assistant `text` fields. Never scan `cursorDiskKV`.

### 7. Token synthesis

Apply the locked order. Unit-test `stored`, `context_snapshot`, `char_estimate`, `mixed`, `none`. `{0,0}` does not become `stored`. Context snapshot is session-level. Char estimate uses user prompt length only.

### 8. CLI, replace, README

`python -m cursor_session_extract --out <dir>`. Optional `--skip-sqlite`. README documents stores, the DB size rule, redaction, overwrite, how to re-run.

**Verify:** unit test for replace (stale session file gone after second run with a reduced input set). README exists. One live run against real Cursor data writes `cursor-sessions/index.json` without copying `state.vscdb`.

---

## Essential failure cases

- Corrupt JSONL line: skip + `coverage.errors`.
- Missing `composerHeaders` row: still export transcript; `missingStores` includes `composerHeaders`.
- SQLite unavailable: after retries, behave like `--skip-sqlite`; still write transcript sessions.
- One session failing during extract: that session is written with `coverage.errors`; siblings still export. A nested subagent failure is recorded on that nested object and does not wipe the parent’s turns.
- Empty/whitespace user prompt: keep the turn, `userPrompt` `""`.
- Empty/whitespace user prompt: keep the turn, `userPrompt` `""`.
- No `fullConversationHeadersOnly`: skip bubbles; do not scan `cursorDiskKV`.
- `createdAt` missing: fall back to transcript file mtime; note in coverage.

---

## Out of scope

Cursor cloud usage API; Tab/autocomplete; checkpoint file bodies; uploading DBs; other workspaces; storing injected prompt bodies; estimating tokens from assistant text.

---

## Optional live smoke

If the known composer id exists locally:

```
python -m cursor_session_extract --out f:/Projects/Personal/agent-wars/.social/analysis/cursor-sessions
```

Confirm `sessions/4ecac104-2954-49f7-bb0c-777b844cd75f.json` has a user prompt, a model name when present, `copiedStateDb` false in `inventory.json`, and no assistant reply body in `turns[].userPrompt`.
