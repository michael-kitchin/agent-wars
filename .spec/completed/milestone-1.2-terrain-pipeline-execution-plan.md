# Milestone 1.2 — EarthEnv to H3 Terrain Pipeline: Execution Plan

*Version 1.0 — March 2026*

This document is an execution plan for implementing a reliable terrain-generation pipeline that produces:

1. A **base terrain CSV** at global zoom (`H3 resolution 1`)
2. A **child exception CSV** at theatre zoom (`H3 resolution 4`) containing only cells whose terrain differs from their res-1 parent

The plan is organized for maximum reliability and clarity. Each phase is independently verifiable or verifiable with previously completed phases.

---

## Scope Summary

### In scope

- Build an offline, deterministic ETL pipeline using local EarthEnv rasters in `F:\Data`.
- Use EarthEnv consensus land cover classes plus EarthEnv topography (GMTED-derived TRI/slope/elevation).
- Classify each hex into the design terrain taxonomy from vision/planning docs:
  - `ocean`, `land`, `forest`, `mountain`, `desert`, `arctic`
- Generate two CSV outputs:
  - `terrain_res1_base.csv` (all res-1 hexes + terrain)
  - `terrain_res4_exceptions.csv` (res-4 hexes that differ from parent terrain, including parent reference)
- Add verification tooling and tests focused on essential contracts.
- Add implementation docs/comments so future developers can maintain the pipeline confidently.
- Keep the plan and implementation aligned with project logging/commenting/testing rules for backend code.

### Out of scope (for this milestone)

- Runtime ingestion of terrain into game DB/UI (this plan generates artifacts only).
- Full climate/aridity fusion model (desert remains land-cover-driven with topographic disambiguation).
- Production orchestration (cron/job scheduler/cloud ETL).
- Non-EarthEnv sources unless needed to resolve blockers.

---

## Inputs and Artifacts

### Confirmed available inputs

The following files are present in `F:\Data`:

- Land cover:
  - `consensus_full_class_1.tif` ... `consensus_full_class_12.tif`
- Topography:
  - `tri_5KMmn_GMTEDmd.tif`, `tri_5KMma_GMTEDmd.tif`
  - `tri_50KMmn_GMTEDmd.tif`, `tri_50KMma_GMTEDmd.tif`
  - `slope_5KMmn_GMTEDmd.tif`, `slope_5KMma_GMTEDmd.tif`
  - `slope_50KMmn_GMTEDmd.tif`, `slope_50KMma_GMTEDmd.tif`
  - `elevation_5KMmn_GMTEDmn.tif`, `elevation_5KMma_GMTEDma.tif`
  - `elevation_50KMmn_GMTEDmn.tif`, `elevation_50KMma_GMTEDma.tif`

### Planned generated artifacts

- `data/generated/terrain_res1_base.csv`
- `data/generated/terrain_res4_exceptions.csv`
- `data/generated/terrain_generation_metadata.json`
- Optional QA outputs:
  - `data/generated/qa/terrain_counts_res1.csv`
  - `data/generated/qa/terrain_counts_res4.csv`
  - `data/generated/qa/parent_child_match_rates.csv`

---

## Reliability and Quality Constraints

Implementing agent must follow these constraints:

1. **Determinism:** Same inputs/config -> byte-identical CSV output order and values.
2. **Explicit configuration:** Thresholds, tie-break rules, and precedence are config-driven, not hidden in SQL literals.
3. **Defensive ETL:** Validate raster existence, CRS assumptions, nodata handling, and row counts before writing final outputs.
4. **Understandability:** Public non-overriding methods need orienting comments; pipeline modules have concise module-level purpose comments.
5. **Observability:** Public backend entry points log debug; caught exceptions log error; getter-style reads log trace (per project rules).
6. **Tests:** Happy paths + essential failure cases only (no over-testing implementation details).

---

## Proposed Architecture

### Execution style

- Offline pipeline executed from a script entrypoint (Python + SQL via PostgreSQL/PostGIS/h3-pg).
- SQL-heavy transformations in versioned `.sql` files for auditability.
- Small Python orchestration wrapper for:
  - Input validation
  - Ordered phase execution
  - Export and metadata writing
  - Exit code and readable error reporting

### Working storage

- Dedicated schema in `agent_wars_1`, e.g. `terrain_gen`.
- Intermediate tables/materialized views are namespaced and recreatable.
- No mutation of game runtime tables in this milestone.
- Use a dedicated DB role/connection profile for ETL where possible; do not hardcode credentials in repo files.

