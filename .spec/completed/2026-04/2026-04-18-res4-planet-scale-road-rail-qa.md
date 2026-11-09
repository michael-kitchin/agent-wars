# Res4 planet-scale road/rail QA record

This file is the **operator log** for execution plan phase 2 (global scalerank `0..4` coverage assurance).

## Commands

```powershell
python -m scripts.terrain_pipeline.road_rail_sides_cli run --verbose
python -m scripts.terrain_pipeline.road_rail_sides_cli qa-line-coverage --verbose
```

## Record template (fill after each full run)

- **Date (UTC):**
- **`road_rail_sides` record_count:**
- **QA summary keys:** (paste or summarize `cells_only_in_buffered` / `cells_only_in_densified` / etc.)
- **Git note:** artifact hash or commit range when JSON/zips changed

Until a full run is executed on a maintainer machine, leave this section blank intentionally.
