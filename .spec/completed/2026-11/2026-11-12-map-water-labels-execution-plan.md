# Map Water Labels Implementation Plan

> **For agentic workers:** Work the phases in order and finish each phase's verification before starting the next. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not commit or push at any point** (`.cursor/rules/11-no-commit-or-push.mdc`). The user reviews all changes first.

**Goal:** Name oceans, seas, gulfs, bays, straits, channels, and large lakes on the map. Water names follow the same zoom tiers, size tests, and collision rules as continent, country, and state names. They are drawn in an italic face and a quiet blue ink that fits each map theme, and they give way to land names.

**Architecture:** The place-name document `map_labels` gains three water kinds. The Python pipeline writes them from the Natural Earth marine-names and lakes shapefiles. The TypeScript side extends the existing pure modules under `src/shared/`, where `node:test` checks every rule. Water names choose anchors with `chooseMapLabelAnchors`, which does not drop a same-kind overlap. A new pure module, `src/shared/mapWaterLabelPlacement.ts`, then places those names after the land names are final. The canvas layer `src/renderer/map/mapLabelLayer.ts` only wires these together and keeps per-frame memory.

**Tech stack:** TypeScript, Canvas 2D, `node:test`, Python 3 with `fiona` and `shapely`, `unittest`. There are no new npm or Python dependencies. Four vendored font files are added.

**Spec:** The Requirements section below.

## Requirements

These come from the user's request and answers.

| # | Area | Required result |
| --- | --- | --- |
| R1 | Sources | Water names come from `ne_10m_geography_marine_polys.shp` (oceans, seas, gulfs, bays, straits, channels) and `ne_10m_lakes.shp`. Sounds, fjords, lagoons, inlets, reefs, rivers, and unnamed `generic` records are not used. |
| R2 | Zoom tiers | Water names mirror the land tiers. World view (below zoom 4, not the detail view): oceans, beside continents. Zoom 4 and above, not the detail view: oceans and major water, beside continents and countries. Detail view: major and minor water, beside countries and states. |
| R3 | Size and zoom | Oceans ignore their minimum zoom, the same way continents do, so all seven can show at zoom 2–3. A non-narrow major water body waits one zoom level past its Natural Earth minimum and needs a 40 px inscribed radius. A non-narrow minor water body may appear from `LABEL_MIN_ZOOM_SLACK` below its minimum and needs the same radius. A strait or channel uses only a two-level delay. It does not also take the one-level delay or the radius test. |
| R4 | Typeface | Each theme's own family (sans or serif), italic, weight 400. Each theme has its own water ink that reads quieter than its land ink and is set apart from it by color. |
| R5 | Collisions | Land names are placed exactly as today. A water name that would meet any land name or an earlier water name moves up to 36 px to a clear spot. If it finds none, it is not drawn. Same-kind water names get that move too. They are not dropped before the move is tried. |
| R6 | Frame cap | At most 40 water names are drawn in one frame. The cap counts names that found a clear spot. Candidates are considered in placement order: ocean, then major water, then minor water, then rank, minimum zoom, larger radius, then id. Once 40 are drawn, later names are not tried. A busy detail view may omit a later minor name. |

### Why these rules, from the shipped data

These numbers were measured from the shapefiles in `F:/Data` and the pipeline's own projection and `polylabel` helpers. Do not re-derive them or substitute other fields.

- `ne_10m_ocean.shp` is one unnamed polygon. It cannot supply names. Every ocean name comes from the marine-names file, whose `featurecla` is `ocean` for 7 records. The Pacific and Atlantic are each split into a north and a south record.
- **Marine fields.** `name_en` is the English name ("Gulf of Lion", not "Golfe du Lion"). `name` is upper case for two oceans ("SOUTHERN OCEAN", "INDIAN OCEAN"). Use `name_en`, falling back to `name`. Both Pacific records then read "Pacific Ocean", and both Atlantic records read "Atlantic Ocean". Two "PACIFIC OCEAN" labels in two hemispheres is normal map practice. Rank is `scalerank` (0–9). Minimum zoom is `min_label` (1.0–7.8). The file has no label point, so the anchor is computed.
- **Lake fields.** `name` is the full name ("Lake Superior"). `name_en` drops the word "Lake" ("Superior", and "Nyanza" for Lake Victoria). Use `name`, falling back to `name_en`. Rank is `scalerank`. Minimum zoom is `min_label` (3.0–8.0). Named lakes with `scalerank` 7 to 9 are small (minimum zoom 6.7 and above). They are left out.
- **Tiers.** Major water is marine `scalerank` 0–2 that is not an ocean (83 records with the lakes below), for example the Mediterranean, the Black Sea, the Caspian Sea, the Gulf of Mexico, Hudson Bay, the North Sea, the Baltic Sea, and the Bay of Biscay. It also includes lakes of `scalerank` 0–1, which are the Great Lakes, Baikal, Victoria, Ladoga, Tanganyika, Malawi, Titicaca, and similar. Everything else kept is minor water (about 490 records).
- **Thin bodies.** Natural Earth draws straits and channels as slivers. Their inscribed radius is tiny: Strait of Gibraltar about 5 km, Drake Passage about 8 km, Luzon Strait about 2 km, Bosporus about 9 km. A 40 px radius test would not name Gibraltar until zoom 10.2. Straits and channels therefore skip the radius test and wait two zoom levels past their minimum. That gives Gibraltar 7.7, Bosporus 8.0, Dardanelles 9.6, Drake Passage 6.0, and English Channel 7.0.
- **Where the 40 px test lands** (zoom at which the primary anchor reaches 40 px): Mediterranean 4.25, Black Sea 4.44, Caspian Sea 4.79, Baltic Sea 4.82, Persian Gulf 5.23, Red Sea 5.31, Irish Sea 6.03, Lake Superior 5.78, Lake Ladoga 5.77, Lake Victoria 6.17, Lake Baikal 6.74, Lake Tanganyika 7.51, Adriatic Sea 5.55, Aegean Sea 5.87, Ligurian Sea 6.35. Lake Geneva and Lake Balaton reach it only near zoom 9.5.
- **Inks.** Contrast against each theme's `waterColor`, measured with the WCAG formula: Standard `#2a5676` 4.38:1, Topographic `#1f5a80` 4.87:1, Nautical `#3d6a8a` 5.02:1, Night `#8fb0c9` 7.71:1. Each is lower than that theme's land ink on the same water (5.94, 7.16, 11.69, 12.85), so water names read quieter than land names.