### Classification strategy (initial)

- `ocean`: primarily land cover class 12 (`Open Water`) dominant signal
- `forest`: tree classes 1-4 dominant
- `arctic`: class 10 (`Snow/Ice`) dominant
- `mountain`: high ruggedness/slope/elevation signal (from topography), with precedence over generic `land`
- `desert`: class 11 (`Barren`) dominant when mountain criteria are not met
- `land`: fallback for non-ocean, non-forest, non-arctic, non-mountain, non-desert

Final precedence/threshold values are defined in Phase 3 and persisted in metadata.

---

## Locked decisions (resolved)

The following product decisions are confirmed and should be treated as fixed for implementation:

1. Terrain labels are lowercase: `ocean|land|forest|mountain|desert|arctic`.
2. Processing extent includes all cells at both target resolutions (no scenario-only filtering).
3. Base CSV includes explicit `ocean` rows (no omission/inference).
4. Parent-child mismatch logic applies uniformly to every terrain, including `ocean`.
5. Exceptions CSV includes parent reference (`parent_h3`) in addition to child `h3_index` and child `terrain`.
6. Mountain classification should be liberal (favor recall so mountains stand out).
7. Terrain precedence is fixed: `ocean -> arctic -> forest -> mountain -> desert -> land`.
8. Generated artifacts are written under `agent-wars/data/generated/`.
9. Cells with no valid land-cover signal default to `ocean`.
10. Land-cover classes `5/6/7/8/9` map to `land` by default.
11. Raster-to-H3 aggregation uses area-weighted statistics (not centroid-only sampling).
12. DB credentials are supplied via environment variables; credentials are not committed to repository files.
13. Exceptions CSV includes `parent_terrain`; schema is `h3_index,parent_h3,terrain,parent_terrain`.
14. Inland water bodies (lakes/rivers/inland seas) are classified as `ocean` terrain for gameplay purposes.
15. Inland-water detection uses a liberal water-presence override to favor recall over precision.

---

## Phase Plan

## Phase 0 — Contract freeze and assumptions

### Work

- Confirm immutable contracts before coding:
  - Terrain enum spellings/casing
  - CSV column schema and sort order
  - Parent-child mapping function (`h3_cell_to_parent` for res4 -> res1)
  - Output path conventions under repo
  - Land-cover-to-terrain mapping table for all EarthEnv classes 1-12
  - No-data and out-of-coverage fallback policy
  - Raster-to-H3 aggregation method contract (sampling/statistic/resampling policy)
- Produce a short "contract block" comment in pipeline config.

### Verification

- One checklist file section exists in code/config confirming all contract decisions.
- No ETL work begins until contract checklist is complete.

### Dependencies

- None.

---

## Phase 1 — Environment and data validation

### Work

- Add a validation command that checks:
  - Database connectivity (`agent_wars_1`)
  - Required extensions (`postgis`, `h3`)
  - Presence and readability of all required rasters in `F:\Data`
  - Nodata and raster metadata are parseable
  - Coverage compatibility warnings (e.g., EarthEnv land-cover extent vs full-globe H3 extent)
- Fail fast with clear error messages for missing files or extension mismatch.

### Verification

- Validation command passes on current machine.
- Forced failure test: temporarily point one filename incorrectly -> command fails with actionable message.

### Dependencies

- Phase 0.

---

## Phase 2 — Raster ingestion and canonical spatial prep

### Work

- Load required rasters into `terrain_gen` schema (idempotent replace behavior).
- Standardize assumptions:
  - CRS handling
  - valid data mask / nodata propagation
  - numeric precision policy
- Build canonical H3 cell tables:
  - `h3_res1_cells` (all valid global res-1 cells for game extent)
  - `h3_res4_cells` (children mapped to res-1 parents)

### Verification

- Row counts for H3 tables are in expected ranges (res1 ~842, res4 ~842*343 approximate with edge constraints).
- Sample spot checks:
  - Parent of res4 cell equals stored parent.
  - Cell geometry intersects expected raster extent.

### Dependencies

- Phase 1.

---

## Phase 3 — Terrain scoring model and rule config

### Work

- Implement scoring aggregation per H3 cell:
  - Land-cover class prevalence synthesis
  - Topographic indicators (TRI/slope/elevation, 5km for res4, 50km for res1 baseline rule)
