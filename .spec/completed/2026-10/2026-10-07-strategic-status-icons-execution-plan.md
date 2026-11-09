# Strategic Status Icons Execution Plan

This is the execution plan. Do not put its phase numbers into product code, comments, tests, configuration, or docs.

## Locked decisions

- Strategic world zoom, match loaded, not in a battle, T not held: one weather icon, centered on the existing upper band. The anchor is the hex centroid, then `centroid.y - strategicOverlayBandOffsetPx(span)`. Shown when `weatherBonusEnabled === true` and the hex's `weather` is `mild`, `rain`, `snow`, or `heat`.
- Same view, T held: that weather icon is not drawn. One tech icon is drawn on the same anchor, at the same enlarged size. Shown when `techBonusEnabled === true` and `baselineUrbanHexCountForStrategicHex` is finite and greater than zero. The tier comes from `techLevelFromUrbanHexCount`. Do not hardcode 21. On the global map the cut is 21, so 20 is Basic and 21 is Advanced. A regional map uses that map's catalog threshold.
- Every qualifying world hex, including a hex with no production label. Hex codes, production labels, and build-entry buttons keep their current rules. Codes stay visible only while T is held.
- Both icons stay hidden when `tacticalBattleSnapshot` is set or `shouldRenderTacticalHexes()` is true. That covers a tactical battle and battle-detail zoom. Do not draw either icon on a tactical cell.
- Low and High use the same glyph. The level does not change the icon. Never draw both icons. Never draw a slash between them.
- Fog still deletes `weather` on unexplored hexes in `src/main/gameDb/fogState.ts`. Do not change that file. Do not add an explored test in the icon helper or the drawer. A hex with a weather word shows the weather icon. A hex without one does not. Tech is not hidden by fog.
- Size is the current 10 or 11, times 1.5, with no rounding. A build button, an infrastructure glyph, or a unit on the hex keeps the smaller base, so the drawn size is 15. A plain hex is 16.5. A hex with no production label uses the canvas base, so only infrastructure or a unit selects 15.
- The anchor does not move. Weather now shares the map with airport and seaport glyphs (those sit `0.14 * span` above the center; this icon stays `0.24 * span` above it) and with unit tokens, which are painted later. Do not hide infrastructure, units, or labels to clear space. Do not change `STRATEGIC_OVERLAY_BAND_OFFSET_SPAN_FRAC`.
- Icons still have no tooltip of their own. The hex tooltip still appears on hover. Do not change `src/renderer/map/terrainTooltipHtml.ts` or `doc/ux/hex-tooltips.md`. The map icons no longer follow the tooltip's "show both" rule.
- Do not special-case resolution playback, New game, Game over, or the tactical battles list. No game state, a tactical battle, and battle-detail zoom are the only suppressors. Typing in a field already ignores T. Leave that alone. Blur and key release already clear `hideTerrainFillWhileHeld` in `src/renderer/map/initCore.ts`. Do not add a second blur path.

## Rules the implementer must follow

- Work the phases in order. Each phase ends with its own verify step. Later phases must keep earlier tests green.
- No phase, plan, or workflow identifiers in code, comments, tests, configuration, or docs.
- Orienting comments (Purpose, When to use, Expected outcome, Exceptions) on every new or changed field and non-overriding method. Shared and renderer code do not log.
- At most 6 named parameters. Keep the logic in `src/shared/inspectionStatusIconLine.ts` and `src/renderer/rendering/inspectionStatusIcons.ts`. Do not add a function to a file already over 600 lines. Both files are under that line. If either would pass 600, stop and split before adding more.
- Tests cover the happy path and the essential failures listed below. Do not add cases for the slash, for drawing both icons, or for pixel output.
- Never commit or push. Do not hand-edit `static/renderer.js`. The running app keeps the old bundle until Phase 4. Do not judge the feature from `npm start` before that phase.
- Do not add viewport culling. The infrastructure overlay already projects every strategic hex each frame. This drawer keeps walking `state.hexes`.
- `npm test` compiles shared tests into `dist/shared` and runs those files. `npx tsx` is not installed. Use the verify commands below.
- Do not run `dump:renderer-types-baseline`. A new type error is a failure, not a baseline update.

## Phase 1 — Choose one icon

Change `inspectionStatusIconsForHex` in `src/shared/inspectionStatusIconLine.ts`.

Remove `productionSurface` from `InspectionStatusIconInput`. Add:

- `mapInspectionHeld: boolean`
- `weatherBonusEnabled: boolean`

Replace `InspectionStatusIconLine` with a single-icon result, `InspectionStatusIcon | null`:

- `{ readonly kind: 'tech'; readonly level: TechLevel }`
- `{ readonly kind: 'weather'; readonly state: WeatherState }`

The two shapes cannot be combined, so a later change cannot draw both icons by filling two fields.

