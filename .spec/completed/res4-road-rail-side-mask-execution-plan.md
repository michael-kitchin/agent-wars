# Res4 Road/Rail Side-Mask Pipeline Execution Plan

This plan defines a reliable, phased implementation for generating `res4` road/rail connectivity metadata from shapefiles into a hex-keyed JSON artifact usable by tactical rendering and pathfinding.

Audience: an implementation agent with lower reliability that must follow strict checkpoints.

## Objective

For each touched res4 hex, generate two independent side-connection masks:

- road mask
- rail mask

Each mask represents whether any route segment connects the hex center to a specific side midpoint. The mask length must equal the side count of that cell (`5` for pentagons, `6` for normal hexes).

## Core output contract

Output format follows the existing res4 naming JSON pattern: top-level object envelope plus a `records` array.

## Per-hex fields

- `h3_index`: string
- `road_sides`: boolean array
- `rail_sides`: boolean array

Notes:

- Both arrays must have equal length per record.
- Array length is the cell side count (`5` or `6`).
- Per-record side labels are omitted unless later proven essential for reliability.

## Document-level fields

- `schema_version`
- `resolution` (`4`)
- `generated_at_utc`
- `record_count`
- `side_ordering_contract` (string defining global mask index semantics)
- `records` (naming-style array)

## Required semantic guarantees

1. Multiple routes crossing the same side never change semantics beyond `true`.
2. Overlapping and duplicate geometries are idempotent (same output after dedupe).
3. Side indexing is stable and deterministic across runs.
4. Behavior is consistent for both pentagons and hexagons.
5. Road and rail are computed separately from separate inputs.
6. Output contains touched cells only (no global default-false rows).

## Side ordering contract (unambiguous, identifier-light)

To keep payload minimal while preserving reliable interpretation:

1. Mask index order is clockwise by side midpoint azimuth around the cell centroid.
2. Anchor index `0` is the north-most side midpoint (highest latitude).
3. If anchor tie occurs, use deterministic tie-break by smaller longitude first.
4. Consumer interprets booleans strictly by index under this global contract.

## Geometric interpretation contract

For each route line segment intersecting a cell:

1. Clip route geometry to the cell polygon.
2. Determine touched boundary edges of that cell using edge-segment intersection semantics.
3. For each touched edge, set corresponding side boolean to `true`.

This contract intentionally avoids counting route multiplicity and captures only side connectivity needed for glyph rendering and graph-style adjacency/path logic.

Locked special cases:

1. If a route enters a hex and terminates inside that hex, set one side flag (not two).
2. If a route only contacts an exact hex corner (vertex-only), set no side flags.

## Phase plan

Each phase must be independently verifiable before moving on.

## Phase 0 - Contract lock and prerequisites

Goal: eliminate ambiguity before coding.

Tasks:

1. Lock shapefile sources:
   - road: `F:/Data/ne_10m_roads.shp`
   - rail: `F:/Data/ne_10m_railroads.shp`
2. Confirm output filename and location under `data/generated/`.
3. Confirm output shape is naming-style object envelope with `records` array.
4. Confirm side-ordering policy without mandatory per-record side labels.

Verification:

- Decisions are captured in this document.
- No unresolved contract ambiguity remains.

Exit criteria:

- Implementation agent can code without guessing semantics.

## Phase 1 - Pipeline scaffolding and validation gates

Goal: add safe entrypoint and fail-fast validation.

Tasks:

1. Add dedicated Python module under `scripts/terrain_pipeline/` for road/rail side-mask export.
2. Add CLI entrypoint with `validate` and `run` subcommands, consistent with existing pipelines.
3. Validate:
   - shapefile existence
   - required sidecar files (`.dbf`, `.shx`, `.prj` as applicable)
   - geometry readability via Fiona/GeoPandas stack used by repo
   - CRS resolvable and transformable to WGS84
4. Add structured logs:
   - debug logs on public method entry and major invocation boundaries
   - error logs with `exc_info=True` for caught exceptions

Verification:

- `validate` command passes on good inputs and fails clearly on missing inputs.
- Essential failure tests for missing files and invalid schema/CRS.

Exit criteria:

- Pipeline fails early and predictably before expensive geometry work.

## Phase 2 - Cell side indexing and deterministic side order

Goal: define and implement a stable cell-side ordering usable by all later phases.