### Expected results

| View | Expected water names |
| --- | --- |
| World view, zoom 2–3 | ARCTIC OCEAN, ATLANTIC OCEAN (north and south), PACIFIC OCEAN (north and south), INDIAN OCEAN, SOUTHERN OCEAN, each where its anchor is in view and no land name blocks it. No seas. |
| Europe, zoom about 5.25 | *Mediterranean Sea*, *Black Sea*, *Caspian Sea*, *Baltic Sea*, *North Sea*, and *Bay of Biscay*, plus ATLANTIC OCEAN when its anchor is in view. No Adriatic and no Gibraltar. |
| Detail view over Italy, zoom about 7 | *Adriatic Sea*, *Tyrrhenian Sea*, *Ionian Sea*, and *Ligurian Sea*, plus the major seas still in view. No oceans. |
| Detail view over the Strait of Gibraltar, zoom 8 | *Strait of Gibraltar*, unless SPAIN, MOROCCO, or a state name leaves no clear spot within 36 px. |
| Detail view over East Africa, zoom about 7 | *Lake Victoria*. *Lake Tanganyika* from about 7.5. |

## Global Constraints

- Never commit or push.
- Every new or changed field, function, constant, and type needs an orienting comment in the file's existing style. TypeScript uses `Purpose / When to use / Expected outcome / Exceptions`, and interface fields add `Contract`. Python uses the `Why this exists / When to use / What to expect / Exceptions` docstring (`04-orienting-comments.mdc`). Update comments whose stated numbers, kinds, or counts change ("three place-name kinds", "continent, country, or state").
- Never write "Phase", "R1", or any other identifier from this plan in code, comments, or `doc/` (`12-no-plan-identifiers.mdc`).
- Source files should stay under 600 lines, with a hard limit of 1000 (`09-file-size-limits.mdc`). Functions take at most 6 arguments (`10-argument-limits.mdc`). If a file you edit passes 600 lines, stop and split it along the lines this plan already uses before continuing.
- Tests cover contracts only (`03-testing-standards.mdc`). Add only the tests listed. Do not change existing land-label tests except where a step says so.
- Land-label behavior must not change. That covers `visibleLabelKinds`, `adminBorderGroupsForView`, `nudgeBroadLabels` results, land sizes, land colors, and land opacity. The existing land tests are the regression check, and they must pass unchanged in every phase.
- New JSON string values (`ocean`, `major_water`, `minor_water`, `narrow`, the `marine:` and `lake:` id prefixes) are frozen once written (`doc/naming-conventions-contract-v1.md`). Spell them exactly as written here.
- `static/renderer.js` is a tracked build output. Rebuilding it is expected. Never edit it by hand.
- Do not regenerate any vector document except `map_labels`, and regenerate it only in Phase 4, Step 6. Never run `vector_cli all`.

## Review Focus

1. **Old data, new code.** After Phase 3 the app must run against the current `map_labels.json.zip`, which has no water kinds, and look exactly as it does today. Verify in Phase 3.
2. **New data, old parser.** The parser rejects unknown kinds and throws away the whole document. The parser must accept water kinds (Phase 1) before the zip is regenerated (Phase 4). Never reorder those phases.
3. **Anchor memory with two passes.** The layer deletes remembered anchors whose feature is not a candidate. With a land pass and a water pass, that cleanup must use the union of both candidate sets, or each pass erases the other's memory and names hop. Verify in Phase 3.
4. **Water never moves land.** Water placement runs after `nudgeBroadLabels` and treats every land label as fixed. Verify in Phase 2.
5. **Thin bodies.** A strait or channel must not be dropped by the radius test, and it must not appear before its delayed zoom. Verify in Phase 1.
6. **Same-kind water names still get a nudge.** `placeMapLabels` drops a second label of the same kind. Water must use `chooseMapLabelAnchors`, which keeps both, and then `settleWaterLabels`. Verify in Phase 2.
7. **Renderer type check stays green.** Widening `MapLabelKind` makes `theme.labelColors[label.kind]` a new error. `npm run check:renderer-types` fails on any error that is not already in the baseline. Do not refresh that baseline. Water inks and `labelPaintColors` land in Phase 1, in the same phase as the wider kind.

## File Map

| File | Change |
| --- | --- |
| `src/shared/mapLabelRules.ts` | Water kinds, `isWaterLabelKind`, `visibleWaterLabelKinds`, water constants, `fontStyle` on the style table, water rows, water opacity |
| `src/shared/mapLabelPack.ts` | Accept water kinds, read the optional `narrow` flag |
| `src/shared/mapLabelPlacement.ts` | Water branches in `labelFeatureIsCandidate`, water kind order, `chooseMapLabelAnchors` |
| `src/shared/mapLabelBoxes.ts` (only if placement passes 600 lines) | `LabelBox`, `centeredBoxesMeet`, `insideInset` |
| `src/shared/mapLabelNudge.ts` | Export the shift-grid builder with a maximum-distance argument |
| `src/shared/mapWaterLabelPlacement.ts` (new) | `settleWaterLabels` |
| `src/shared/mapThemes.ts` | `waterLabelColors` on each theme, `labelPaintColors` |
| `src/renderer/map/mapLabelLayer.ts` | Water pass, memory, italic font, paint colors, font loading |
| `static/mapFonts.css`, `static/fonts/` | Four italic 400 faces |
| `src/shared/mapLabelPack.test.ts` (new), `src/shared/mapLabelPlacement.test.ts`, `src/shared/mapLabelRules.test.ts`, `src/shared/mapWaterLabelPlacement.test.ts` (new), `src/shared/mapThemes.test.ts` | Contract tests |
| `scripts/basemap_pipeline/vector_settings.py` | Water constants |
| `scripts/basemap_pipeline/label_anchors.py` | Shared helpers made public, including `label_number` and `label_text`. `build_label_document` moves out |
| `scripts/basemap_pipeline/water_label_anchors.py` (new) | Marine and lake loaders |
| `scripts/basemap_pipeline/label_document.py` (new) | `build_label_document`, now including water |
| `scripts/basemap_pipeline/vector_cli.py` | Import `build_label_document` from its new module |
| `scripts/basemap_pipeline/tests/test_water_label_anchors.py` (new) | Pipeline contract tests |
| `data/generated/basemap/vectors/map_labels.json.zip` | Regenerated |
| `doc/ux/map-surface.md`, `doc/README.md`, `doc/terrain-pipeline.md`, `doc/ui-style-guide.md` (only if it describes map label type), `scripts/basemap_pipeline/README.md`, `THIRD-PARTY-NOTICES.md` | Documentation |

