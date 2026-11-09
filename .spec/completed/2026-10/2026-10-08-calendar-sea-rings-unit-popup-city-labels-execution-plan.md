# Calendar, sea rings, unit popup, and city labels

> **For agentic workers:** Implement this plan phase by phase. Do not copy phase titles into source, comments, configuration, or `doc/`. Do not commit or push. Do not edit `static/renderer.js`. Rebuild the renderer with `npm run build:renderer` before any in-game check.

**Goal:** Show a year with the month on the global map and a real weekly date on a regional map, give every ocean coast at least two hexes of sea, put the unit's name and formation date on the Bonuses tooltip, and label one more scalerank of cities on tactical maps.

**Architecture:** One shared calendar turns a strategic turn number into a date. Weather, the sidebar, the AI prompt, and the unit tooltip all read that date. The formation turn is a column on `units`. Sea rings and city ceilings are pipeline outputs. The app reads the regenerated packs. It does not recompute the footprint.

**Tech stack:** TypeScript, SQLite, Electron, Python regional pipeline, H3, Natural Earth.

## Confirmed behavior

- A global turn is still one month. A regional turn is one week. Production, movement range, the one air action, fog staleness, and AI memory intervals still happen once per turn.
- The date is always on the sidebar turn line and in the AI prompt, whether or not the weather bonus is on.
- The year advances on the anniversary of the start month. A global match that starts in November is `November, Year 1` on turn 1, `January, Year 1` on turn 3, `November, Year 2` on turn 13, and `November, Year 3` on turn 25.
- A regional match starts on the 1st of the selected month, in a leap year. Each later turn adds 7 days. Month lengths are real. February has 29 days in game Years 1, 5, 9, and so on (`(year - 1) % 4 === 0`), and 28 days otherwise. A weekly November start's turn 3 is `November 15th, Year 1`, not January.
- Weather for a turn is the climate month of that date. A battle keeps the weather of the strategic turn it started in. Acclimation tags stay a property of the birth hex's twelve climate months.
- Opening units are formed on turn 1. A unit built during resolution is formed on the next turn, because production runs before the turn counter increments. A tactical unit shows its parent strategic unit's formation date.
- Every footprint water body, including the Caspian, has at least two rings of water hexes. The existing kilometre sea reach still adds water beyond those two rings. The halo may cover a non-member island smaller than one strategic hex. It does not cover a continent, an isthmus, or an island at least that large. Member land is never reclassified. A neutral-border hex keeps that role.
- City label ceilings rise by the amount that actually adds cities. Global tactical labels go from scalerank 4 to 6, because scalerank 5 contains only two places. Resolution-5 regions go from 6 to 7, which includes Pueblo, Colorado. Resolution-6 regions go from 7 to 8.

## Global constraints