- `mapInspectionHeld` and tech bonus on, finite urban count above zero: `{ kind: 'tech', level: techLevelFromUrbanHexCount(count) }`.
- Not held, weather bonus on, and `weather` is one of the four known words: `{ kind: 'weather', state }` using that word. An unknown word, including `'fog'`, is null. Do not treat an unknown word as Mild.
- Every other input returns null. That includes either bonus off, urban count `0`, negative, or non-finite, tech data while T is not held, and weather data while T is held.

Do not change the body of `strategicProductionLabelSurface` or the expectations in the test `'a production label is a button, a canvas line, or absent'`. Update that function's purpose comment and that test's purpose comment so they describe the production label only. They must not say the icon row is limited to those hexes. The surface helper is still how labels and the 10-versus-11 base are chosen.

Rewrite the test `'tech and weather icons follow the hex tooltip omissions'`. Rename it so the name describes one icon per hold state. Cover these results and no others:

- Held, tech on, count 21, weather `'heat'`, weather bonus on: `{ kind: 'tech', level: 'advanced' }`.
- Held, tech on, count 20, weather null, weather bonus off: `{ kind: 'tech', level: 'basic' }`.
- Held, tech off, count 21, weather `'heat'`, weather bonus on: `null`.
- Held, tech on, count 0, weather `'mild'`, weather bonus on: `null`.
- Held, tech on, count `Number.NaN`, weather null, weather bonus off: `null`.
- Held, tech on, count -1, weather `'snow'`, weather bonus on: `null`.
- Not held, weather bonus on, weather `'heat'`, tech on, count 21: `{ kind: 'weather', state: 'heat' }`.
- Not held, weather bonus off, weather `'heat'`, tech on, count 21: `null`.
- Not held, weather bonus on, weather `'fog'`, tech on, count 21: `null`.
- Not held, weather bonus on, weather null, tech on, count 21: `null`.

The counts 20 and 21 are valid only because the test process uses the global map. The selector still calls `techLevelFromUrbanHexCount`.

Leave the slash, `inspectionStatusIconFontPx`, and the drawer's `!isMapInspectionModeHeld()` return for Phase 2. Update the module comment and the helper comment. They must not say that the icon row and the hex tooltip share one rule, and they must not say the row is limited to hexes with a production label.

In `drawInspectionStatusIcons`, stop passing `productionSurface` into the selector. Pass `mapInspectionHeld: isMapInspectionModeHeld()`, `weatherBonusEnabled: state.weatherBonusEnabled === true`, and `techBonusEnabled: state.techBonusEnabled === true`. Keep the early return and the `productionSurface === 'none'` skip for this phase, so the file still compiles. Because of that return, this phase does not yet paint weather while T is not held. The old `{ tech, weather }` fields are gone, so this call must read `kind` before it can paint. Until Phase 2 it may keep painting through the old group function by mapping `kind: 'tech'` to the tech slot and `kind: 'weather'` to the weather slot, with the other slot null.

Verify:

```
npm run build:main
node --test dist/shared/inspectionStatusIconLine.test.js
npm run check:renderer-types
```

## Phase 2 — Draw weather at rest and the larger tech icon while T is held

In `src/shared/inspectionStatusIconLine.ts`, add `inspectionStatusIconDrawPx`. It takes the same input as `inspectionStatusIconFontPx` and returns that result times 1.5. Name the factor once, next to the function. Do not round.

Keep the existing test that expects 10 and 11 from `inspectionStatusIconFontPx`. Add one test that expects 15 when the surface is `'button'` or the hex has infrastructure or a unit, and 16.5 when the surface is `'canvas'` with neither.

In `drawInspectionStatusIcons`:

- Return immediately when there is no game, `tacticalBattleSnapshot` is set, or `shouldRenderTacticalHexes()` is true. Delete the `!isMapInspectionModeHeld()` check from that return.
- Still call `strategicProductionLabelSurface` for the size base. Do not skip a hex because the surface is `'none'`. Pass `'canvas'` into the font input in that case. Skip only when the selector returns null, the boundary has no points, or the map is missing.
- Draw one image, centered on the band anchor, at `inspectionStatusIconDrawPx`. `kind: 'tech'` uses `techInspectionIconAssetPath(level)`. `kind: 'weather'` uses `weatherInspectionIconAssetPath(state)`. Replace `drawIconGroup` with that one centered draw. Delete the slash painter, `INSPECTION_STATUS_ICON_SLASH_TEXT`, and `inspectionStatusSlashIsBold`. In the test `'the band offset, slash text, and icon paths stay fixed'`, delete the slash assertion and keep the offset and asset-path assertions. Delete the test `'the slash is bold on a human hex with capacity'`.
- `getUrbanProductionCapacityForHex` is only used for the slash weight. Remove that call if nothing else in this file needs it. Keep the controller and urban-production reads that `strategicProductionLabelSurface` needs.
- Update the file comment and `drawInspectionStatusIcons` comment. Weather is drawn while T is not held. Tech replaces it while T is held. Neither is limited to production-label hexes.