## Test Commands

TypeScript, in every phase that changes `src/`. `FILE` is the test named in the step:

```text
npm run build:main
node dist/shared/FILE.test.js
```

`build:main` must succeed before a test run means anything. A TypeScript error counts as a failed step.

Python, in Phase 4:

```text
python -m unittest scripts.basemap_pipeline.tests.test_water_label_anchors -v
npm run basemap:test
```

---

## Phase 1: Water Kinds, Rules, and Parsing (R2, R3)

Pure TypeScript. No visible change: the shipped document has no water features yet, so every new branch is idle in the app.

- [ ] **Step 1: Extend the kind type in `src/shared/mapLabelRules.ts`**

  Replace the single union with three types. Keep the name `MapLabelKind` for the full set, so existing imports keep compiling.

  ```ts
  export type MapLandLabelKind = 'continent' | 'country' | 'state';
  export type MapWaterLabelKind = 'ocean' | 'major_water' | 'minor_water';
  export type MapLabelKind = MapLandLabelKind | MapWaterLabelKind;
  ```

  Comment each one. `MapWaterLabelKind` explains the tiers: `ocean` sits with continents, `major_water` with countries, `minor_water` with states. Lakes may be major or minor.

  Add:

  ```ts
  export const WATER_LABEL_KINDS: readonly MapWaterLabelKind[] = ['ocean', 'major_water', 'minor_water'];
  export function isWaterLabelKind(kind: MapLabelKind): kind is MapWaterLabelKind {
    return (WATER_LABEL_KINDS as readonly string[]).includes(kind);
  }
  ```

  Change the declared return type of `visibleLabelKinds` to `MapLandLabelKind[]`. Its body and its tests stay the same. Borders read it, so it must never return a water kind. Say that in its comment.

- [ ] **Step 2: Add the water tier function**

  Put it directly after `visibleLabelKinds` and mirror its shape:

  ```ts
  export function visibleWaterLabelKinds(zoom: number, tacticalView: boolean): MapWaterLabelKind[] {
    if (tacticalView) return ['major_water', 'minor_water'];
    if (zoom < COUNTRY_LABEL_MIN_ZOOM) return ['ocean'];
    return ['ocean', 'major_water'];
  }
  ```

- [ ] **Step 3: Add the water constants**

  Place them beside the land constants, each with an orienting comment that names the symbol it mirrors:

  | Constant | Value | Meaning |
  | --- | --- | --- |
  | `WATER_LABEL_ZOOM_DELAY` | `1` | Levels past a major water body's minimum zoom before its name appears. Mirrors `COUNTRY_LABEL_ZOOM_DELAY`. Define it as its own literal, not as an alias. |
  | `WATER_LABEL_MIN_RADIUS_PX` | `40` | On-screen inscribed radius a major or minor water body needs. Mirrors `STATE_LABEL_MIN_RADIUS_PX`. Its own literal. |
  | `NARROW_WATER_ZOOM_DELAY` | `2` | Levels past a strait's or channel's minimum zoom before its name appears. It replaces both the radius test and the slack for those bodies. |
  | `WATER_LABEL_OPACITY` | `1` | Fill opacity for every water kind in every view. The ink color does the quieting. |

  Minor water reuses `LABEL_MIN_ZOOM_SLACK`. Add a sentence to that constant's comment saying it also applies to minor water.

- [ ] **Step 4: Add the italic style field and the water rows**

  Add a field to `MapLabelKindStyle`:

  ```ts
  /**
   * Font style keyword.
   *
   * Expected outcome: `normal` for land names. `italic` for water names, the usual mark of a water body.
   */
  readonly fontStyle: 'normal' | 'italic';
  ```

  Give each existing land row `fontStyle: 'normal'` and leave its other values alone. Add three rows:

  | Kind | `sizePx` | `weight` | `fontStyle` | `letterSpacingEm` | `haloWidthPx` | `uppercase` |
  | --- | --- | --- | --- | --- | --- | --- |
  | `ocean` | 12 | 400 | italic | 0.3 | 2 | true |
  | `major_water` | 9.75 | 400 | italic | 0.06 | 1.5 | false |
  | `minor_water` | 8.25 | 400 | italic | 0.04 | 1 | false |

  `weight`'s type stays `400 | 600`. Update the table's comment to list the water rows. Also update the comments that would become false: `sizePx` gains 12, 9.75, and 8.25, the weight contract includes water at 400, and the uppercase contract includes oceans. `mapLabelStyleForView` returns the table row for every water kind and needs no new branch. Say so in its comment. `labelDisplayText` already upper-cases by row, so ocean names become capitals with no other change.

- [ ] **Step 5: Water opacity**

  In `labelKindOpacity`, add a first line: `if (isWaterLabelKind(kind)) return WATER_LABEL_OPACITY;`. Update its comment.

- [ ] **Step 6: Parse water kinds and the `narrow` flag in `src/shared/mapLabelPack.ts`**

  - Change `LABEL_KINDS` to the six kinds: `['continent', 'country', 'state', 'ocean', 'major_water', 'minor_water']`.
  - Add a field to `MapLabelFeature`:

    ```ts
    /**
     * Whether the body is a strait or channel, too thin for the radius test.
     *
     * Contract: True only for water kinds whose document record has `"narrow": true`. False when the field is absent.
     * When to use: `labelFeatureIsCandidate`.
     * Expected outcome: A boolean.
     * Exceptions: None.
     */
    readonly narrow: boolean;
    ```

  - In `parseFeature`, read it as `narrow: value.narrow === true`. Anything other than `true` is `false`. Do not throw on a missing field, because land records never carry it.
  - Update the comments that list kinds and id prefixes. Ocean and marine ids start with `marine:`, lakes with `lake:`. Also update the comment on the pack's feature order: continents, countries, states, then water.