- CamelCase files and exported functions under `src/`. Exported types are PascalCase. Role suffixes only: `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, `Types`. No `Utils` or `Impl`.
- Python pipeline files stay snake_case.
- Orienting comments on every new field and non-overriding method: why it exists, when to use it, expected outcome, exceptions.
- Public main-process methods log at debug. Caught exceptions log at error. Getters that do not change state log at trace. Use the existing logger. It checks the level before building the message.
- `gameDateForTurn`, `daysInGameMonth`, `formatGameDate`, and `formatGameDateForTurn` do not log. Snapshot assembly calls them once per hex. Log the finished label once, in snapshot assembly.
- Tests cover the happy path and essential failures only.
- Desirable file size 600 lines, hard limit 1000. Desirable argument count 6, hard limit 10.
- Do not put this plan's section titles into version-controlled product code, comments, or `doc/`.
- Do not commit or push.
- Update living docs in `doc/` and `scripts/regional_pipeline/README.md`. Do not edit files under `.spec/completed/`.

## Files

- Create [src/shared/gameCalendar.ts](src/shared/gameCalendar.ts) — turn number to date, for both calendars.
- Create [src/shared/gameCalendar.test.ts](src/shared/gameCalendar.test.ts).
- Edit [src/shared/weatherBonusRules.ts](src/shared/weatherBonusRules.ts) — re-export `parseStartMonth`. Delete the old month helpers.
- Edit [src/main/weather/weatherPackLoad.ts](src/main/weather/weatherPackLoad.ts) — weather month comes from the date.
- Edit [src/main/gameDb/fogState.ts](src/main/gameDb/fogState.ts) — snapshot date label.
- Edit [src/shared/ipc/gameStateTypes.ts](src/shared/ipc/gameStateTypes.ts) — `currentDateLabel`, `formedTurn`. Remove `monthName`.
- Edit [src/renderer/core/uiState.ts](src/renderer/core/uiState.ts) — sidebar date.
- Edit [src/main/openRouter/openRouterBuildSystemPrompt.ts](src/main/openRouter/openRouterBuildSystemPrompt.ts) and [src/main/openRouter/promptSpec/gameRuleText.ts](src/main/openRouter/promptSpec/gameRuleText.ts).
- Edit [src/renderer/chrome/controlTooltipText.ts](src/renderer/chrome/controlTooltipText.ts) and [static/index.html](static/index.html).
- Edit [src/main/gameDb/schema.ts](src/main/gameDb/schema.ts) and [src/main/gameDb.ts](src/main/gameDb.ts) — `formed_turn`, user version 21.
- Edit [src/main/gameDb/unitInsert.ts](src/main/gameDb/unitInsert.ts), [src/main/gameDb/seeding/plannedUnits.ts](src/main/gameDb/seeding/plannedUnits.ts), [src/main/gameActions/controlAndProduction.ts](src/main/gameActions/controlAndProduction.ts), [src/main/gameDb/unitSnapshotRead.ts](src/main/gameDb/unitSnapshotRead.ts).
- Edit [src/shared/unitOriginTooltipText.ts](src/shared/unitOriginTooltipText.ts) and [src/renderer/core/unitOriginFlags.ts](src/renderer/core/unitOriginFlags.ts) and [src/renderer/openRouter/openRouterUiHelpers.ts](src/renderer/openRouter/openRouterUiHelpers.ts).
- Edit [scripts/regional_pipeline/scalerank_policy.py](scripts/regional_pipeline/scalerank_policy.py) and [src/shared/activeGameMap.ts](src/shared/activeGameMap.ts).
- Create [scripts/regional_pipeline/landmass_index.py](scripts/regional_pipeline/landmass_index.py).
- Edit [scripts/regional_pipeline/footprint.py](scripts/regional_pipeline/footprint.py), [scripts/regional_pipeline/footprint_inputs.py](scripts/regional_pipeline/footprint_inputs.py), [scripts/regional_pipeline/regional_scaling.py](scripts/regional_pipeline/regional_scaling.py), [scripts/regional_pipeline/region_manifest.py](scripts/regional_pipeline/region_manifest.py), [scripts/regional_pipeline/pack_checks.py](scripts/regional_pipeline/pack_checks.py), [scripts/terrain_pipeline/geography_regions.py](scripts/terrain_pipeline/geography_regions.py).

## Calendar

`startMonth` is 1 for January through 12 for December. A non-finite turn, or a turn below 1, is turn 1. Unknown start months are January, using the same `parseStartMonth` rules as today.

```typescript
const DAYS_IN_COMMON_YEAR = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInGameMonth(year: number, monthIndex: number): number {
  if (monthIndex === 1 && (year - 1) % 4 === 0) return 29;
  return DAYS_IN_COMMON_YEAR[monthIndex];
}