Leave both `drawInspectionStatusIcons` calls in `src/renderer/rendering/gameScene.ts` where they are, immediately after `drawStrategicInspectionHexCodes`. The tactical branch stays. The drawer returns before painting when a battle snapshot is set. The source test `'both scene passes draw the icon row after the hex codes'` stays green. Do not change draw order relative to units or infrastructure.

Verify:

```
npm run build:main
node --test dist/shared/inspectionStatusIconLine.test.js
npm run check:renderer-types
npx eslint src/shared/inspectionStatusIconLine.ts src/shared/inspectionStatusIconLine.test.ts src/renderer/rendering/inspectionStatusIcons.ts
```

A search of `src/` finds no `INSPECTION_STATUS_ICON_SLASH_TEXT` and no `inspectionStatusSlashIsBold`. `static/renderer.js` still has the old names until Phase 4.

## Phase 3 — Player-facing docs

Update every sentence that still describes a combined tech-and-weather line. Do not edit `doc/ux/hex-tooltips.md`. Do not edit the Code Entry Points list in `doc/ux/map-surface.md`.

In `doc/ux/map-surface.md`, replace the information bullet that starts "While T is held on the strategic map" with these two bullets:

- While T is held on the strategic map, and the view is not at battle-detail zoom, each visible world hex shows its code and a production label. The label is the dollars-per-turn line, or the build marker when that marker is already showing.
- On the strategic map, outside a battle and outside battle-detail zoom, one icon sits on the band above the hex center. While T is not held, the icon is that hex's weather, when the weather bonus is on and the hex has weather. While T is held, the icon is that hex's tech tier, when the tech bonus is on and the hex's original urban count can produce units. The two icons are the same size, one and a half times the height of that hex's production text. The icon is centered. It is left out when it does not apply. These icons have no tooltip of their own. The hex tooltip still appears on hover.

Replace the keyboard bullet that starts "When the player holds T" with:

- When the player holds T, terrain fill hides until release or blur. On the strategic map, outside battle-detail zoom, the hex codes stay up for that same hold, and the weather icon is replaced by the tech icon. Release or blur restores the fill, removes the codes, and restores the weather icon.

Replace the state "Terrain fill hidden" with:

- Terrain fill hidden: T is held. On the strategic map, outside battle-detail zoom, hex codes are shown, and the tech icon replaces the weather icon.

Replace the invariant that starts "The tech and weather line" with:

- The weather icon appears on the strategic map outside a battle and outside battle-detail zoom, while T is not held, on each world hex that has weather while the weather bonus is on. The tech icon replaces it on that same band while T is held, on each world hex whose original urban count can produce units, while the tech bonus is on. Neither icon appears in a battle or at battle-detail zoom.

Replace the Held T strategic cell with:

Hides terrain fill. Outside battle-detail zoom, shows hex codes and replaces the weather icon with the tech icon.

In `doc/ux/input-map.md`, replace the T result cell with:

Hides terrain fill while held. On the strategic map, outside battle-detail zoom, also shows hex codes and replaces the weather icon with the tech icon. Restores the fill, removes the codes, and restores the weather icon on release.

Replace the window-blur bullet with:

- Window blur stops keyboard pan, clears the held-Shift flag, and, if T was held, restores terrain fill, removes the hex codes, and restores the weather icon.

Replace the "Holding T" bullet with:

- Holding T is a deliberate inspection gesture. Terrain fill stays hidden while the key is down. On the strategic map, outside battle-detail zoom, the hex codes stay up and the tech icon replaces the weather icon, when [map-surface.md](map-surface.md) says they are shown. Releasing the key restores the fill, removes the codes, and restores the weather icon. Window blur does the same.

Verify: a search of `doc/` finds no "tech and weather line". `doc/ux/hex-tooltips.md` has no diff. The production-label and hex-code sentences still say those marks follow the old rules.

## Phase 4 — Bundle and manual check

Run `npm test`, then `npm run build:renderer`. Do not edit `static/renderer.js` by hand.

Manual check:

- Both bonuses on, T not held: weather icons sit on the upper band of world hexes that have weather, including a hex with no production label. Holding T hides those icons and shows only the larger centered tech icons on hexes that can produce units. Release brings the weather icons back and removes the codes.
- Tech off: holding T shows codes and no tech icon.
- Weather off: T not held shows no weather icon.
- A tactical battle and battle-detail zoom show neither icon.
- With fog on, an unexplored hex shows no weather icon.
- Airport and seaport glyphs, unit tokens, production labels, and build buttons are still where they were. The icon anchor is unchanged.
