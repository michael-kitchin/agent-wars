# Milestone 1.1 — Transition from 0.7 Prototype to Production Baseline

*Execution plan for a coding agent. Aligns with [.spec/devleopment-plan-v3.md](devleopment-plan-v3.md) milestone **1.1 — Clean Architecture**.*

---

## 1. Double-check of prior gap analysis (verified March 2026)

| Claim | Verified? | Evidence / correction |
|--------|-----------|------------------------|
| SQLite DB is deleted on every app start | **No (resolved)** | `gameDb.initDatabase()` opens the canonical file under `userData` when present and creates a fresh baseline only when missing or unrecoverable. No launch-time wipe. |
| Hybrid “writes only via response JSON” is not fully implemented | **No (resolved)** | `openRouter.ts` now hard-cuts to v3 final JSON (`orders[]`, `callbacks`, `memoryUpdates`) and keeps Memory tool exposure read-only (`memory_read` only). Memory writes/deletes are host-applied from `memoryUpdates`; legacy top-level `movementOrders` / `rangedAttacks` are rejected when non-empty. |
| Core 1.1 capabilities exist (IPC, pre-compute, callbacks, WEGO) | **Yes** | Implemented across `gameIpcHandlers.ts`, `precomputation.ts`, `briefingFormatter.ts`, `callback*`, `afterResolution.ts`, `gameActions.ts`. |
| No single explicit “turn lifecycle” module | **Yes** | Phase and flow are enforced via scattered checks (`phase === 'planning'`, `handleGameReady`, `afterResolution`, etc.); there is no one named coordinator. |
| **New finding:** `resetGameForNewMatch` omits AI tables | **No (resolved)** | New Game now clears `standing_orders`, `ai_memory`, callback/pending-order tables, and consultation/combat markers so prior-match AI state does not leak into the next match. |

---

## 2. Goal and non-goals

### 2.1 Goal (milestone 1.1)

Deliver a **maintainable production baseline** that still runs the **same small-map game** as milestone 0.7 (behavioral parity), with:

- Durable SQLite via **`better-sqlite3`** (native): single file under Electron **`userData`**, exclusive app control, no implicit wipe on launch; **pragmas** per **Section 4 item 7**; native packaging aligned with **`paratext/data-manager`** when available (**Section 4 item 8**); **TypeORM** optional per **Section 4 item 9**.
- Clear, documented hybrid turn pipeline (thin coordinator, not a framework).
- Stricter alignment with v3 hybrid I/O: **read tools only** during LLM reasoning; **standing orders, memory writes/deletes, and movement/ranged declarations** expressed through **parsed final JSON** (single write path), matching the appendix in devleopment-plan-v3. **No H3 index strings** anywhere in the model’s inputs (**Section 3.3**); **targets** follow **Section 3.2** (unit id vs `[lat, lng]`).
- IPC contracts that are **typed and stable** for future renderer work.
- Existing **build, lint, test, CI** kept green; extend tests only where they protect contracts (per project testing norms).

### 2.2 Non-goals (defer to 1.2+)

- Global Earth map, PostGIS pipeline, fog of war, economy, new terrain enums.
- **Game ETL** (export/import pipelines, user-managed save files, multiple DB locations).
- **Full schema migration framework** (linear `user_version` upgrade chains, ALTER-table evolution). Deferred until ETL / save-game work; see Phase C for what *is* in scope for 1.1.
- Save/load **UI** and turn replay (Phase 2 plan); 1.1 only needs durable **single** DB file under the app’s control.
- **Store distribution, notarization, and hardened-runtime packaging** beyond ordinary **developer / side-load** installs (no App Store, no extra macOS notarization work in 1.1).

### 2.3 Success criteria (binary)