- [ ] **Step 7: Water branches in `labelFeatureIsCandidate` (`src/shared/mapLabelPlacement.ts`)**

  Add the water kinds to `KIND_ORDER` after `state`: `ocean: 3, major_water: 4, minor_water: 5`. Then replace the body of `labelFeatureIsCandidate` so each kind has one readable line, the land lines unchanged:

  ```ts
  if (!kinds.includes(feature.kind)) return false;
  switch (feature.kind) {
    case 'continent':
    case 'ocean':
      return true;
    case 'country':
      return feature.minZoom + COUNTRY_LABEL_ZOOM_DELAY <= zoom;
    case 'state':
      return feature.minZoom <= zoom + LABEL_MIN_ZOOM_SLACK && coversRadius(feature, zoom, STATE_LABEL_MIN_RADIUS_PX);
    case 'major_water':
      if (feature.narrow) return feature.minZoom + NARROW_WATER_ZOOM_DELAY <= zoom;
      return feature.minZoom + WATER_LABEL_ZOOM_DELAY <= zoom && coversRadius(feature, zoom, WATER_LABEL_MIN_RADIUS_PX);
    case 'minor_water':
      if (feature.narrow) return feature.minZoom + NARROW_WATER_ZOOM_DELAY <= zoom;
      return feature.minZoom <= zoom + LABEL_MIN_ZOOM_SLACK && coversRadius(feature, zoom, WATER_LABEL_MIN_RADIUS_PX);
  }
  ```

  Add the private helper `coversRadius(feature, zoom, minPx)`, which returns `largestAnchorRadiusM(feature) / mercatorMetersPerPixel(zoom) >= minPx`, with an orienting comment. The `switch` must be exhaustive. If TypeScript reports a missing return, fix the cases. Do not add a `default`. Update the function's comment to describe every kind.

- [ ] **Step 8: Tests**

  Add these tests, and only these.

  - `src/shared/mapLabelRules.test.ts`: `visibleWaterLabelKinds` returns `['ocean']` at zoom 3, `['ocean', 'major_water']` at zoom 5, and `['major_water', 'minor_water']` in a tactical view. `mapLabelStyleForView` gives an ocean italic 12 px capitals, major water 9.75 px, and minor water 8.25 px. `labelKindOpacity('minor_water', 7, true)` is `WATER_LABEL_OPACITY`.
  - `src/shared/mapLabelPack.test.ts` (new, with a `describe` and the orienting comments the other test files use): a document with one `major_water` feature and `"narrow": true` parses with `narrow === true`. A `state` feature without the field parses with `narrow === false`. A feature of kind `"river"` throws `/kind/`.
  - `src/shared/mapLabelPlacement.test.ts`, using the file's existing feature builders (add a `water(kind, radiusM, minZoom, narrow)` builder beside them):
    - Radius test: a `major_water` feature with minimum zoom 2 and radius 330,000 m (the Mediterranean) is not a candidate at zoom 4.0 and is at zoom 4.3. The radius reaches 40 px at about 4.25.
    - Zoom delay: a `major_water` feature with minimum zoom 4 and radius 2,000,000 m, large enough at any zoom, is not a candidate at zoom 4.9 and is at zoom 5.0.
    - A narrow `minor_water` feature with radius 5,000 m and minimum zoom 5.7 is not a candidate at 7.6 and is at 7.7.
    - A non-narrow `minor_water` feature with radius 5,000 m and minimum zoom 5.7 is not a candidate at 8.
    - An `ocean` feature is a candidate in `['ocean']` at zoom 1, and not in `['major_water', 'minor_water']`.
  - In `named()` in `src/shared/mapLabelPlacement.test.ts`, set `narrow: false` so the existing land tests still compile. Do not change their assertions. The `water` builder sets `narrow` from its argument.

- [ ] **Step 9: Water inks and the paint lookup**

  `mapLabelRules.ts` does not import `mapThemes.ts`. Keep it that way.

  Add `MapThemeWaterLabelColors` beside `MapThemeLabelColors` in `src/shared/mapThemes.ts`, and `readonly waterLabelColors` on `MapTheme` right after `labelColors`. Fill each theme:

  | Theme | `ink` | `halo` |
  | --- | --- | --- |
  | standard | `#2a5676` | `rgba(163, 199, 223, 0.8)` |
  | topographic | `#1f5a80` | `rgba(166, 217, 239, 0.8)` |
  | nautical | `#3d6a8a` | `rgba(227, 241, 248, 0.8)` |
  | night | `#8fb0c9` | `rgba(15, 26, 38, 0.8)` |

  The halo's RGB is the theme's `waterColor`. Do not change any existing color.

  Add `labelPaintColors(theme, kind)`. A water kind returns the water ink and halo. A land kind returns `theme.labelColors[kind]` and `theme.labelColors.halo`. Import `isWaterLabelKind` and `MapLabelKind` from `./mapLabelRules`.

  In `paintLabel` in `src/renderer/map/mapLabelLayer.ts`, replace the two `theme.labelColors` reads with `labelPaintColors`. For a land kind the fill and halo stay the colors they are today. Do not refresh `scripts/renderer-typecheck-baseline.json`.

- [ ] **Step 10: Theme test**

  In `src/shared/mapThemes.test.ts`, add one `it` block: for every theme, `labelPaintColors(theme, 'country')` returns that theme's country fill and its land halo. The water ink's contrast against `waterColor` is at least 4:1, and that contrast is lower than the land ink's contrast against `waterColor`. The ink's blue channel is greater than its red channel. Compute contrast with the file's existing `relativeLuminance` (`(L1 + 0.05) / (L2 + 0.05)`, lighter over darker). The file already parses `#rrggbb`. Add a small parser for `rgb(r, g, b)` water colors only if the file has none.

- [ ] **Step 11: Verify**

  Run `npm run build:main`, then `node dist/shared/mapLabelRules.test.js`, `node dist/shared/mapLabelPack.test.js`, `node dist/shared/mapLabelPlacement.test.js`, `node dist/shared/mapLabelNudge.test.js`, `node dist/shared/mapThemes.test.js`, and `node dist/shared/adminBorderRules.test.js`. Expected: all pass, with every pre-existing test unchanged. Then run `npm run check:renderer-types`. Expected: exit 0. A new `labelColors` index error is a failed step, not an expected one.

---

## Phase 2: Water Placement Pass (R5)

Pure TypeScript, testable without the app.

- [ ] **Step 1: Share the shift grid (`src/shared/mapLabelNudge.ts`)**

  Rename the private `buildNudgeOffsets()` to an exported `labelNudgeOffsetsWithin(maxPx: number): LabelNudge[]`. It returns every multiple of `LABEL_NUDGE_STEP_PX` (12) whose length is at most `maxPx`, nearest first, sorted by `compareNudgeOffsets` as today. 36 divides 12, so a max of 36 includes `{0, -36}`. Keep `LABEL_NUDGE_OFFSETS = labelNudgeOffsetsWithin(LABEL_NUDGE_MAX_PX)`. Behavior is identical. Update the comment. Run `node dist/shared/mapLabelNudge.test.js` after building. It must pass unchanged.

