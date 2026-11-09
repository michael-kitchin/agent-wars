# Git Commit Session Join

Stdlib Python 3.11+ CLI that reads the existing `cursor-sessions/` dump and the agent-wars git history, then writes JSON under `.social/analysis/git-commit-sessions/` that attaches each user turn to the next commit after it.

This dump does **not** implement the overlapping-window / nearest-preceding-turn rule from the session-data analysis specification. Sequential join is a different attribution. Do not mix the two in JSON keys, logs, or later figures.

Never `git commit` or `git push`. Never write into Cursor application data. Dumps inside this repository belong under `.social/analysis`.

## Locked rules

**Join.** Each user turn belongs to the first commit whose **author date** is strictly after that turn’s time. Commit `C_i` receives turns with `prev.authorDate <= t < C_i.authorDate`. The first commit receives every turn with `t < C_0.authorDate`. A turn whose time equals a commit’s author date goes to the next later commit. Two commits with the same author date sort by `fullHash`; the earlier hash wins all turns in the open interval before that instant.

**Clock.** Git author date `%aI` is the join clock. Committer `%cI` is stored and not used for joining. Parse git dates and turn times with `parse_event_datetime` from `cursor_session_extract` (ISO only if the string starts with `YYYY-MM-DDT`; English three-letter month labels). Do not join in `git log` order — that order is committer-date.

**Commit set.** Every commit reachable from `HEAD` (`git log HEAD`, not `--first-parent`). Merge commits with empty combined diffs still occupy a bucket; file and line counts are zero.

**Turn time.** Parse `submittedAt`. If missing or unparseable, fall back to session `header.createdAt` and set `timeSource` to `createdAt`. Still unparseable: `timeSource` `none`, listed in `unmatchedTurns`. Nested subagent user turns are included (`sessionId` is the nested header id, `parentSessionId` from the nested header or the enclosing session walked from). Walk `subagents` recursively. Nested sessions are not sibling files. Sessions with a blank `sessionId` are skipped and recorded in coverage.

**Trailing turns.** Turns after the last commit go in `unmatched.json` `afterLastCommit`, not a fake commit.

**Tokens.** Commit `tokenTotals` sum turn `tokens` integer fields only: `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens`. Never copy `header.usage` or `tokenSummary` onto a commit. Omit `contextUsed` from totals. Turns with no integer token fields contribute 0. If no turn on that commit had any integer token field, `tokenTotals` is `null`. Totals are a floor.

**Prompt text.** Emitted turn objects must not contain `userPrompt`, prompt bodies, tool arguments or results, diffs, or injected prompt content. Store ids, times, mode, model, tool names from `toolInvocations[].name`, and the turn `tokens` object.

**Git.** Repository `f:/Projects/Personal/agent-wars` only. Invoke `git` with no shell, `cwd` the repo, large capture limit. Fail if `git` is missing, the path is not a repo, or `rev-list` fails.

**File counts.** Two `git log` calls: `--name-status --find-renames` for status letters, then `--numstat --find-renames` for insertions/deletions (this git omits numstat when both flags are combined). Status letters: `A` added, `M` updated, `D` deleted, `R*` renamed; unknown letters ignored. Binary `-\t-` contributes 0 line counts.

**Subject class** (first match, case-insensitive):

1. `prompt` if `/prompt/`
2. `buildCi` if `/build|\bci\b|workflow|electron-builder|github actions/`
3. `docs` if `/\bdocs\b|\bdoc\b|readme|documentation/`
4. `refactor` if `/refactor/`
5. `fix` if `/\bfix\b|\bbug\b/`
6. `feature` otherwise

`prompt` and `buildCi` are ported from the git-history harness. The remaining labels are required by the analysis specification.

**Tags.** `git for-each-ref refs/tags`. `isMilestone` when the name matches `^milestone-`. Peel annotated tags to the commit. Order tags by the tagged commit’s author date, then name — not tag creatordate. `previousTagName` / `previousTagDate` are the previous row in that order. Multiple tags on one commit are allowed.

**Input.** Read existing `cursor-sessions/` only. Do not re-extract from Cursor. Skip unreadable JSON; record the skip in `index.coverage` and continue.

## Layout

- Code: `f:/Projects/Personal/agent-wars/.social/analysis/git_commit_join/`
- Dump: `f:/Projects/Personal/agent-wars/.social/analysis/git-commit-sessions/`
- Sessions input: `f:/Projects/Personal/agent-wars/.social/analysis/cursor-sessions/`

## Output (`schemaVersion` `"1"`)

`index.json`, `commits.json`, `tags.json`, `unmatched.json`, `sessions.json`.

**`commits.json`** — oldest-first after authorDate/`fullHash` sort. Each object:

- `hash`, `fullHash`, `authorDate`, `committerDate`, `authorName`, `subject`, `subjectClass`
- `added`, `updated`, `renamed`, `deleted`, `insertions`, `deletions`
- `tags` — names pointing at this commit
- `turns` — `{ sessionId, parentSessionId, turnIndex, submittedAt, timeSource, unifiedMode, model, toolNames, usage }`
- `sessionIds`, `tokenTotals`, `turnCount`

**`tags.json`:** `{ name, hash, fullHash, authorDate, isMilestone, previousTagName, previousTagDate }`.

**`unmatched.json`:** `afterLastCommit`, `unmatchedTurns`, and counts.

**`sessions.json`:** one object per harvested session id (parents and nested): `sessionId`, `parentSessionId`, `turnCount`, `commitHashes` (oldest-first `fullHash` values that received at least one turn), `matchedTurnCount`, `afterLastTurnCount`, `unmatchedTurnCount`, `zeroCommits` (true iff `commitHashes` is empty).

**`index.json`:** `generatedAt`, `schemaVersion`, `commitCount`, `turnCount`, `matchedTurnCount`, `afterLastTurnCount`, `unmatchedTurnCount`, `sessionCount`, `zeroCommitSessionCount`, `repo`, `sessionsDir`, `coverage`.

## CLI

```
python -m git_commit_join
python -m git_commit_join --repo f:/Projects/Personal/agent-wars --sessions f:/Projects/Personal/agent-wars/.social/analysis/cursor-sessions --out f:/Projects/Personal/agent-wars/.social/analysis/git-commit-sessions
```

Refuse `--out` inside Cursor app data, `.cursor`, this Python package, or the `--sessions` dump. Inside the git worktree it must sit under `.social/analysis`. Refuse if `--out` exists and contains unrecognized names. Atomic replace via a sibling staging directory; if rename fails on Windows, copy the five JSON files in place.

Essential failures: `git` missing or not a repo; `--sessions` missing; `--out` refused.

## Constraints

- Python 3.11+ stdlib. PEP 8 snake_case. No `Utils` or `Impl`.
- Public functions: orienting comments; DEBUG logs on entry; ERROR on caught exceptions.
- Tests: happy paths and essential failures. Fixture git log text; the live repo is not a unit-test dependency.
- Identifiers used to name plan or spec divisions must not appear in Python, flags, logs, or JSON keys.
- Import `parse_event_datetime` from the sibling `cursor_session_extract` package via `sys.path`. Do not import that package’s dump-replace helper.