1. **Parity:** Manual smoke: small map, human + AI, both **every-turn** and **event-driven** modes behave like 0.7 (orders resolve, callbacks fire, pending orders after resolution).
2. **Persistence:** Quit app mid-match → relaunch → **same match state** (hexes, units, phase, turn, standing orders, memory, callbacks) until user chooses New Game.
3. **New Game:** After New Game, no stale `standing_orders` or `ai_memory` from the previous match.
4. **CI:** `npm run lint`, `npm run test`, and `.github/workflows/build.yml` succeed (including **native** `better-sqlite3` builds per OS matrix, following **`paratext`** patterns from **Section 4 item 8** when integrated).
5. **SQLite pragmas:** Every open of the game DB applies **Section 4 item 7** (`journal_mode = MEMORY`, `foreign_keys`, `defer_foreign_keys`, `synchronous = OFF`).
6. **Write path (hard cut):** LLM-facing tool list excludes write tools (`assign_order`, `cancel_order`, `memory_write`, `memory_delete`). **Final JSON only:** `strategy`, `callbacks`, `memoryUpdates`, and v3 **`orders[]`** (`assign_order`, `cancel_order`, `explicit_move`, `ranged_attack`, etc.). **No** top-level `movementOrders` / `rangedAttacks` in the contract, prompts, or repair schema—one shape for troubleshooting and prompt engineering.
7. **No H3 in the model context; targets per 3.2:** Every prompt and tool payload the model receives is free of H3 index strings; geographic places use **`[lat, lng]`** at established resolution (**Section 3.3**). **Follow** = unit id only; **move to place** = `[lat, lng]` only; **ranged** = unit id **or** `[lat, lng]` (**Section 3.2**).
8. **DB recovery:** Corrupt / incompatible file: **one** initial error dialog; **one** rename attempt; if rename fails, **log** and **one** delete attempt on the canonical file, then proceed with new DB if delete succeeds; if delete fails, **second** dialog + **exit**—per Section 4 item 5 and Phase C.

### 2.4 Completeness vs `devleopment-plan-v3` milestone 1.1

| v3 1.1 deliverable | Covered in this plan |
|--------------------|----------------------|
| Game state in SQLite | Phases B, C |
| Main / renderer IPC protocol | Phase E (typing); existing channels unchanged unless F forces payload docs |
| Turn lifecycle + hybrid cycle | Phase D (document + thin coordinator) |
| Pre-computation, callbacks, briefing, OpenRouter read tools | **Parity** after **Phase F**: write path hard cut **and** **Sections 3.2–3.3**—no H3; correct target shapes in `orders[]` and tools |
| Rendering pipeline | **Out of scope** for transition unless parity breaks—no structural rewrite required |
| Build, lint, CI | Phases B (native), G |
| Same small-map game as 0.7 | Success criteria (2.3) + Section 7 checklist |

---

## 3. Preconditions for the implementing agent

- Read **milestone 1.1** and the **Hybrid AI** / **Appendix: Tool Service Evolution** sections in `devleopment-plan-v3.md`.
- Read **0.7** notes: [.spec/milestone-0.7-execution-plan.md](milestone-0.7-execution-plan.md) (especially persistence and mode toggle behavior).
- Follow existing project conventions: focused diffs, **orienting comments on all new/updated public, non-overriding methods** (contract + usage + results/exceptions), **debug** on public mutating entry points, **trace** on non-mutating getters, **error** on caught exceptions, per team rules.
- Tests: **happy path + essential failures** for new/changed contracts only; no new tests for IPC stubs that only delegate.

### 3.1 Normative LLM JSON (hard cut) — align with v3

The **authoritative** shape for `orders[]` / `memoryUpdates` / `callbacks` is **`devleopment-plan-v3.md` — section “LLM Output Format (revised)”** (lines ~94–112 in the current file): each order entry uses **`action`** (`assign_order`, `cancel_order`, `explicit_move`, `ranged_attack`), **`unitId`**, and type-specific fields such as **`order`** (for assign), **`destination`**, **`targetHex`**. Map v3 field names to the **targeting rules in Section 3.2** (e.g. `targetHex` in JSON may carry **unit id or `[lat, lng]`** per 3.2—not a raw H3 string).

### 3.2 Targets: unit names vs `[lat, lng]` (locked)

Use **opaque unit identifiers** (e.g. `opponent-armor-1`) wherever a **unit** is meant—never H3. Use **`[lat, lng]`** wherever a **free geographic point** is meant.