- [ ] **Step 2: Choose anchors without dropping same-kind overlaps (`src/shared/mapLabelPlacement.ts`)**

  Move the candidate loop and the existing sort out of `placeMapLabels` into an exported `chooseMapLabelAnchors(input: LabelPlacementInput): PlacedMapLabel[]`. It returns every feature that chose an anchor, in the same order `placeMapLabels` sorts today: kind, rank, minimum zoom, larger radius, then id. It does not apply `MAX_LABELS_PER_FRAME` and it does not reject same-kind overlaps.

  `placeMapLabels` calls `chooseMapLabelAnchors`, then keeps today's cap and same-kind rejection. Existing placement tests must pass with no assertion edits.

  Add one test: two overlapping `major_water` labels are both returned by `chooseMapLabelAnchors`. Do not change the tests that show `placeMapLabels` still drops the second same-kind label.

  If this file passes 600 lines, move `LabelBox`, `centeredBoxesMeet`, and `insideInset` into `src/shared/mapLabelBoxes.ts` and update the imports. Do not invent a different split.

- [ ] **Step 3: Create `src/shared/mapWaterLabelPlacement.ts`**

  The module header comment says why it exists: water names give way to land names, so they are placed after the land names are final.

  Exports:

  ```ts
  /** Farthest a water name may move from its anchor. 36. */
  export const WATER_LABEL_NUDGE_MAX_PX = 36;

  /** Most water names drawn in one frame. 40. */
  export const MAX_WATER_LABELS_PER_FRAME = 40;

  export interface WaterLabelFrame {
    readonly viewSize: { readonly width: number; readonly height: number };
    /** Land labels as they will be painted, after their own shift. They never move. */
    readonly landLabels: readonly LabelBox[];
    /** Shifts chosen for water names last frame, by feature id. */
    readonly previousNudges: ReadonlyMap<string, LabelNudge>;
  }

  export function settleWaterLabels(
    water: readonly PlacedMapLabel[],
    frame: WaterLabelFrame,
  ): NudgedMapLabel[];
  ```

  `settleWaterLabels` algorithm. Keep it this simple:

  1. Build the offsets once at module load: `const WATER_NUDGE_OFFSETS = labelNudgeOffsetsWithin(WATER_LABEL_NUDGE_MAX_PX);`. The first entry is `{0, 0}`.
  2. `accepted: NudgedMapLabel[] = []`.
  3. For each label in input order (the caller passes `chooseMapLabelAnchors` output, already sorted ocean, major, minor, then rank), stopping once `accepted.length` reaches `MAX_WATER_LABELS_PER_FRAME`. The cap counts names placed, not names considered. Water does not go through `placeMapLabels` or `MAX_LABELS_PER_FRAME`.
     - Try `{0, 0}`. Then the previous nudge for this id, when there is one. Then each entry of `WATER_NUDGE_OFFSETS` in order.
     - A spot is clear when the shifted center is inside `insideInset(...)`, the shifted box meets no land label (`centeredBoxesMeet(box, land, LABEL_COLLISION_PADDING_PX)`), and it meets no accepted water label under the same test.
     - Take the first clear spot, and push the label with `x`, `y` shifted and `nudge` set. If no spot is clear, skip the label. Unlike `nudgeBroadLabels`, a water name is dropped, never drawn on top of something.
  4. Return `accepted`.

  Write it as a short exported function plus one private `firstClearNudge(label, accepted, frame)` helper and one private `isClearSpot(box, accepted, frame)` helper, each with an orienting comment. Import `centeredBoxesMeet`, `insideInset`, `LabelBox`, and `PlacedMapLabel` from `./mapLabelPlacement`. Import `labelNudgeOffsetsWithin`, `LabelNudge`, and `NudgedMapLabel` from `./mapLabelNudge`. Import `LABEL_COLLISION_PADDING_PX` from `./mapLabelRules`. Do not copy any of them.

- [ ] **Step 4: Tests (`src/shared/mapWaterLabelPlacement.test.ts`, new)**

  Build labels by hand as the nudge tests do. View 1000 × 800.

  1. A water label with no land nearby is returned at its anchor with nudge `{0, 0}`.
  2. A water label whose anchor box meets a land label, with open space above, is returned shifted, and its box no longer meets the land label. The land label is not in the output and is unchanged.
  3. A water label boxed in on all sides within 36 px by land labels is not returned.
  4. Two water labels at the same anchor: the first is kept at the anchor and the second is shifted or dropped. The two returned boxes never meet.
  5. A previous nudge that is still clear is kept even when an earlier offset in the grid is also clear, as long as the anchor itself is blocked.

- [ ] **Step 5: Verify**

  Run `npm run build:main`, then `node dist/shared/mapWaterLabelPlacement.test.js`, `node dist/shared/mapLabelPlacement.test.js`, and `node dist/shared/mapLabelNudge.test.js`. Expected: all pass. The pre-existing placement and nudge tests are unchanged.

---

## Phase 3: Italic Faces and Wiring (R4, R5)

Water inks and `labelPaintColors` are already in place from Phase 1. Do not add them again, and do not revert `paintLabel`. After this phase the app runs the full water path, but the shipped document still has no water features. The map must look exactly as it did before.

- [ ] **Step 1: Vendor the italic faces**

  The upright faces came from the `@fontsource/noto-sans` and `@fontsource/noto-serif` packages, version 5.3.0, per `THIRD-PARTY-NOTICES.md`. Use that same version. Do not add them to `package.json`.

  ```text
  npm pack @fontsource/noto-sans@5.3.0 @fontsource/noto-serif@5.3.0 --pack-destination <scratch dir>
  ```

  Extract each tarball in its own new empty directory under the scratch dir, then copy exactly these four files into `static/fonts/`:

  - `package/files/noto-sans-latin-400-italic.woff2`
  - `package/files/noto-sans-latin-ext-400-italic.woff2`
  - `package/files/noto-serif-latin-400-italic.woff2`
  - `package/files/noto-serif-latin-ext-400-italic.woff2`

  If any file name differs in the package, stop and report. Do not substitute another weight or subset.

