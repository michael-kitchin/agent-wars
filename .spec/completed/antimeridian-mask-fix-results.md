# Antimeridian Mask Fix Results

## Environment
- Python, h3, shapely, pyproj versions: Python 3.13, h3 4.4.2, shapely 2.1.2, pyproj 3.7.2.
- Files already changed before this work (from git status): none (only the untracked plan file).
- Database password: not set in any environment scope at the start. The user supplied it later; it was set in the shell session only and never written to a file.

## Deviations from the Plan
- **Database port bug (fixed, outside the plan).** `metadata_cli validate` failed with `invalid connection option "seaport"`. Commit `11bf854` had renamed the database `port` field to `seaport` in `DbConfig`, `DbRuntimeConfig`, and the psycopg call. The field is renamed back to `port` in `config.py`, `db.py`, and the run-metadata block in `pipeline.py`. Validation then passed.
- **Order.** Phase 6 (regional) ran while the password was missing, and the global metadata export ran in parallel with the regional runs (43 GB free RAM, 12 logical cores). They write different files and the regional pipeline reads only the shapefiles and rasters, so neither affects the other.
- **Log encoding.** PowerShell `>` writes UTF-16, so the JSON logs under `.test/antimeridian/logs/` are UTF-16.

## Baseline Reproduction
- res-1: records / crossing / all_water / intersects_water: 842 / 28 / 0 / 28. Pole cells `81033ffffffffff`, `81f2bffffffffff`.
- res-4: records / crossing / intersects_urban / urban overlay / all_water / intersects_water: 288,122 / 595 / 367 / 340 / 27 / 580.
- Global urban rollup (cells / producing / median / p90): 4,643 / 283 / 8 / 44.
- Regional tactical crossing counts: `australia_new_zealand` 173, `eastern_europe` 234.

All match the plan.

## Tests
- terrain:test / regional:test / weather:test counts: 71 / 44 / 2, all OK. The 5 contract tests in `test_antimeridian.py` and 4 in `test_antimeridian_qa.py` are included in the 71.
- The far-polygon regression case was confirmed to fail on the old projection (`intersects` True without `cell=`).

## Probe
- Compared cells per resolution: res-1 842 (all), res-4 1,173 (595 crossing, 2 pole, every 500th other cell).
- Ordinary mismatches / crossing non-mask mismatches: 0 / 0 at both resolutions.
- Oracle disagreements (listed): 0 at both resolutions (limits 1 and 5).
- Crossing before and after:
  - res-1: all_water 0 -> 18, intersects_water 28 -> 28, intersects_urban 0 -> 0.
  - res-4: all_water 27 -> 550, intersects_water 580 -> 571, intersects_urban 367 -> 0.

## Global Regeneration
- Durations: metadata about 2 h 8 min (21:21 to 23:29), landmass and weather under 1 min.
- Diff results per file (changed cells, changed fields, violations):
  - `terrain_res1_metadata.json` (rings 0): 27 changed; all_water 18, total_edges 8, water_edges 27; 0 violations.
  - `terrain_res4_metadata.json` (rings 0): 570 changed; all_water 523, intersects_urban 367, urban_by_scalerank 367, intersects_water 9, total_edges 233, water_edges 547; 0 violations.
  - `terrain_res1_landmass.json` (rings 1): 23 changed; water_pct 23; 0 violations.
  - `terrain_res1_weather.json` (rings 2): 0 changed. The file is byte-identical to the baseline, so it was not re-zipped.
- Corridor check (`qa_landmass_corridor.py`): exit 0.
- After summaries:
  - res-1: crossing all_water 18 (equals probe), intersects_urban 0.
  - res-4: crossing intersects_urban 0 (equals probe), urban overlay 0, all_water 550 (equals probe).
  - Global urban rollup: 4,303 / 264 / 8 / 45.7. This equals the pre-fix total with crossing cells removed, and 264 producing hexes equals the frozen `GlobalEconomyBaseline`.
- `total_edges` changes are crossing cells whose old wrapped polygon had 4 or 5 edges; the new count equals the cell's H3 boundary vertex count, as for ordinary cells (7 or 8 for cells with distortion vertices).