| Intent | Model may supply |
|--------|-------------------|
| **Follow / pursue another unit** (standing order or equivalent: “follow this unit”) | **Unit identifier only** for the follow target—**not** `[lat, lng]`. |
| **Move to a location** (`explicit_move`, march/defend/hold at a **place**, etc.) | **`[lat, lng]` only** for that geographic target; engine resolves to H3. |
| **Ranged attack** (fire on a hex / area) | **Either** a **unit identifier** (attack the hex that unit occupies) **or** **`[lat, lng]`** (attack the resolved hex). **No H3.** |

**Prompts, repair JSON, and tool schemas** must spell these rules so models are not tempted to pass coordinates for “follow unit” or H3 for any case.

### 3.3 No H3 to the model — locations as `[lat, lng]` only (locked)

**Rule:** The LLM must **never** see **H3 index strings** (or other raw spatial IDs) in **any** content built for the model: **system prompt**, **user messages**, **briefing / pre-computation text**, **tool definitions’ descriptions and examples**, and **serialized tool results** returned into the chat. **Locations** are always conveyed as **`[lat, lng]`** at the **game’s established resolution** (use the same geometric convention the engine already uses when mapping cells to coordinates—e.g. representative cell center—document the chosen rule in one place and reuse it).

**Inbound from the model:** Final JSON, repair JSON, and **tool arguments** follow **Section 3.2**: geographic **places** use **`[lat, lng]`** only; **follow targets** use **unit id** only; **ranged targets** use **unit id or `[lat, lng]`**. The engine resolves lat/lng to H3 internally. **Never** accept raw H3 from the model.

**Outbound to the model:** Any path that today embeds `h3_index` or similar in text or JSON sent to OpenRouter must be refactored to emit **`[lat, lng]`** (and human-readable labels where helpful). **Unit identifiers** (e.g. `opponent-armor-1`) remain acceptable—they are not H3 cells.

**Future waypoints:** When multi-point routes are added later, intermediate points use **symbolic names** defined in the prompt or briefing, not raw H3 (out of scope until that feature exists).

**Verification aid:** Add or use a **single** conversion/helper module (or thin façade) so audits are practical: **grep** the codebase for H3-like patterns in strings appended to LLM messages, or add a dev-only assertion on assembled prompt payloads in tests.

---

## 4. Locked decisions (product owner — March 2026)

1. **Final JSON (hard cut):** **Single** response shape—v3 **`orders[]`** plus `memoryUpdates`, `callbacks`, `strategy`. **No** dual support for legacy top-level `movementOrders` / `rangedAttacks`. Restoring compatibility later is optional if models struggle; it is intentionally out of scope for 1.1.
2. **SQLite engine:** **`better-sqlite3`** (native). Owner has prior experience with multi-platform builds and can supply support or sample code if CI or `electron-rebuild` misbehaves.
3. **Persistence scope:** **One** database file under the software’s **exclusive** control (Electron `userData` or equivalent single path). **No** user-selectable save path in 1.1. **Game ETL** and a full **schema upgrade** story are explicitly **later**; 1.1 only needs a stable baseline file and a **`user_version` hook** for future work (see Phase C).
4. **Developer ergonomics (unchanged):** Optional `npm run dev` with watch—not required for 1.1 exit.
5. **Corrupt or incompatible database file:** On open/validation failure (wrong `user_version`, unreadable SQLite, schema mismatch, etc.):
   1. **Single initial dialog (on error):** **`dialog.showErrorBox`** (or equivalent) stating the database file is **invalid or incompatible**, that the app will **try to rename** the existing file (one attempt, timestamped backup name) and **create a new empty** database, and that the user will use **New game** afterward. This is the **only** dialog before recovery actions (no extra pre-flight dialogs).
   2. **Rename (single attempt):** After closing the DB handle, try **once** to move the **canonical database file** to **`<originalBasename>.corrupt.<ISO-8601-timestamp>.sqlite`** in the same directory. With **`journal_mode = MEMORY`** (Section 4 item 7), **`-wal` / `-shm`** files are **usually absent**; if **legacy** WAL sidecars exist from an older build or manual tests, rename them in the **same attempt** using the **same timestamp stem** so the backup set stays consistent. **No** second rename strategy. If any part of the rename set fails, treat as **rename failed** and go to step 4.
   3. **If rename succeeds:** **debug-level log** (brief recovery summary—successful path is not an error); **create** a fresh DB at the canonical path (full DDL + `user_version = 1`); continue startup.
   4. **If rename fails:** **error-level log** with the **full failure reason**. Then **attempt once** to **delete** the broken database file at the **canonical path** and any **`-wal` / `-shm`** siblings **if present** (legacy or non-MEMORY journals). If **delete succeeds**, **debug-level log** that rename failed but the path was cleared; **create** fresh DB at canonical path; continue startup.
   5. **If delete also fails:** **error-level log** with the **delete** failure reason. Show a **second** **`dialog.showErrorBox`**: automatic recovery **could not** rename or remove the database file; the user **must remove or move that file manually** (and any **`-wal` / `-shm`** siblings if present) before the **game** can be played; then **exit** the application (or fail `initDatabase` and never show the main window—**no** half-initialized session).
