# TS terrain loading/classification from metadata JSON — execution plan

This document plans migration of TypeScript terrain ingestion from CSV-driven terrain kinds to metadata-JSON-driven classification.

**Audience:** coding agent/developer implementing in phases.  
**Primary objective:** reliability-first migration with parity to Python pipeline behavior and explicit acceptance gates.

---

## 1. Scope and success criteria

### 1.1 In scope

1. Load terrain source data in TS from:
   - `data/generated/terrain_res1_metadata.json`
   - `data/generated/terrain_res4_metadata.json`
   - `data/generated/terrain_rule_semantics.json` (compile-time/reference basis; not necessarily runtime-interpreted)
2. Classify terrain kinds in TS from metadata fields so results closely match Python terrain pipeline outputs.
3. Replace current CSV-dependent runtime ingestion paths in main-process code where terrain kinds are seeded/applied.
4. Preserve pathfinding/gameplay correctness (`terrain` passability + `terrainKind` rendering labels).
5. Keep implementation understandable and testable for future rules configurability work.

### 1.2 Out of scope

1. Building a runtime generic rule engine for arbitrary future rules JSON variants.
2. Changing core gameplay semantics beyond terrain-source migration.
3. Re-architecting DB schema or map rendering systems unrelated to terrain-source switch.
4. Python-side terrain generation logic changes (except parity-supporting clarifications in docs/tests if needed).

### 1.3 Definition of done

1. TS terrain ingestion no longer requires `terrain_res1_base.csv` / `terrain_res4_exceptions.csv` for normal operation.
2. TS-derived `terrainKind` output matches canonical Python classification semantics (as reflected in Python logic and rules semantics) at high parity, with only minor non-observable numeric edge differences.
3. Existing gameplay tests remain green; new parity tests and contract tests are added.
4. Public backend methods touched by this work include required logging and orienting comments.
5. Migration is documented, with explicit troubleshooting/verification steps.

---

## 2. Locked technical direction for this effort

| ID | Decision | Value |
|----|----------|-------|
| A | Source of truth for runtime migration | Metadata JSON files become canonical TS terrain input. |
| B | Rule execution model | Implement explicit TS classifier code now (no generic runtime rule interpreter). |
| C | Parity target | Match Python pipeline terrain labels (`water`, `coastal`, `plains`, `urban`, `forest`, `mountain`, `desert`, `arctic`). |
| D | Timing flexibility | Classification may happen at startup/reset or another UX-safe point; correctness and responsiveness take priority. |
| E | Reliability strategy | Add parity harness against generated artifacts and enforce acceptance thresholds before hard cutover is completed. |

---

## 3. Current-state assumptions (to validate in Phase 0)

1. Existing TS ingestion currently depends on:
   - `src/main/terrainRes1Csv.ts`
   - `src/main/terrainRes4Csv.ts` (or equivalent overrides path)
   - `src/main/gameDb.ts` seeding paths
2. Metadata JSON includes sufficient fields for reclassification:
   - water mask metrics (`all_water`, `intersects_water`, `water_edges`, `total_edges`)
   - topo and cover means
   - urban aggregate/per-rank metrics for res-4
3. Rules semantics JSON reflects current classifier thresholds and precedence labels.
4. Generated artifacts are available in packaged/dev environments where terrain seeding runs.

---

## 4. Migration architecture (high level)

1. Add TS metadata readers and schema validators for res-1/res-4/rules files.
2. Implement deterministic TS classifier functions that mirror Python logic:
   - water/coastal decision from mask relation semantics
   - interior biome precedence
   - res-4 urban override constraint (`non-water` intersection)
3. Produce:
   - res-1 `Map<h3, terrainKind>`
   - res-4 overrides `Map<h3, terrainKind>` relative to parent
4. Keep passability mapping unchanged (`pipelineTerrainToPassability`) and seed DB from classified maps.
5. Introduce parity tests comparing TS-classified results against generated CSVs as a regression guard; Python logic + semantics JSON remain canonical for rule intent.

---

## 5. Phased execution plan

Each phase is independently verifiable or verifiable with previously completed phases.

## Phase 0 — Contract freeze and codepath inventory

**Objective:** remove ambiguity before implementation.

**Tasks:**

1. Inventory all CSV-dependent terrain ingestion call sites.
2. Inventory all terrainKind consumers (DB seed, renderer overrides, prompt/game snapshot serialization).
3. Freeze exact TS classifier contract:
   - expected metadata schema versions
   - numeric comparison semantics (`>=`)
   - nodata fallback behavior
4. Define parity acceptance threshold for migration (see Phase 4).

**Verification:**

- Written checklist in PR/spec comments with file list and migration ownership.
- No unresolved contract ambiguity before coding.

**Exit criteria:**

- Clear map of all touch points and compatibility constraints.

---

## Phase 1 — Metadata file loading and validation layer

**Objective:** reliably load metadata JSON and fail fast on invalid inputs.

**Tasks:**

1. Add loader modules (likely under `src/main/terrainMetadata*.ts`) for:
   - res-1 metadata records
   - res-4 metadata records
   - rule semantics document
2. Validate essential envelope and schema fields:
   - `schema_version`, `record_count`, `records[]`, required keys per record
   - expected resolutions (`1` and `4`, or config-driven equivalents)
3. Add path-resolution logic equivalent to current CSV path strategy for dev/package modes.
4. Add logs:
   - debug for invocation and counts
   - error on parse/contract failure