- [ ] **Step 2: Declare the faces (`static/mapFonts.css`)**

  Add four `@font-face` blocks that copy the matching `400`/`normal` blocks exactly, including each block's `unicode-range`, but with `font-style: italic` and the italic file name. Keep the latin-ext block before the latin block for each family, as the file does now. Update the file's top comment to mention that water names use the italic faces.

- [ ] **Step 3: Wire the layer (`src/renderer/map/mapLabelLayer.ts`)**

  `paintLabel` already uses `labelPaintColors`. Leave that call as it is.

  1. **Font.** In `applyLabelFont`, set `ctx.font = \`${style.fontStyle} ${style.weight} ${style.sizePx}px "${family}", ${fallback}\`;`.
  2. **Font loading.** In `loadLabelDocument`, add `await document.fonts.load('italic 400 13px "Agent Wars Map Sans"');` and the same for `"Agent Wars Map Serif"`, after the existing loads.
  3. **Water memory.** Add a module-level `let previousWaterNudges: ReadonlyMap<string, LabelNudge> = new Map();` with an orienting comment, beside `previousNudges`. `previousNudges` is only replaced at the end of the frame. There is no other clear. Do the same for the water map. Do not add a new clear for either map.
  4. **Frame result.** Change `labelsForFrame` to return `{ readonly land: NudgedMapLabel[]; readonly water: NudgedMapLabel[] }`. Inside it:
     - Keep the land code as it is, up to and including `nudgeBroadLabels`. Land still uses `placeMapLabels`.
     - Move the bounds test (`longitudeMeets(...) && latitudeMeets(...)`) into a private `featureMeetsView(feature, view)` helper, so both passes share it. `view` is one small object holding `west`, `south`, `east`, and `north`, so the helper takes two arguments.
     - Water candidates are `labelFeatures.filter((feature) => labelFeatureIsCandidate(feature, waterKinds, zoom) && featureMeetsView(feature, view))`, where `waterKinds = visibleWaterLabelKinds(zoom, tacticalView)`. Water does not go through `withoutStatesNamedForCities`.
     - `waterPlaced = chooseMapLabelAnchors({ ...same fields as the land call, features: waterCandidates, kinds: waterKinds })`. Do not call `placeMapLabels` for water, and do not apply `MAX_LABELS_PER_FRAME` to water. Build the shared input fields once and spread them into both calls. Do not repeat the projection lambda.
     - `water = settleWaterLabels(waterPlaced, { viewSize, landLabels: nudged, previousNudges: previousWaterNudges })`.
     - **Anchor memory.** Record `previousAnchors` for both the land `placed` list and `waterPlaced`, including a water name `settleWaterLabels` then drops. Then delete ids that are in *neither* candidate set. Build `candidateIds` from land and water candidates together, before the delete loop. This is Review Focus 3.
     - `previousWaterNudges = new Map(water.map((label) => [label.featureId, label.nudge]))`.
     - If `labelsForFrame` passes about 60 lines, move the water part into a private `waterLabelsForFrame(...)` helper that takes one input object.
  5. **Paint order.** In `drawMapLabels`, paint `water` first, then `land`, so a land name is always on top. Set `canvas.dataset.drawnLabelKinds` from both lists together. The value stays sorted and comma-joined.
  6. Update the comments on `drawMapLabels`, `labelsForFrame`, and the module header to mention water names.

  The file is about 408 lines now. If it passes 600, move `featureMeetsView`, `longitudeMeets`, `latitudeMeets`, and `clampLatitude` into a new `src/renderer/map/mapLabelViewBounds.ts`, and import them.

- [ ] **Step 4: Verify that nothing changed visibly**

  1. Run `npm test`. Expected: exit code 0.
  2. Run `npm run ui:smoke`. Expected: no new `FAIL` lines, and the two place-name checks still pass. Then run `npm run rebuild:native:node` before the next `npm test`.
  3. Ask the user to run `npm start` and confirm that land names look exactly as before in each theme. No water names appear yet, because the shipped document has none. Do not claim this yourself.

---

## Phase 4: Pipeline and Data (R1, R2, R3)

- [ ] **Step 1: Settings (`scripts/basemap_pipeline/vector_settings.py`)**

  Add these, each with a one-line comment in the file's style:

  ```python
  MARINE_LABEL_SHP = "ne_10m_geography_marine_polys.shp"
  LAKE_LABEL_SHP = "ne_10m_lakes.shp"
  # Marine feature classes that get a name. Sounds, fjords, lagoons, inlets, reefs, rivers, and generic records do not.
  MARINE_LABEL_CLASSES = frozenset({"ocean", "sea", "gulf", "bay", "strait", "channel"})
  # Thin marine classes: no fragment anchors, and the app skips the radius test.
  NARROW_MARINE_CLASSES = frozenset({"strait", "channel"})
  # Marine and lake scalerank at or below these are major water. Above is minor water.
  MAJOR_MARINE_MAX_SCALERANK = 2
  MAJOR_LAKE_MAX_SCALERANK = 1
  # Named lakes above this scalerank are too small to label.
  LAKE_LABEL_MAX_SCALERANK = 6
  OCEAN_ANCHOR_CELL_DEG = 30.0
  OCEAN_MIN_FRAGMENT_RADIUS_M = 300000
  ```

  Major water uses `COUNTRY_ANCHOR_CELL_DEG` and `COUNTRY_MIN_FRAGMENT_RADIUS_M`. Minor water uses `STATE_ANCHOR_CELL_DEG` and `STATE_MIN_FRAGMENT_RADIUS_M`. Do not add copies of those.

- [ ] **Step 2: Make the shared helpers public (`scripts/basemap_pipeline/label_anchors.py`)**

  The water loader needs these private helpers. Rename them, and update every call in the file:

  | Now | Public name |
  | --- | --- |
  | `_round_lat` | `round_label_latitude` |
  | `_whole_metres` | `whole_metres` |
  | `_largest_polygon` | `largest_polygon` |
  | `_property` | `label_property` |
  | `_first_text` | `first_label_text` |
  | `_text` | `label_text` |
  | `_number` | `label_number` |

  Each docstring's "When to use" now also names the water loader. Make no other changes to that file in this step. Run `npm run basemap:test`. It must pass unchanged.