6. **No H3 to the LLM; targets and coordinates:** See **Sections 3.2–3.3**. Briefings, pre-computation, tool results, prompts, and model-authored JSON: no H3 (**Section 3.3**); **Section 3.2** defines unit id vs `[lat, lng]` per intent. **Future waypoints** will use **symbolic names**, not H3, when that feature is added.
7. **SQLite pragmas (speed over crash durability):** After opening the game database with `better-sqlite3`, apply these **in code** (order documented next to the calls):
   - `db.pragma('journal_mode = MEMORY');`
   - `db.pragma('foreign_keys = ON');`
   - `db.pragma('defer_foreign_keys = ON');`
   - `db.pragma('synchronous = OFF');`  
   **Orienting comment:** This profile favors **performance** over **security against power-loss / OS crash**; acceptable for the owner’s 1.1 baseline. Revisit if you later need stronger durability guarantees.
8. **Cross-platform native module reference:** Use the workspace **`paratext`** sample (product owner): inspect **`paratext/data-manager/package.json`** and **`paratext/data-manager/bin/`** for how native modules (including `better-sqlite3`) are prepared for **per-platform** builds. Mirror that pattern in **agent-wars** `package.json` / CI when **`paratext`** is present in the workspace (path may vary if the folder is a sibling—confirm before copying scripts).
9. **TypeORM (optional):** The paratext example uses **TypeORM** as an ORM layer. **Encouraged** to adopt TypeORM for the game DB if it **materially** streamlines implementation and ongoing maintenance with coding agents; **not required** if raw `better-sqlite3` + SQL stays simpler for this schema size. **Decide early in Phase B** after skimming the current `gameDb` surface area.
10. **Distribution (1.1):** **Developer / side-load only.** No App Store (or similar) distribution and **no** extra **macOS notarization** or hardened-runtime packaging work in this milestone; ordinary local/CI builds and artifact hand-off are sufficient.

---

## 5. Phases (ordered for reliability)

Each phase lists **work**, **verification**, and **dependencies**. Complete phases in order unless explicitly marked optional.

### Phase A — Baseline capture and regression checklist

**Work**

1. Record current **0.7** behaviors to preserve: event-driven toggle, pre-computation toggle, tool groups, Ready flow, after-resolution consultation timeout behavior (optional: 2–4 sentences in a code comment near `handleGameReady` or in this doc’s revision history—**no** new markdown file).
2. **Checklist:** Use **Section 7** below as the canonical manual regression list. Before any implementation, ensure Section 7 items reference the right UI/IPC (update Section 7 if channel names or toggles drift during the work).

**Verification**

- Section 7 is present and accurate for the pre-change codebase.
- `npm run test` green before any code changes (baseline).

**Dependencies:** None.

---

### Phase B — Replace `sql.js` with `better-sqlite3` + durable lifecycle + correct New Game reset

**Work**