**Verification:**

- Unit tests: happy path, missing file, malformed JSON, missing key, wrong schema version, wrong resolution.
- Sanity read test on current generated files.

**Exit criteria:**

- TS can load and validate metadata files deterministically.

---

## Phase 2 — TS classifier implementation from metadata

**Objective:** implement deterministic terrain classification in TS that mirrors Python logic.

**Tasks:**

1. Implement helper to derive water relation from metadata mask metrics (equivalent to Python relation semantics).
2. Implement interior biome classifier with threshold precedence:
   - arctic → forest → mountain → desert → plains
3. Implement res-4 urban override rule:
   - applies only when not fully in water and urban intersects.
4. Keep rules JSON as source-reference for generated constants/docs (not dynamic interpreter).
5. Add clear orienting comments on public/non-overriding methods and helpers with non-obvious semantics.

**Verification:**

- Unit tests for classifier decision boundaries and precedence.
- Essential failure tests for missing/null metrics and invalid threshold payloads.

**Exit criteria:**

- TS classifier produces stable terrain kinds from metadata records.

---

## Phase 3 — Runtime integration (DB seed + consumers)

**Objective:** replace CSV ingestion in runtime code without breaking gameplay.

**Tasks:**

1. Integrate metadata-classified maps into DB seed flow in `gameDb` paths.
2. Remove CSV parsing call paths used for startup/reset terrain ingestion from normal runtime execution.
3. Ensure `terrainKind` + passability derivation remains consistent for:
   - pathfinding
   - renderer terrain fill
   - prompt/game-state snapshot data consumed by LLM tools
4. Keep logs at required levels on touched public methods.

**Verification:**

- Existing main-process tests pass with metadata-backed seeding.
- Targeted integration tests for reset/new game and terrain-dependent behavior.

**Exit criteria:**

- App runtime works from metadata-derived classifications only (hard cutover, no CSV runtime fallback).

---

## Phase 4 — Parity harness and acceptance gating

**Objective:** prove TS output matches Python pipeline outputs to non-observable differences.

**Tasks:**

1. Add parity test utility:
   - classify from metadata in TS
   - compare against current generated CSV outputs (`res1 base` + `res4 exceptions`) as quantitative parity gate
2. Produce parity metrics:
   - exact match count / mismatch count
   - mismatch distribution by terrain kind and geography (sampled summary)
3. Define and enforce acceptance criteria:
   - res-1 exact-match ratio >= 99.0%
   - res-4 override exact-match ratio >= 99.0%
   - no concentrated regional drift affecting routefinding UX
4. For mismatches above threshold:
   - investigate threshold/rounding and edge relation conversion
   - document intentional tolerances if any remain

**Verification:**

- Parity report generated in CI/local test output.
- Regression tests remain green.

**Exit criteria:**

- Parity threshold met and documented.

---

## Phase 5 — Cleanup, docs, and operational hardening

**Objective:** finalize migration and reduce future maintenance risk.

**Tasks:**

1. Remove obsolete CSV-only runtime wiring in main runtime paths.
2. Update packaged release assets to require metadata JSON artifacts (and remove CSV requirements once unused by runtime):
   - update `package.json` electron-builder `build.files` entries
   - verify packaged build loads metadata assets successfully
3. Update docs:
   - root `README.md`
   - `scripts/terrain_pipeline/README.md` cross-reference to TS metadata ingestion expectations
4. Add troubleshooting notes:
   - missing metadata file handling
   - schema mismatch handling
   - regeneration command guidance
5. Add concise developer notes for future configurable-rules phase.

**Verification:**

- End-to-end smoke run: app startup/reset + pathfinding + renderer behavior.
- Documentation reflects actual runtime behavior.

**Exit criteria:**

- Metadata-driven terrain ingestion is stable, documented, and maintainable.

---

## 6. Reliability and maintainability standards for implementation

1. Keep parsing/classification logic modular:
   - file IO + schema validation
   - classification rules
   - runtime integration
2. Prefer explicit typed contracts over dynamic object access.
3. Avoid hidden behavior:
   - explicit mismatch reporting in parity tools
   - explicit canonical-rule precedence documentation (Python semantics over historical CSV drift)
4. Tests target behavior contracts, not implementation internals.
5. Logging:
   - debug for public method invocations
   - error for caught exceptions
   - trace for non-mutating getter paths as applicable

---

## 7. Risk register and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Metadata schema drift | Runtime failure or silent misclassification | Strict schema validation and version checks in loader. |
| Rule seaport mismatch | Broad terrain drift | Phase 4 parity harness + threshold gating before full cutover. |
| Performance regression on startup/reset | UX degradation | Benchmark classification timing; cache maps or precompute where needed. |
| Packaging path issues | Missing data in prod builds | Path-resolution tests for dev + packaged modes. |
| Hidden dependencies on CSV artifacts | Runtime breakage | Phase 0 inventory + Phase 3 integration tests across all consumers. |

---

## 8. Resolved owner decisions

1. **Fallback policy:** hard cutover to metadata-only ingestion (no CSV fallback in normal runtime path).
2. **Parity threshold:** `>= 99.0%` exact match is acceptable (`< 1%` variation allowed), with no broad UX-visible drift.
3. **Packaging:** metadata JSON artifacts are required packaged assets for release builds.
4. **Runtime timing:** classify at app startup once, cache in memory, and reuse cached maps for DB reset/new-game seeding.

---

*End of plan.*