function weeklyDate(turn: number, startMonth: number): { year: number; monthIndex: number; day: number } {
  let year = 1;
  let monthIndex = startMonth - 1;
  let day = 1;
  let monthsElapsed = 0;
  for (let step = 1; step < turn; step += 1) {
    day += 7;
    while (day > daysInGameMonth(year, monthIndex)) {
      day -= daysInGameMonth(year, monthIndex);
      monthsElapsed += 1;
      year = Math.floor(monthsElapsed / 12) + 1;
      monthIndex = (startMonth - 1 + monthsElapsed) % 12;
    }
  }
  return { year, monthIndex, day };
}
```

Monthly dates use `monthIndex = (turn - 1 + startMonth - 1) % 12` and `year = floor((turn - 1) / 12) + 1`. They have no day. Weekly years use the elapsed month crossings in the loop above. Do not apply the monthly year formula to a weekly date.

Format the day with `formatOrdinalLabel(day, 'en-US')`. Monthly text is `November, Year 3`. Weekly text is `November 22nd, Year 1`.

`gameCalendarKindForMap` returns `'monthly'` for `'global'` and `'weekly'` for every other map id.

Tests must assert these values:

- Weekly, November start: turn 6 is `December 6th, Year 1`. Turn 53 is `October 30th, Year 1`. Turn 54 is `November 6th, Year 2`.
- Weekly, February start: turn 5 is `February 29th, Year 1`. Turn 6 is `March 7th, Year 1`. Turn 57 is `February 27th, Year 2`. Turn 58 is `March 6th, Year 2`. March 6 is the proof that Year 2's February has 28 days. A 29-day February would have produced March 5th.
- Monthly, November start: turn 3 is `January, Year 1`. Turn 13 is `November, Year 2`. Turn 25 is `November, Year 3`.
- `parseStartMonth('13')`, `parseStartMonth('Foo')`, and `parseStartMonth(0)` are 1. `parseStartMonth('december')` is 12.

Move `parseStartMonth` into `gameCalendar.ts`. Re-export it from `weatherBonusRules.ts`. Delete `calendarMonthIndex` and `calendarMonthName`. Do not import `weatherBonusRules` from `gameCalendar`.

The new-game preview's turn-1 month is `gameDateForTurn(1, startMonth, 'monthly').monthIndex`. Do not subtract the month by hand.

`displayWeatherForHex` keeps the signature `(h3Index, turnNumber, startMonth)`. It indexes the twelve-month pack with `gameDateForTurn(turnNumber, startMonth, gameCalendarKindForMap(activeGameMap().id)).monthIndex`.

The snapshot always includes `startMonth` and `currentDateLabel`. Remove `monthName`. `originBonusSettingsFromSnapshot` keeps copying `startMonth` only when the weather bonus is on. A present `startMonth` does not mean the weather bonus is on.

The sidebar is `Turn: N · <currentDateLabel>`. During a battle, `N` is the tactical beat and the date is still the strategic turn's date. Keep the weather icon after the date.

The AI prompt clause is `date: <currentDateLabel>`, always. The weather rule text says the date is on the turn line and that weather changes when the date enters a new month.

The start-month tooltip says a global turn is a month, a regional turn is a week, and weather changes when the date enters a new month.

One weather test, inside `withGameMap`, uses a real pack hex. A weekly turn 5 of a January start matches that hex's January weather. Weekly turn 6 matches the global calendar's turn 2 for the same hex. `withGameMap` restores the previous profile.

Do not change acclimation, the briefing narrative, production rates, movement budgets, fog, or AI memory.

## Formation turn

Add `formed_turn INTEGER NOT NULL DEFAULT 1` to `units`. Bump `EXPECTED_USER_VERSION` from 20 to 21. Do not rename `GAME_DB_FILE_NAME`. A version mismatch already replaces the match database.

`DEFAULT 1` lets the existing test inserts that omit the column keep working. Do not edit those inserts. Do not make the column nullable.

`NewUnitRow.formedTurn` is required. `insertUnitRow` writes it and logs it. Seeding passes 1. Production passes `currentPlanningTurnNumber() + 1`. The snapshot select returns it. The unit type on the snapshot has optional `formedTurn`.

Tests: one `insertUnitRow` round-trip, and one existing production spawn that expects `turn_number + 1`.

## Unit tooltip

`formatUnitOriginTooltipHtml` takes an optional `identity: { displayName: string; formedLabel: string | null }`.

- A non-empty `displayName` adds `<strong>Name:</strong> `, then `originFlagImgHtml`, then the escaped name.
- A non-empty `formedLabel` adds `<strong>Formed:</strong> ` and the escaped label.
- Those lines, when present, are followed by a blank line (`\n\n`) and then the existing Bonuses block.
- No identity leaves the tooltip as it is today, with no blank line.

`formationTurnForUnit(unitId, formedTurnById)` returns the turn for that id, or the parent strategic id when `parseTacticalSubUnitId` matches, or null. Test the parent fallback.

The renderer remembers `formedTurn` beside the origin cache and clears both together. The Name line uses `S.unitDisplayNameById`. It does not use the label text passed to `setUnitNameContent`, because that text can include a selection count or an order target. The Formed line is `formatGameDateForTurn` of the resolved turn, using `state.startMonth` and `gameCalendarKindForMap(state.gameMap.id)`. Omit Name when the lookup misses. Omit Formed when the turn is missing.

Wire the identity into the flag builder, the one-unit map-token tooltip, and the loss-toast flag. A loss-toast display name is ambiguous when the origins would not match or the formed labels would not match. An ambiguous name gets no flag.

Do not add a formation field to `TacticalSubUnitSnapshot`. The parent is still in the strategic snapshot.

## City labels

City label maxima become 6, 7, and 8 for tactical resolutions 4, 5, and 6. Leave road, rail, urban, airport, and seaport ceilings unchanged. Set the global profile's `cityLabel` to 6. Comments that say the global city maximum is 4, or that labels are scalerank 0 through 4, should say "at or below the active map's city label ceiling" instead.

`reduceTacticalCityOverlayLabelsByH3` keeps its signature. The test fixture that uses scalerank 5 and expects no label must use scalerank 7. Add an assertion that scalerank 6 is labeled under the default ceiling.

Do not regenerate naming JSON. Rank 7 is already in the naming files. Regional manifests pick up the new ceiling when they are rewritten.

## Sea rings

A water cell is still one with less than 1 km² of country land. After land, kilometre-reach sea, and neutral-border roles are assigned:

- `MIN_SEA_RINGS` is 2.
- Take the union of `h3.grid_disk` of depth 2 around every member cell.
- A candidate in that disk with no role yet becomes sea when it is water, or when it is non-member land whose `major_land_km2` is below 1.
- Do not walk a path. A major-land hex is simply not assigned a role. Water two hexes from member land is included even when a foreign coast sits between them.
- Do not require `in_box`. The centroid window must not clip this halo.

`major_land_km2` is the square kilometres of the cell covered by land polygons whose own area is at least one average strategic hex (`h3.average_hexagon_area`). Smaller polygons are minor islands and do not count. Reuse `overlap_km2`, including its antimeridian shift. Make the Mollweide area helper in `geography_regions.py` public and call it. Log once when the landmass index is built. Do not log per cell.

The test helper's `major_land_km2` defaults to a huge number, so existing land fixtures stay major.

Record `min_sea_rings` and `minor_island_max_km2` on the manifest's footprint rules. The app does not read those keys.

A sea hex passes the metadata sanity ratio when `all_water` or `intersects_water` is true. Keep the 80 percent warning. A warning does not fail the check command.

Footprint tests, with no dependency on `F:/Data`:

- With `sea_reach_km` 0, water at grid distance 1 and 2 is sea. The old test expected distance 1 to be absent. That expectation flips.
- Water at distance 3 stays out when the kilometre reach is 0.
- A long kilometre reach still includes water past ring 2.
- Major land in the disk is not sea. A minor-island cell (`land_km2 >= 1` and `major_land_km2` 0) is sea. An existing neutral-border cell stays a neutral border.
- An out-of-box water cell in the disk is sea.

Then run `python -m scripts.regional_pipeline.regional_cli footprint --all` without `--write`. Central America, Middle Africa South, Horn and Great Lakes, and Southern Asia East must report more than 0 sea hexes. Record the before and after counts in the results section below. Do not write manifests until the regeneration step.

## Regeneration

Committed artifacts are the `*.json.zip` files. Loose JSON under `data/generated/` is gitignored. Do not commit.

From the repository root, for every region:

1. `npm run regional:validate`
2. `npm run regional:footprint`
3. `python -m scripts.regional_pipeline.regional_cli run --region <id> --verbose` with no `--skip-existing`
4. `python -m scripts.regional_pipeline.regional_cli origins --all --force`
5. `npm run regional:check` and `npm run regional:report`
6. `npm run regional:zip`

If one region runs longer than 4 hours, stop and record which regions finished. A later run of that region must not pass `--skip-existing`.

`regional:check` must print no FAIL. Northern America's manifest `city_label_max` must be 7. In the app, Northern Europe naval units can move two hexes offshore, Central America starts with naval units, and the Colorado tactical battle in Northern America draws Pueblo as a city dot.

## Living docs

Update in place:

- [doc/combat-rules-v3.md](doc/combat-rules-v3.md) weather section
- [doc/ux/control-tooltips.md](doc/ux/control-tooltips.md), [doc/ux/new-game-dialog.md](doc/ux/new-game-dialog.md), [doc/ux/stack-callout.md](doc/ux/stack-callout.md)
- [doc/ai-commander-prompts/strategic-prompt.md](doc/ai-commander-prompts/strategic-prompt.md), [doc/ai-commander-prompts/tactical-prompt.md](doc/ai-commander-prompts/tactical-prompt.md), [doc/ai-commander-prompts/source-inventory.md](doc/ai-commander-prompts/source-inventory.md)
- [doc/region-summary-1.md](doc/region-summary-1.md) sea-ring lines
- [doc/terrain-pipeline.md](doc/terrain-pipeline.md)
- [scripts/regional_pipeline/README.md](scripts/regional_pipeline/README.md) footprint paragraph and the city column of the scalerank table

The README keeps the note that city labels used to skip rank 5, and says the global ceiling is now 6 so those two places are included.

## Results

Fill this in after the footprint dry run and the regeneration.

| Region | Sea hexes before | Sea hexes after |
| --- | --- | --- |
| australia_new_zealand | 98 | 145 |
| caribbean | 159 | 189 |
| central_america | 0 | 214 |
| central_asia | 9 | 11 |
| eastern_asia | 35 | 61 |
| eastern_europe | 39 | 77 |
| horn_and_great_lakes | 0 | 78 |
| libya_egypt_sudan | 26 | 47 |
| maghreb | 29 | 62 |
| middle_africa_north | 8 | 23 |
| middle_africa_south | 0 | 32 |
| northern_america | 52 | 84 |
| northern_europe | 75 | 155 |
| south_america | 80 | 163 |
| south_eastern_asia | 52 | 84 |
| southern_africa | 70 | 106 |
| southern_asia_east | 0 | 102 |
| southern_asia_west | 20 | 31 |
| southern_east_africa | 27 | 54 |
| southern_europe | 74 | 109 |
| west_africa_coast | 44 | 90 |
| western_asia_north | 25 | 48 |
| western_europe | 25 | 39 |

Land and neutral counts were unchanged. The four coasts that had no sea (central_america, middle_africa_south, horn_and_great_lakes, southern_asia_east) are above zero. Central Asia, which covers the Caspian, stayed on the water and gained two hexes.

Regeneration times (every region exited 0):

| Region | Time |
| --- | --- |
| western_europe | 12 min 30 sec |
| southern_europe | 13 min 37 sec |
| northern_europe | 19 min 13 sec |
| eastern_europe | 1 hr 24 min |
| northern_america | 14 min 38 sec |
| central_america | 17 min 14 sec |
| caribbean | 10 min 44 sec |
| south_america | 14 min 05 sec |
| maghreb | 10 min 45 sec |
| libya_egypt_sudan | 9 min 46 sec |
| west_africa_coast | 12 min 09 sec |
| middle_africa_north | 8 min 12 sec |
| middle_africa_south | 11 min 30 sec |
| horn_and_great_lakes | 13 min 36 sec |
| southern_east_africa | 11 min 29 sec |
| southern_africa | 11 min 01 sec |
| western_asia_north | 9 min 06 sec |
| central_asia | 13 min 38 sec |
| southern_asia_west | 11 min 53 sec |
| southern_asia_east | 13 min 35 sec |
| eastern_asia | 8 min 44 sec |
| south_eastern_asia | 7 min 33 sec |
| australia_new_zealand | 46 min 41 sec |

The first three times are the gap between pack-file timestamps. The rest are the timed rerun. No region exceeded 4 hours.

Check warnings: none. `check --all` exited 0 with no FAIL and no WARN. Central America's sea sanity line is "sea touches water 100%". Northern America's manifest `city_label_max` is 7, and Pueblo is stored at scalerank 7 in tactical cell `85268813fffffff`.

Origin assignment logged a caught H3 failure while filling Antarctica, once during South America and once during Australia and New Zealand. Both regions still wrote their side groups, and the pack check passed those groups.

In-app gates, using the same terrain classification and city-label reduction the match loads:

- Central America has 214 sea hexes, and every one classifies as water, so the opening naval unit has a spawn hex.
- Northern Europe has 82 sea hexes one step from member land and 154 two steps out. 149 of those outer hexes touch an inner sea hex, so a naval unit can spend its 2-hex move offshore.
- Northern America's city ceiling is 7. Tactical cell `85268813fffffff` is the only city in its cell, Pueblo, Colorado, and the overlay label is `Pueblo`. Its parent hex `82268ffffffffff` is in the footprint.