1. **Dependencies and native build**
   - Add **`better-sqlite3`**; remove **`sql.js`** and custom `sqljs.d.ts` once unused.
   - **Reference:** **Section 4 item 8** — align install/rebuild/packaging with **`paratext/data-manager`** (`package.json`, **`bin/`**) when that tree is available.
   - **Two ABIs:** `npm run test` executes compiled main code under **Node**; the packaged app uses **Electron’s Node**. The native addon must load in **both** contexts. Add **`postinstall`** (or documented CI step) per the paratext pattern where applicable. **Verify** locally: `npm test` **and** `npm start` after a clean install. **Escalation:** product owner can provide multi-platform build support or sample code if the agent hits environment-specific failures.
   - **CI:** confirm Windows, Linux, macOS matrix still build **and** test job loads `better-sqlite3` without `MODULE_NOT_FOUND` / version skew errors.
   - **TypeORM:** **Section 4 item 9** — if adopting TypeORM, add dependencies and wire **DataSource** to the same file path + pragmas; if not, keep typed helpers over raw SQL.
2. **Single DB file (exclusive app control)**
   - Keep **one** path under **`app.getPath('userData')`** (or the project’s existing equivalent). No user-facing path picker in 1.1.
   - **Breaking change (acceptable):** Prior **`sql.js`** database files are **not** migrated. Use a **new filename** (e.g. include a `baseline` or `v2` suffix) so old prototype files are ignored; document in a short code comment.
3. **`initDatabase()` behavior**
   - **Do not** delete the file on startup.
   - If file **exists**: open with better-sqlite3, apply **Section 4 item 7 pragmas**, then Phase C hook (`user_version`).
   - If file **missing**: create parent dirs if needed, open DB, apply **Section 4 item 7 pragmas**, run **initial DDL** (same tables as today), apply Phase C initial version, persist.
4. **API refactor:** Replace sql.js `run` / `export` / `writeFileSync` with better-sqlite3’s synchronous API (`prepare`, `run`, `get`, `all`; use **transactions** for multi-statement batches), **or** TypeORM repositories if adopted (**Section 4 item 9**). Remove or shrink **`saveDatabase()`**—with on-disk file + default persistence, explicit save is only needed if you introduce explicit flush semantics later.
5. **`resetGameForNewMatch`:** `DELETE FROM standing_orders` and `DELETE FROM ai_memory` (all rows). Audit other per-match tables; align with 0.7 semantics.
6. **Tests:** Prefer **`openDatabaseAtPath`** (or `:memory:`) testable without Electron; inject path from tests.
7. **First launch vs resume (UX):** Today, after schema init, **hexes/units may be empty** until the user runs **New game** (`resetGameForNewMatch`). **Preserve** that behavior for a brand-new DB file. **Do not** auto-wipe a good file on startup. After persistence, **relaunch** must restore an in-progress match without requiring New game.

**Verification**

- **Automated:** (1) Two opens on same temp path without delete → state survives; (2) `resetGameForNewMatch` → `standing_orders` and `ai_memory` empty; (3) all updated DB tests green.
- **Manual:** Play → quit → relaunch → restore; New Game → no ghost AI state.
- **CI:** Full OS matrix passes with native module.

**Dependencies:** Phase A.

**Implementation note:** Do **not** treat Phase B as “done” if `initDatabase` opens files without **Phase C** validation and recovery. **Ship B and C in the same integration** (or single PR) so no release exists that persists data but mishandles bad `user_version` or corrupt files.

---

### Phase C — `user_version` hook only (full migrations deferred)

**Work**

1. After initial DDL on a **new** file, set **`PRAGMA user_version = 1`**.
2. **Healthy open path:** If the file exists and opens: validate **`user_version`** (must be **1** for this baseline). Optionally verify required tables exist. If validation passes, continue—**no** multi-step upgrade runner in this milestone.
3. **Recovery path (Section 4 item 5):** If open fails, `user_version` is not **1**, or required schema is missing/corrupt: follow **Section 4 item 5** exactly—initial dialog → one rename → on rename failure, **error** log + one delete pass on canonical file **and any `-wal` / `-shm` peers if present** → fresh DB if path clear → if delete fails, second dialog + **exit**. **Implementation:** close any open **`Database`** handle on the canonical file **before** rename/delete (especially on Windows) so FS operations are not blocked. Do not leave the app running against a half-open DB.
4. **Comment in code:** **Schema migration chains** and **game ETL** are deferred; `user_version` reserves a hook for a future milestone.