- Define explicit classifier config:
  - Thresholds (mountain/desert/arctic gates)
  - Tie-break ordering
  - Final precedence chain
- Keep config in one versioned file consumed by pipeline.
- Bias mountain thresholds toward a liberal classification profile.
- Bias inland-water override toward a liberal profile so inland water is retained where possible.
- Version and document the complete mapping logic so future tuning does not silently change category semantics.

### Verification

- Unit-level checks on synthetic mini-cases:
  - Clear ocean cell -> `ocean`
  - Tree-dominant cell -> `forest`
  - Snow/ice dominant -> `arctic`
  - Barren + low ruggedness -> `desert`
  - Barren + high ruggedness -> `mountain`
- Distribution sanity check: no impossible/null terrain labels.

### Dependencies

- Phase 2.

---

## Phase 4 — Res-1 base terrain generation

### Work

- Generate complete `res1 -> terrain` table from classifier.
- Export deterministic CSV:
  - columns: `h3_index,terrain`
  - sorted by `h3_index` ascending
- Emit QA summary counts.

### Verification

- CSV row count equals res-1 table row count.
- Hash of CSV stable across two consecutive runs with same inputs.
- Manual geographic spot checks (at least 10 cells across oceans, deserts, mountains, arctic regions).

### Dependencies

- Phase 3.

---

## Phase 5 — Res-4 classification and parent exception extraction

### Work

- Generate complete res-4 terrain table with same classifier policy.
- Join to parent res-1 terrain and keep only exceptions:
  - child terrain != parent terrain
- Export deterministic exceptions CSV:
  - columns: `h3_index,parent_h3,terrain,parent_terrain`

### Verification

- Every exported row must satisfy `child_terrain != parent_terrain`.
- Non-exported sampled rows should match parent terrain.
- Exception density sanity check per parent (no implausible all-child divergence without clear reason).

### Dependencies

- Phase 4.

---

## Phase 6 — Metadata, reproducibility, and safety rails

### Work

- Write `terrain_generation_metadata.json` including:
  - Input file names + checksums
  - Classifier config version + threshold values
  - Tool versions (Python, PostgreSQL, PostGIS, h3-pg)
  - Timestamp and run ID
  - Aggregation/resampling contract and no-data fallback policy used for the run
- Add guardrails:
  - Abort export if terrain labels outside enum
  - Abort export if row counts below threshold floor
  - Abort export if required classes absent unexpectedly (configurable warning/error)

### Verification

- Metadata file generated and references exact output CSV hashes.
- Injected bad config triggers guarded failure.

### Dependencies

- Phase 5.

---

## Phase 7 — Tests, docs, and developer handoff

### Work

- Add focused tests for:
  - Input validation failures
  - Deterministic output behavior
  - Parent-child exception correctness
  - Core classifier decision boundaries
- Add developer docs:
  - How to run full pipeline
  - How to rerun only one phase
  - How to tune thresholds safely
  - Common failure triage

### Verification

- Tests pass locally.
- A clean run from scratch reproduces outputs and metadata.
- Another developer can follow docs to regenerate outputs without ad-hoc tribal knowledge.

### Dependencies

- Phase 6.

---

## Acceptance Criteria

The milestone is complete when all are true:

1. `terrain_res1_base.csv` and `terrain_res4_exceptions.csv` are generated deterministically.
2. Terrain labels match the six-type taxonomy in the vision/planning docs.
3. Exception CSV contains only true parent mismatches.
4. Metadata captures enough context for exact reruns.
5. Tests cover essential happy-path and failure contracts.
6. Pipeline code is understandable and documented for future maintainers.
7. Public backend methods introduced/updated by the pipeline implementation include required orienting comments and logging levels per project rules.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Thresholds overfit to a few regions | Use multi-region spot checks and keep thresholds config-driven with explicit rationale. |
| Raster nodata/coverage edge cases | Enforce nodata policy and explicit fallback path; log affected cell counts. |
| Mountain vs desert ambiguity | Combine barren class with topographic indicators; document known limitations in metadata. |
| Non-deterministic exports | Canonical sorting + stable formatting + output hash checks. |
| Fragile SQL-only logic | Keep orchestration + validation in Python and split SQL into readable stages. |

---

## Open Questions

No open questions remain. Product decisions are captured in **Locked decisions (resolved)**.

---

*End of plan.*