- [ ] **Step 3: Move the document builder**

  Create `scripts/basemap_pipeline/label_document.py` and move `build_label_document` there unchanged. Then change its feature list to:

  ```python
  features = [
      *load_continent_features(data_root),
      *load_country_features(data_root),
      *load_state_features(data_root),
      *load_water_features(data_root),
  ]
  ```

  Update its docstring: continents, countries, states, then water. Use the four-part docstring. Delete it from `label_anchors.py`. Search the repo for `build_label_document` before editing imports. `vector_cli.py` is the only importer today. Change that import to `from scripts.basemap_pipeline.label_document import build_label_document`. The new module exists so `water_label_anchors.py` can import from `label_anchors.py` without a circular import.

- [ ] **Step 4: Create `scripts/basemap_pipeline/water_label_anchors.py`**

  Public function `load_water_features(data_root)`. Its docstring is the four-part form, not a one-liner. It raises `fiona.errors.DriverError` when a shapefile cannot be opened. Do not catch and swallow that error. Log `LOGGER.debug` at entry with the path, and log debug again with the kept count for each file.

  Marine records. For each record in `MARINE_LABEL_SHP`:

  - Keep it only when `featurecla` (lower-cased) is in `MARINE_LABEL_CLASSES`.
  - Name: `first_label_text(properties, ("name_en", "name"))`. Skip the record if it is empty.
  - Kind: `ocean` when the class is `ocean`. Otherwise `major_water` when `scalerank <= MAJOR_MARINE_MAX_SCALERANK`, else `minor_water`.
  - Id: `f"marine:{label_text(ne_id)}"`. Skip the record when that text is empty.
  - `rank` is `label_number(scalerank)`. `min_zoom` is `label_number(min_label)`. Skip the record if `min_label` is missing. A non-numeric rank or minimum raises, as the land loader does.
  - `narrow` is true when the class is in `NARROW_MARINE_CLASSES`.

  Lake records. For each record in `LAKE_LABEL_SHP`. Do not filter lakes by `featurecla`.

  - Skip it when `scalerank > LAKE_LABEL_MAX_SCALERANK`.
  - Name: `first_label_text(properties, ("name", "name_en"))`. Skip the record if it is empty.
  - Kind: `major_water` when `scalerank <= MAJOR_LAKE_MAX_SCALERANK`, else `minor_water`.
  - Id: `f"lake:{label_text(ne_id)}"`. Skip an empty id. `rank` and `min_zoom` as above. `narrow` is never set.

  Geometry and anchors, shared by both, in one private `_water_record(...)` that takes a small frozen dataclass (the way `_PendingLabel` does), so it stays within the argument limit:

  1. Clip the geometry to latitudes ±`MERCATOR_MAX_LAT` (from `vector_settings.py`) with `geometry.intersection(box(-180, -MERCATOR_MAX_LAT, 180, MERCATOR_MAX_LAT))`. Oceans reach the poles, and the projection cannot. Skip the record if the result is empty.
  2. Project with `to_mercator`, and take `largest_polygon(...)`. Skip the record if it is `None`.
  3. Primary anchor: `point = polylabel(polygon, POLYLABEL_TOLERANCE_M)`, radius `polygon.boundary.distance(point)`, then back to degrees with `to_lonlat`. Store `[round_label_latitude(lat), round(lng, 4), whole_metres(radius)]`.
  4. Fragment anchors, except for narrow records: `fragment_anchors(clipped_geometry, cell_deg, min_radius_m)`, with `OCEAN_*` for oceans, `COUNTRY_*` for major water, and `STATE_*` for minor water.
  5. The record is `{"id", "kind", "name", "rank", "min_zoom", "anchors"}`, plus `"narrow": True` only for narrow records. Do not write `"narrow": False`.

  Log `LOGGER.debug` at entry with the path, and one `LOGGER.debug` line per file with the kept count. Do not catch `DriverError`.

  Field names may be upper or lower case in a shapefile. Read every property with `label_property`, which ignores case, and read names with `first_label_text`. Read ranks and minimum zooms with `label_number`.

- [ ] **Step 5: Pipeline tests (`scripts/basemap_pipeline/tests/test_water_label_anchors.py`, new)**

  Write tiny shapefiles with `fiona` in a `tempfile.TemporaryDirectory()`, as `test_label_anchors.py` does. Name them `ne_10m_geography_marine_polys.shp` and `ne_10m_lakes.shp` inside that directory, and pass the directory as `data_root`. Every synthetic record includes `featurecla`, `name`, `name_en`, `scalerank`, `min_label`, `ne_id`, and a polygon. Tests:

  1. A marine file with one `ocean`, one `sea` of scalerank 1, one `gulf` of scalerank 4, one `strait` of scalerank 2, and one `fjord`. The strait polygon covers more than one 4° cell and is wide enough that the same polygon, if it were not narrow, would receive a second anchor. The result has the four kept records, with kinds `ocean`, `major_water`, `minor_water`, and `major_water`. The fjord is absent. Only the strait has `narrow`, and it has exactly one anchor.
  2. A marine record whose `name` is `"SOUTHERN OCEAN"` and whose `name_en` is `"Southern Ocean"` is named `"Southern Ocean"`.
  3. A lakes file with scalerank 0 (`name` `"Lake Superior"`, `name_en` `"Superior"`), scalerank 3, and scalerank 8. The result has two records: `"Lake Superior"` as `major_water`, and the scalerank 3 lake as `minor_water`. Lakes are not filtered by `featurecla`.
  4. Every returned id is unique and starts with `marine:` or `lake:`.

  Run both test commands from Test Commands. Expected: all pass, including the existing `test_label_anchors.py` and `test_vector_documents.py`.

- [ ] **Step 6: Regenerate the place-name document**

  ```text
  python -m scripts.basemap_pipeline.vector_cli labels --data-root F:/Data --output data/generated/basemap/vectors --work .test/basemap/vectors/work
  ```

  Before regenerating, read the current zip and save every land feature's id, kind, name, rank, min zoom, and anchors. Then check the result with a short script in the scratch directory, not in the repo. Read `map_labels.json` from the new zip. Every land feature must match the saved copy. Counts alone are not enough. Stop if any land feature differs. Expected water counts: ocean is 7, major water is about 80, minor water is about 490. Every water id is unique. Report the zip size before and after. Expect growth of under 150 KB. If it grows by more than 300 KB, stop and report.

  `git status` must show only `map_labels.json.zip` changed under `data/generated/`.

- [ ] **Step 7: Verify in the app**

  Run `npm test` (expected exit 0) and `npm run ui:smoke` (expected: no new `FAIL` lines), then `npm run rebuild:native:node`. Hand the visual check to the user in Phase 6.