**Verification**

- Test: fresh file ends with `user_version === 1`; reopen is no-op.
- Test: temp DB with wrong `user_version` (or truncated file) triggers recovery: **canonical path** holds a **new** valid DB at `user_version === 1`; **renamed backup** exists with expected naming; no crash loop.
- Test (optional / mocked FS): **rename fails, delete succeeds** → **error** logs for rename; canonical path ends with new DB; original file gone from canonical path.
- Test (optional / mocked FS): **rename fails, delete fails** → **error** logs for both; init fails / exit path; original still at canonical path (or mock reflects immutability).
- Lint + full test suite.

**Dependencies:** Phase B.

---

### Phase D — Explicit hybrid turn pipeline (thin coordinator)

**Work**

1. Introduce a small module (e.g. `hybridTurnPipeline.ts` or `turnLifecycle.ts`) that **documents** the v3 sequence in one place:
   - Resolve previous turn / apply human + AI orders (already `ready` / `gameActions`).
   - Run pre-computation for next briefing (or document where it runs—today inside `requestOrders`; if it stays there, the module still lists the **logical** order for readers).
   - Evaluate callbacks / mandatory overrides (`afterResolution` path).
   - Optional LLM consultation when triggered.
   - Transition to planning phase for human.
2. The module should **delegate** to existing functions; avoid moving large bodies of logic in 1.1 unless necessary for clarity.
3. Add **orienting comments** at module top and on any exported function.

**Verification**

- No behavior change: full `npm run test`.
- Optional: one **trace-level** or **debug** log line at pipeline boundaries (already follow logging rules elsewhere).

**Dependencies:** Phase C (or parallel if only documentation—prefer after C so migrations are stable).

---

### Phase E — Shared IPC / game snapshot types

**Work**

1. Add `src/shared/` (or equivalent) with TypeScript types for:
   - `GameStateSnapshot` (or a re-export pattern from a single source of truth).
   - IPC payload/result shapes that the renderer depends on (`SubmitOrders`, `Ready` payload/result minimal fields).
2. Configure `tsconfig` so **main** and **renderer** both compile against shared types without pulling Node APIs into renderer.
3. Update `preload.ts` / `renderer` to use shared types where practical (type-only imports).

**Verification**

- `npm run build` (main + renderer) succeeds.
- No new runtime dependency from renderer to Node.

**Dependencies:** Phase D optional; can run parallel to D if careful.

---

### Phase F — Unify LLM write path (response JSON only, **hard cut**)

**Work**

1. **Specification (single shape):** Final assistant JSON **only** (no legacy top-level move/ranged keys):
   - `strategy`, `callbacks`, `memoryUpdates` (as today, adjusted if needed).
   - **`orders[]`:** v3 entries: `assign_order`, `cancel_order`, `explicit_move`, `ranged_attack` (and any other v3 order types you already rely on). **Target fields** must enforce **Section 3.2** (follow = unit id only; move-to-place = `[lat, lng]` only; ranged = unit id **or** `[lat, lng]`). Map each to the **same** DB mutations and validation as current `executeTool5` / `gameActions` paths. **Internally**, after applying `orders[]` and merging with standing-order automation, you may still produce `{ movementOrders, rangedAttacks }` **in memory** for `ready()`—that is an implementation detail, not part of the LLM contract.
2. **Parser and repair prompt:** `parseOrdersResponse` (and the JSON-repair branch) must accept **only** the hard-cut schema—**remove** parsing and examples for top-level `movementOrders` / `rangedAttacks` from the model-facing contract.
3. **Implementation strategy:**
   - Extract **internal** helpers: `applyAssignOrderFromJson`, `applyCancelOrderFromJson`, `applyExplicitMoveFromJson`, `applyRangedAttackFromJson`, etc., reusing tool5/tool4 logic where safe.
   - Preserve **standing-order merge** behavior after `orders[]` are applied (same semantics as current turn).