Tasks:

1. Implement helper to derive cell polygon vertices and boundary edges from H3 cell geometry.
2. Build deterministic clockwise side ordering with stable anchor:
   - anchor at north-most side midpoint
   - tie-break by smaller longitude
3. Do not emit per-record side labels unless required for reliability.
4. Add invariant checks:
   - mask lengths match side count
   - ordering is deterministic for repeated runs

Verification:

- Unit tests:
   - known sample cells produce stable side ordering across repeated runs
   - pentagon cells yield 5-length masks
   - clockwise ordering contract holds

Exit criteria:

- Side indexing is deterministic and test-backed for any res4 cell.

## Phase 3 - Route intersection to side-mask projection

Goal: compute boolean side masks from clipped route geometries.

Tasks:

1. Read route features from `ne_10m_roads.shp` and `ne_10m_railroads.shp`, then transform to WGS84.
2. Determine candidate res4 cells for each route feature (overlap approach consistent with existing naming pipeline behavior).
3. For each candidate cell:
   - clip line geometry to cell polygon
   - detect boundary edges touched by edge-segment intersection
   - ignore vertex-only (corner-only) intersections
   - set side booleans to `true` for touched edges
4. Merge contributions across all features using logical OR.
5. Keep road and rail processing independent, then combine by cell key.

Verification:

- Unit tests for geometry edge-touch cases:
   - north/south crossing sets two expected sides
   - crossing + terminating-inside sets one side where applicable
   - multi-route crossings set union of touched sides
   - corner-only contact sets no sides
   - route fully internal without boundary touch sets no sides
- Essential failure test for invalid geometry records.

Exit criteria:

- Side-mask semantics match the contract and remain idempotent under duplicate routes.

## Phase 4 - End-to-end export and deterministic JSON writing

Goal: produce final res4 artifact with stable ordering for touched cells.

Tasks:

1. Implement touched-cell-only output policy.
2. Produce final records with both `road_sides` and `rail_sides`.
3. Ensure deterministic output ordering:
   - stable `h3_index` sort
   - stable side order per cell
4. Write JSON with UTF-8 and newline-stable formatting.
5. Add run metadata and input provenance/checksums if straightforward.

Verification:

- Repeat-run determinism test: same inputs produce byte-identical output.
- Integration test on a small known fixture dataset with golden output.

Exit criteria:

- Artifact is stable, parseable, and contract-valid for consumer usage.

## Phase 5 - Consumer-readiness checks and documentation

Goal: guarantee downstream rendering/pathfinding can safely consume the data.

Tasks:

1. Add explicit schema documentation to pipeline README section.
2. Add compact consumer contract note:
   - `side_ordering_contract` is authoritative for mask index interpretation
   - booleans are presence flags, not route counts
3. Add validator script/test that enforces:
   - `len(road_sides) == len(rail_sides)`
   - arrays contain booleans only
   - lengths are only `5` or `6`
4. Add troubleshooting notes (CRS mismatch, invalid linework, performance tuning).

Verification:

- Documentation reviewed against generated sample JSON.
- Contract validator passes on produced artifact.

Exit criteria:

- Output can be consumed without implicit assumptions or reverse-engineering.

## Reliability guardrails for the implementing agent

1. Do not skip phase exit checks.
2. Do not combine phases unless previous phase verification is complete.
3. Prefer small pure helper functions for:
   - side ordering
   - edge-touch detection
   - mask merge logic
4. Keep logs specific (include cell id and feature id where available).
5. Keep tests focused on happy path + essential failures only.

## Suggested file touch list

- `scripts/terrain_pipeline/` (new road/rail pipeline module + optional CLI module)
- `scripts/terrain_pipeline/tests/` (new focused tests)
- `scripts/terrain_pipeline/README.md` (new usage and schema section)
- `data/generated/` (new output JSON artifact path, generated at runtime)

## Locked owner decisions

1. Follow the res4 naming JSON style.
2. Include only touched hexes.
3. Use `ne_10m_roads.shp` and `ne_10m_railroads.shp` from `F:/Data`.
4. Only include side identifiers if essential; if added later, they must be unambiguous.
5. Route terminating inside a hex after crossing one side sets one side flag.
6. Exact-corner contact without edge-segment intersection sets no side flags.

Plan status: locked and ready for strict phase-by-phase implementation.