---

## Phase 5: Documentation

Follow `AGENTS.md`. Take every number from the symbol named beside it.

- [ ] **Step 1: `doc/ux/map-surface.md`, Place names**

  Change "Continent, country, and state names" to include water names. Add a paragraph after the land rules, in the section's voice, covering:

  - The sources and kept classes.
  - The three tiers and where each appears (`visibleWaterLabelKinds`).
  - The size and zoom tests, naming `WATER_LABEL_ZOOM_DELAY`, `WATER_LABEL_MIN_RADIUS_PX`, `LABEL_MIN_ZOOM_SLACK`, and `NARROW_WATER_ZOOM_DELAY`.
  - The italic faces and water ink (`waterLabelColors`, `labelPaintColors`).
  - Opacity (`WATER_LABEL_OPACITY`).
  - That land names are placed first and never move for water. A water name moves up to 36 px and is otherwise not drawn (`settleWaterLabels`, `WATER_LABEL_NUDGE_MAX_PX`).
  - The 40-name cap (`MAX_WATER_LABELS_PER_FRAME`).
  - That water is painted under land names.

  Add `src/shared/mapWaterLabelPlacement.ts (settleWaterLabels)` and `src/shared/mapLabelPlacement.ts (chooseMapLabelAnchors)` to the Code Entry Points list, and add `visibleWaterLabelKinds` to the existing `mapLabelRules.ts` entry.

- [ ] **Step 2: `doc/README.md`**

  In the paragraph that names `visibleLabelKinds`, `labelFeatureIsCandidate`, and `nudgeBroadLabels`, add `visibleWaterLabelKinds`, `chooseMapLabelAnchors`, and `settleWaterLabels`. The engine constants table does not list label constants, so add nothing to it. Leave the 2.21.0 release sentence as history.

- [ ] **Step 3: `doc/terrain-pipeline.md` and `scripts/basemap_pipeline/README.md`**

  The place-name document lists continents, countries, states, oceans, major water, and minor water. Straits and channels carry `"narrow": true` and have one anchor. The `labels` command also reads `ne_10m_geography_marine_polys.shp` and `ne_10m_lakes.shp`, and `build_label_document` now lives in `label_document.py`.

- [ ] **Step 4: `THIRD-PARTY-NOTICES.md`**

  In "Noto Sans and Noto Serif", add the four italic file names to the file list. In "Natural Earth", add "geography marine polygons" to the list of datasets behind shipped place names. Lakes are already listed. Run `npm run notices:check`. Expected: pass. If it fails on the font files, add them to the fixed credit in `scripts/thirdPartyNotices/noticeCheck.cjs` in the same style.

- [ ] **Step 5: `doc/ui-style-guide.md`**

  Search it for map place-name type or color. If it describes map label type, add one sentence for water names: italic, theme water ink. If it does not, leave it unchanged and say so in your summary.

---

## Phase 6: Whole-Change Verification

No new behavior. Fix any failure at its cause, in the phase that introduced it.

- [ ] **Step 1:** `npm test`. Expected: exit code 0.
- [ ] **Step 2:** `npm run basemap:test`. Expected: all pass.
- [ ] **Step 3:** `npm run ui:smoke`. Expected: no `FAIL` lines from this change. The two place-name checks test membership (`continent`, `state`, `country`). Ocean and water kinds do not fail them. Do not edit the smoke script. Then run `npm run rebuild:native:node`.
- [ ] **Step 4: Stale text.** Search `doc/`, skipping the historical documents named in `AGENTS.md`, and also search `src/` and `scripts/`, for "three place-name kinds", "continent, country, and state names", and "continent, country, or state". Expected: each remaining one is about land names only, or is updated.
- [ ] **Step 5: Scope.** `git status --short`. Expected: the File Map files, this plan, `static/renderer.js`, the four new font files, and `data/generated/basemap/vectors/map_labels.json.zip`. No other generated file. Report anything else and do not revert it without checking what produced it.
- [ ] **Step 6: Hand over for visual acceptance.** Do not claim visual acceptance yourself. Report Steps 1 to 5, and ask the user to run `npm start`, start a global game, and check each row in each of the four themes:

  | Where | Check |
  | --- | --- |
  | World view, zoom 2–3 | Ocean names in spaced italic capitals, in a blue ink quieter than the continent names. No sea names. |
  | Europe, zoom about 5.25 | *Mediterranean Sea*, *Black Sea*, *Baltic Sea*, *North Sea*, *Bay of Biscay*, and *Caspian Sea*. Country names are where they were before the change. |
  | Italy, detail view | Zoom until state names appear (`shouldRenderTacticalHexes`). On a usual window that is about zoom 7. Then *Adriatic*, *Tyrrhenian*, *Ionian*, and *Ligurian* seas. No ocean names. Minor water stays absent while the view is still the country view. |
  | Gibraltar, detail view | Zoom until state names appear, about zoom 8. *Strait of Gibraltar*, or nothing if land names fill the strait. Never overlapping a land name. |
  | East Africa, detail view | Zoom until state names appear, about zoom 7 to 7.5. *Lake Victoria*, then *Lake Tanganyika*. |
  | Slow pan in any view | Water names do not hop while their spot stays clear. |
  | Night theme | Water names are readable on dark water and clearly not land names. |

  If the user wants different numbers, the values to change are `WATER_LABEL_MIN_RADIUS_PX`, `WATER_LABEL_ZOOM_DELAY`, `NARROW_WATER_ZOOM_DELAY`, `MAX_WATER_LABELS_PER_FRAME`, the water rows of `MAP_LABEL_KIND_STYLES`, `waterLabelColors`, `WATER_LABEL_NUDGE_MAX_PX`, and, in the pipeline, `MAJOR_MARINE_MAX_SCALERANK`, `MAJOR_LAKE_MAX_SCALERANK`, and `LAKE_LABEL_MAX_SCALERANK`. A pipeline value needs Phase 4 Step 6 again. Update the tests and `doc/ux/map-surface.md` with them.

## Out of Scope

- Avoiding city names, which are drawn on the hex canvas above this layer. Land names do not avoid them either.
- Curved or rotated water names along a strait or river.
- Sounds, fjords, lagoons, inlets, reefs, and rivers.
- Water names in the minimap.
- Keeping a label's whole box inside the view. Only the center is tested, as for land names.
- Release notes, which are written at release time.