4. **Remove write tools from the model:** Unregister `assign_order`, `cancel_order`, `memory_write`, `memory_delete` from the OpenRouter tool list. Keep **read/query** tools per v3 appendix.
5. **Prompts:** Single documented JSON shape end-to-end (system prompt, user nudge, repair message). Simplifies troubleshooting and prompt iteration—**no** dual code paths.
6. **No H3 in the model surface (Section 3.3); args match Section 3.2:** Audit and refactor **every** code path that builds content sent to OpenRouter:
   - **`briefingFormatter.ts`** (and any briefing fragments from **`precomputation.ts`**).
   - **Tool definitions** in **`openRouter.ts`** (descriptions, parameter schemas, examples): geographic **places** → **`[lat, lng]`**; **follow targets** → **unit id**; **ranged targets** → **unit id or `[lat, lng]`**—resolve to H3 only inside implementations.
   - **Serialized tool results** returned to the chat (all tool modules): replace hex indexes in JSON/text with **`[lat, lng]`** (and labels if useful). **Unit IDs** stay as opaque strings.
   - **System / user messages** elsewhere (e.g. adjacent-cell lists, debug echoes)—must not leak `h3_index` patterns.
   Prefer a **small shared helper** (cell → `[lat, lng]` at established resolution) and optionally a **single façade** that formats tool results for the LLM to avoid drift.
7. **Logging:** Debug per order application; error on invalid entries; trace on getters per project rules.

**Verification**

- **Matrix / integration tests:** Synthetic JSON uses **`orders[]` only**; assert DB + in-memory merged orders for resolution.
- **Target-shape cases (Section 3.2):** follow/pursue → **unit id only** (reject coordinate pair as follow target); move-to-place / `explicit_move` / geographic march → **`[lat, lng]` only** (reject H3; reject using enemy unit id where the contract expects a place, if you separate those fields—document the JSON shape); ranged → **unit id or `[lat, lng]`**; **no H3** in any case.
- **Failure cases:** malformed `orders` entry, invalid `unitId`, duplicate conflicting entries.
- **H3 leak check:** Automated test or script over **assembled** prompt + tool payloads (fixtures): ensure no cell IDs reach the model. **Do not** rely on a naive hex-length RegExp—H3 indexes are **not** “15 hex chars.” Prefer **(a)** scanning serialized JSON for forbidden keys (`h3_index`, `h3Index`, `targetH3`, etc.), **(b)** passing candidate substrings through **`h3-js` `isValidCell`** (or equivalent) after tokenizing text, and/or **(c)** asserting golden request fixtures. Tune to avoid false positives on **unit IDs** and normal prose.
- **Manual:** Real model smoke; confirm request payload has **no** write tools; spot-check logged request bodies for hex IDs.
- **UI:** Invocation counts / labels remain sensible (no write-tool rows).

**Dependencies:** Phase B green **required**. **Recommend completing Phase E before Phase F** so IPC-related types and any `orders` DTOs do not drift during the hard cut; if F must start early, add a temporary internal type module merged into E later.

---

### Phase G — Release hygiene and documentation touch-up

**Work**

1. **`package.json`:** `version` **1.1.0**; description reflects milestone **1.1** production baseline (not 0.5/0.7 prototype strings).
2. **CI:** Artifact upload name uses **1.1.0** (e.g. `agent-wars-1.1.0-${{ runner.os }}` in `.github/workflows/build.yml`); no `m0.5` labels.
3. Add a **short** “Production baseline (1.1)” note in an **existing** developer-facing doc if one exists; **do not** create new markdown files unless the repo already uses README for this—user preference is to avoid unsolicited markdown; if nothing exists, skip or add one paragraph to README only if the author already maintains README for setup.

**Verification**

- `npm run lint`, `npm run test`, and CI workflow green.
- Grep for stale `0.5` / `m0.5` labels in CI and package metadata; confirm **1.1.0** in `package.json` and lockfile root `version` if present.

**Dependencies:** Phase F complete.

---

## 6. Risk register and mitigations