## Regional Regeneration
- `australia_new_zealand`:
  - Diffs: res_s metadata 9 changed; res_t metadata 173 changed (intersects_urban 115); res_s landmass 9; res_s weather 2 (rings 5). 0 violations. `manifest-diff` passed.
  - Economy before -> after: urban 238 -> 234, producing 39 -> 38, median 4.0 -> 3.5, scale 0.480 -> 0.446, infantry 10 -> 9, minimums 2/4/5 -> 2/3/5, advanced 10, strike 4, range 8.
  - Balance before -> after: Tasman 33.6% -> 32.5%, New South Wales & ACT 26.9% -> 27.4%, Queensland, NT, WA & SA 39.5% -> 40.2%. PASS.
  - Check: exit 0. Origin units, naming, and road and rail files byte-identical. Fallback: no.
- `eastern_europe`:
  - Diffs: res_s metadata 15 changed; res_t metadata 232 changed (intersects_urban 117); res_s landmass 14; res_s weather 4 (rings 5). 0 violations. `manifest-diff` passed.
  - Economy before -> after: urban 1,182 -> 1,156, producing 106 -> 102, median 9.0, scale 0.833 -> 0.844, infantry 17, minimums 3/6/10, advanced 15, strike 7 -> 8, range 14.
  - Balance before -> after: CNWR 17.4% -> 17.8%, Ukraine group 21.8% -> 22.3%, Volga 21.9% -> 22.4%, Urals, Siberia & Far East 22.6% -> 20.8%, Central Europe 16.2% -> 16.6%. PASS.
  - Check: exit 0. Origin units, naming, and road and rail files byte-identical. Fallback: no.

## Packaging and App Tests
- Zipped files: global `terrain_res1_metadata`, `terrain_res4_metadata`, `terrain_res1_landmass`; for each region `region_manifest`, `terrain_res_s_metadata`, `terrain_res_t_metadata`, `terrain_res_s_landmass`, `terrain_res_s_weather`.
- Round-trip check: no mismatches.
- npm test result, and any data-asserting tests updated: the first run failed one test, `every shipped regional manifest has the expected infantry cost` in `src/main/gameMap/regionManifestRead.test.ts`, which expected `australia_new_zealand` 10. The regenerated manifest gives 9 (urban total includes crossing cells; matches the economy log), so `EXPECTED_INFANTRY.australia_new_zealand` is now 9. `eastern_europe` stays 17. The second run passed (exit 0). The `ERR_DLOPEN_FAILED` text in the log is the native-rebuild probe before it rebuilds.

- Review edits after npm test (Python only: explicit `probe` dispatch and a read-only field-set map in `antimeridian_qa.py`, test helper docstrings) were re-tested with `npm run terrain:test` (71 OK) and a CLI `diff` and `summary` run.

## Docs
- `doc/region-summary-1.md`: Table 1 global row (4,303 / 264 / 8), Table 1 side-group shares for `eastern-europe` and `australia-nz`, Table 2 rows for both regions, and the res4 urban sentence (second form, because 4,304 > 4,303).
- `scripts/terrain_pipeline/README.md`: new Classification notes bullet for cells that cross 180 degrees.
- Checked without changes: `doc/terrain-pipeline.md` and `doc/README.md` (neither describes the mask projection). Table 3 and the frozen `GlobalEconomyBaseline` left unchanged as planned.

## Changed Files
- Modified data: 13 zips (3 global, 5 per region), listed under Packaging.
- Modified code: `scripts/terrain_pipeline/ocean_mask.py`, `metadata_export_core.py`, `pipeline.py`, `calibrate.py`, `config.py`, `db.py`; `src/main/gameMap/regionManifestRead.test.ts`.
- New code: `scripts/terrain_pipeline/antimeridian.py`, `antimeridian_qa.py`, `antimeridian_probe.py`, `tests/test_antimeridian.py`, `tests/test_antimeridian_qa.py`.
- Docs: `doc/region-summary-1.md`, `scripts/terrain_pipeline/README.md`.
- Spec: `.spec/antimeridian-mask-fix-execution-plan.md`, `.spec/antimeridian-mask-fix-results.md`.
- Scratch (gitignored): `.test/antimeridian/` (baselines, logs, `zip-files.cjs`).
