# Naming rename ledger

*Version 1.0 — August 2026*

Machine-readable source of truth: [`scripts/naming/renameLedger.json`](../../scripts/naming/renameLedger.json). 73 scan violations: 68 pending applies, 5 waivers. No judgement-only extra entries; remaining exports already match the concision rubric.

Apply **directories first**, then briefing/map files, then Utils/Impl files, then non-tool symbols, then `src/main/tools/` (files and symbols). The engine rewrites `currentPath` prefixes after applied directory entries.

## Waivers

| Id | Name | Reason |
| --- | --- | --- |
| `sym-getHexController-controlInfrastructure` | `getHexController` | Hex owner, not MVC |
| `sym-setHexController-controlInfrastructure` | `setHexController` | Hex owner, not MVC |
| `sym-getHexController-gameDb` | `getHexController` | Re-export of waived helper |
| `sym-setHexController-gameDb` | `setHexController` | Re-export of waived helper |
| `sym-formatProductionLabelForAnyController` | `formatProductionLabelForAnyController` | Hex owner in overlay copy |

## Batch A — directories (one gate each)

| Id | From | To |
| --- | --- | --- |
| `dir-game-actions` | `src/main/game-actions` | `src/main/gameActions` |
| `dir-game-db` | `src/main/game-db` | `src/main/gameDb` |
| `dir-openrouter` | `src/main/openrouter` | `src/main/openRouter` (two-step `git mv`) |

## Batch B — kebab files under `briefing/map`

`file-briefing-map-section` (+ test), `file-briefing-tables`, `file-hex-bounding-box` (lowest blast radius; preferred dry-run), `file-hex-code-translator` (+ test), `file-hex-coordinates` (+ test), `file-hex-grid-projection`, `file-hex-map-renderer`.

## Batch C — `Utils` / `Impl` files

`file-map-utils`, `file-prompt-table-utils`, `file-march-path-utils` (+ test), `file-human-march-preview-impl` → `humanMarchPreviewResolve.ts`.

## Batch D — non-tool symbols

`Impl` functions use a distinct verb so they do not collide with public wrappers (`readSealiftStackState`, `executeSubmitOrders`, …). UI `*Controller` types become `*Handler`.

## Batch E — tools de-numbering

Files `toolN*` / `tacticalTool1*` and identifiers `TOOLN_NAMES` / `executeToolN`. `tool6Production.ts` → `productionTools.ts`. **String values such as `'assess_unit'` stay frozen.**