| Risk | Mitigation |
|------|------------|
| Persistence exposes New Game bugs | Phase B audit + tests for `standing_orders` / `ai_memory`. |
| Models break without write tools | Hard-cut schema in prompt + repair message; matrix tests; golden JSON fixtures. |
| Scope creep (frameworks) | Coordinator is a **single module** and **functions**; no pub/sub library. |
| **Native module** build failures (better-sqlite3 × Electron × CI OS matrix) | Use `@electron/rebuild`; match Node/Electron versions; **escalate to product owner** with logs—owner has prior multi-platform experience. |
| Old sql.js DB on disk confuses users | **New filename** for 1.1 file; one-line comment; optional log on first create. |
| **`orders[]` shape drifts from v3** (wrong `action` / field names) | Section 3.1 normative reference; **Section 3.2** target rules; single parser module; golden JSON tests; repair prompt matches the same schema. |
| **Corrupt or wrong `user_version` DB** | Section 4 item 5 + Phase C: dialog → rename once → if fail, log + delete once → recreate if path clear; if delete fails, dialog + exit. |
| **H3 leaks into prompts despite refactor** | Section 3.3; Phase F item 6; shared formatter; grep/tests on outbound messages; code review focused on `JSON.stringify` of tool results. |
| **Power loss / crash with MEMORY journal + `synchronous = OFF`** | **Section 4 item 7** documents the tradeoff; acceptable for 1.1 baseline. Revisit if you need stronger durability before wider distribution. |

---

## 7. Suggested manual regression checklist (for Phase A completion)

Use after Phases B, F, and G at minimum. **Phase A:** validate that each line maps to a real control or IPC path in the current build; update wording if the UI changes during implementation.

- [ ] Launch app → new small game → units and map appear.
- [ ] Planning: submit human orders → Ready → resolution runs → phase returns to planning, turn increments.
- [ ] AI: every-turn mode → AI produces orders / strategy; no parse errors in log.
- [ ] AI: event-driven mode → quiet turns skip LLM at Ready; after combat or mandatory override, consultation runs; pending orders applied next Ready.
- [ ] Pre-computation group toggled → briefing still coherent; ad-hoc tool count plausible.
- [ ] Quit mid-match → relaunch → **state restored** (Phase B+).
- [ ] New Game → **no** prior standing orders affecting units (Phase B+).
- [ ] Post Phase F: inspect last request tool list → **no** assign/cancel/memory write/delete tools exposed.
- [ ] Post Phase F: model / logs show **only** `orders[]` (no top-level `movementOrders` / `rangedAttacks` in the documented contract).
- [ ] Post Phase F: **no H3 index strings** in any logged OpenRouter request (briefing + tools + user content); places as **`[lat, lng]`**; **Section 3.2** satisfied (follow = unit id; move-to-place = coords; ranged = unit id or coords).
- [ ] (Once Phase C recovery exists, spot-check) Replace DB with garbage or wrong `user_version` → **one** initial dialog (rename + new DB) → renamed backup exists → game runs after **New game**.
- [ ] (Optional) Rename fails but delete succeeds: **error** log shows rename reason; new DB at canonical path; session usable.
- [ ] (Optional) Rename and delete both fail: **second** dialog states manual removal required before the game can be played; app **exits**; **error** log has both failure reasons.

---

## 8. Product owner input — **resolved**

See **Section 4 (Locked decisions)**: hard-cut JSON, **better-sqlite3** + **pragmas** (item 7), **paratext** native-build reference (item 8), **optional TypeORM** (item 9), **developer / side-load distribution only** (item 10); single exclusive DB path; **ETL** / full migrations deferred; **DB recovery** (dialog → rename → delete-if-rename-fails → recreate; second dialog + **exit** if delete fails); **no H3** (**Section 3.3**); **targets** (**Section 3.2**); **future waypoints** = symbolic names; **release version** **1.1.0** (Phase G).

---

## 9. Future: multi-point routes (not in 1.1)

When waypoints are added, define **symbolic names** in briefing or prompt and reference those in orders—**never** raw H3 in the model contract.

---

*End of plan.*

