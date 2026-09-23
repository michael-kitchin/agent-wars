# Naming Conventions Contract (TypeScript `src` and TypeScript tooling)

*Version 1.0 — August 2026*

This document is the authoritative naming contract for Agent Wars TypeScript. It pairs with `.spec/completed/naming-conventions-execution-plan-v1.md`. When this file and an implementation disagree, fix the implementation.

---

## Scope

**In scope (high-visibility):**

- Directory names under `src/` (and TypeScript tooling directories under `scripts/`, currently `scripts/orienting-comments/` and `scripts/naming/`).
- TypeScript file names (`*.ts`, not `*.d.ts` except as listed under Frozen names).
- Exported functions, exported types, exported interfaces, exported consts, and exported classes.

**Out of scope:**

- Function-local variables, parameters, and non-exported module internals.
- Python under `scripts/terrain_pipeline/` and `scripts/naming_pipeline/` (PEP 8 snake_case / PascalCase classes).
- CommonJS `scripts/*.cjs` file names (kebab-case is the convention).
- String literal **values** (see Frozen names).
- `.spec/completed/**` and `.spec/deprecated/**` (archival).
- `static/renderer.js` (esbuild output; regenerate via `npm run build:renderer`).
- `node_modules/`, `dist/`, `release/`, `.venv/`.
- `index.ts` barrels keep that filename.
- `src/main/main.ts`, `src/main/preload.ts`, and `src/renderer/renderer.ts` keep those filenames.

---

## Frozen names (never rewrite these values)

**Governing rule: identifiers may be renamed; string literal values are frozen.**

Example: the const identifier `TOOL2_NAMES` may become `ASSESSMENT_TOOL_NAMES`, but the value `['assess_unit', 'assess_hex']` must not change.

| Kind | Examples | Why frozen |
| --- | --- | --- |
| IPC channel strings | `'game:submitOrders'`, `'openRouter:listModels'` in `src/shared/ipc/channels.ts` | Cross-process contract |
| LLM tool names | `'plan_route'`, `'check_distance'`, `'assess_unit'`, `'assess_hex'`, `'estimate_combat'`, `'memory_read'`, `'query_orders'`, `'query_production'`, `'set_build_queue'` | Prompt and model contract |
| Standing-order type strings | `'defend'`, `'march'`, `'pursue'`, `'patrol'`, `'hold_fire'` | Persisted and parsed |
| Envelope action strings | `'assign_order'`, `'cancel_order'` | Parsed JSON from the model |
| Prompt section heading text | Strings asserted in prompt-spec tests | Model-facing copy |
| SQLite tables and columns | `turn_number` and siblings | On-disk schema |
| DB row type properties that mirror SQL | `TurnStateRow = { turn_number }` | Boundary mirror |
| OpenRouter HTTP fields | `max_tokens`, `tool_calls` | Vendor API |
| Persisted JSON keys | Saved games; `data/generated/` terrain JSON | On-disk compatibility |
| Electron entry filenames | `src/main/main.ts`, `src/main/preload.ts` | `"main": "dist/main/main.js"` in `package.json` |
| Renderer bundle entry | `src/renderer/renderer.ts` | `build:renderer` esbuild entry |
| Module augmentation filename | `src/main/better-sqlite3.d.ts` | Must match the `better-sqlite3` module |

Symbol rename tooling must not rewrite string literals (`findInStrings: false`).

---

## Casing

| Kind | Convention | Examples |
| --- | --- | --- |
| Directories under `src/` | camelCase | `gameActions`, `tacticalBattle`, `openRouter` |
| TypeScript files | camelCase + `.ts` | `combatResolution.ts`, `hexCoordinates.ts` |
| Test files | `{moduleName}.test.ts` | `hexCoordinates.test.ts` |
| Exported functions | camelCase | `submitOrders`, `buildSystemPromptForTools` |
| Exported types, interfaces, classes | PascalCase | `GameStateSnapshot`, `TurnStateRow` |
| Exported consts (module-level) | camelCase, or UPPER_SNAKE when they are frozen tables / name lists | `IPC_GAME`, `PATHFINDING_TOOL_NAMES` |
| `scripts/*.cjs` | kebab-case (out of product rename scope) | `check-circular-deps.cjs` |
| Python | snake_case / PascalCase classes (out of product rename scope) | `metadata_pipeline.py` |

The all-lowercase brand directory `openrouter` is invalid; the correct name is `openRouter`.

---

## Role-suffix allowlist (filenames and exported types)

Each suffix has one meaning. Do not introduce new suffixes.

| Suffix | Meaning |
| --- | --- |
| `Handler` | IPC or UI event orchestration that binds an action to engine calls |
| `Helpers` | Reusable helpers that do not own a domain concept |
| `Guards` | Validation, narrowing, or gating that rejects invalid input |
| `Adapter` | Translation at a process or layer boundary |
| `Pipeline` | A sequenced multi-step flow with a defined start and end |
| `Core` | Coordinating module of a multi-file feature whose siblings are named after sub-responsibilities; not a miscellaneous dump |
| `Types` | Type-only modules (`ordersTypes.ts`) |

**Banned:** `Utils` (use `Helpers`), `Impl` (name the operation), `Manager`, `Service`, `Processor`, `Controller`.

When dropping `Impl` from a function, if `foo` already exists as a public wrapper, rename the inner function to a distinct verb (`readFoo`, `executeFoo`, `resolveFoo`), never to `foo`.

---

## Approved abbreviations

`res1`, `res4`, `h3`, `db`, `ipc`, `ui`, `ai`, `llm`. Do not invent `cfg` or `ctx` as exported names (`context` is acceptable). Domain words `tactical` and `strategic` stay when they disambiguate.

---

## Length and concision rubric (judgement)

- Prefer the shorter name when both names convey the same meaning.
- Do not strip a word that distinguishes tactical from strategic, or res1 from res4.
- File names: typically 2–4 camelCase words. Exported functions: typically 2–5.
- A name is wrong if a new developer searching for the concept would not find it.

---

## Boundary-mirror exemption

Properties of types and object literals that copy an external schema (SQL, OpenRouter HTTP, persisted JSON) stay in that schema's case, usually snake_case. They are never rename-ledger entries.

---

## Milestone numbers in identifiers

File names and exported identifiers must not encode milestone or tool-group numbers (`tool1Pathfinding`, `TOOL2_NAMES`, `tacticalTool1Pathfinding`). Name them after the responsibility (`pathfinding`, `ASSESSMENT_TOOL_NAMES`). LLM-facing **string values** stay frozen.

---

## Unacceptable names

Placeholder names (`foo`, `temp`, `data2`), tautologies (`helperUtils`), and duplicate siblings that mean the same thing. If two exports do the same work, keep one name for the shared helper; do not rename both to different verbose forms.

---

## Reviewer checklist

- [ ] Casing matches the table for the symbol kind.
- [ ] Any role suffix is on the allowlist and matches the meaning.
- [ ] No banned suffix.
- [ ] Not a frozen string value being “fixed”.
- [ ] Concise without losing a disambiguating word.
- [ ] Colocated `*.test.ts` uses the same module name.
- [ ] No milestone/tool-group number in the identifier.

---

## Worked examples (checklist applied to current names)

| Name | Result |
| --- | --- |
| `src/main/openrouter/` | Fail: brand casing; use `openRouter` |
| `src/main/game-actions/` | Fail: kebab directory; use `gameActions` |
| `src/main/tacticalBattle/` | Pass |
| `hex-coordinates.ts` | Fail: kebab file; use `hexCoordinates.ts` |
| `coordinateContext.ts` | Pass |
| `mapUtils.ts` | Fail: banned `Utils`; use `mapHelpers.ts` |
| `ipcPayloadGuards.ts` | Pass: `Guards` |
| `getSealiftStackStateImpl` | Fail: banned `Impl` |
| `TOOL2_NAMES` | Fail: milestone number in an identifier |
| `'assess_unit'` | Pass: frozen **value**, not an identifier to rename |
| `TurnStateRow.turn_number` | Pass: boundary mirror |
| `gameDb.ts` | Pass: camelCase file |
| `loggedIpcHandler.ts` | Pass: `Handler` |
| `humanMarchPreviewImpl.ts` | Fail: banned `Impl` |
| `src/renderer/openRouter/` | Pass: brand camelCase |
