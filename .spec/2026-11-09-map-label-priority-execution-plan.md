# Map Label Priority Implementation Plan

> **For agentic workers:** Work the phases in order and finish each phase's verification before starting the next. Steps use checkbox (`- [x]`) syntax for tracking. **Do not commit or push at any point** (`.cursor/rules/11-no-commit-or-push.mdc`). The user reviews all changes first.

**Goal:** Show only significant country and state names at each zoom, draw the broad name under them at one and a half times its usual size, and move that broad name off the smaller names when a clear spot is close.

**Architecture:** Every rule stays in the existing pure modules under `src/shared/`, where `node:test` can check it. A new pure module computes the shift for the broad name. The canvas layer `src/renderer/map/mapLabelLayer.ts` only wires these together and keeps per-frame memory.

**Tech stack:** TypeScript, Canvas 2D, `node:test`. There are no new dependencies.

**Spec:** The Requirements section below.

## Requirements

These come from the user's request and answers.

| # | View | Required result |
| --- | --- | --- |
| R1 | Main map, continents and countries (zoom 5.25 in the user's Europe screenshot) | Italy, Austria, and Croatia are named. San Marino and North Macedonia are not. Both appear at higher zooms. |
| R2 | Main map once country names are drawn (zoom 4 and above) | Continent names are 27 px (1.5x the current 18 px). Below zoom 4 they stay 18 px. A tactical view does not draw them. |
| R3 | Detail view, countries and states (zoom 7 in the user's Central Asia screenshot) | Fewer minor states are named. A state qualifies by on-screen size, at least a 40 px inscribed radius. It may still appear up to 1.5 levels before its stored minimum. |
| R4 | Detail view, while state names are drawn | Country names are 19.5 px (1.5x the current 13 px). Outside that view they stay 13 px. |
| R5 | Both views | The larger broad name shifts up to 60 px to avoid the smaller names. When its anchor is clear of those names, it sits on the anchor. While the anchor stays blocked and the shifted spot stays clear, it does not hop. If no clear spot exists, it takes the spot with the fewest overlaps. Paint order does not change: the smaller name is still on top. |

### Why these rules, from the shipped data

Do not re-derive these or substitute other fields.

- In `ne_10m_admin_0_countries`, `scalerank` is 0 for 178 of 258 records, including every country in R1. It cannot rank them. `min_label`, already stored as `min_zoom`, can: Italy 2, Austria 3, Croatia 4, San Marino 5, North Macedonia 5.
- The current code adds 1.5 levels (`LABEL_MIN_ZOOM_SLACK`), so names appear *before* their minimum. Even with no slack, a name with minimum 5 would show at zoom 5.25. Countries therefore wait one level past their minimum and do not keep the linger. The minor countries that share minimum 5 return at zoom 6. States keep the 1.5-level linger and add the radius test.
- State `scalerank` tracks the country rather than the state (the sampled Uzbek states are 4 and the sampled German states are 3, Bavaria and tiny Saarland alike), and `min_label` is shared the same way (6.6 or 6.7 across Central Asia). The per-state value that does vary is the stored anchor radius, which is measured in Web Mercator metres and so converts directly to screen pixels.
- `data/generated/basemap/vectors/map_labels.json.zip` already holds everything needed. **Do not change `scripts/basemap_pipeline/` and do not regenerate that file.**

### Expected results

These come from a simulation over the shipped data, using an approximate font. Use them as sanity checks. Small differences in the counts are normal.

| View | Before | After |
| --- | --- | --- |
| Eastern Europe, zoom 5.25 | 30 countries, including San Marino, Monaco, Vatican, North Macedonia, Kosovo, Albania, Moldova, Luxembourg | 21 countries, none of those eight. EUROPE is half again as large and moves about 36 px up, clear of POLAND |
| Central Asia, zoom 7 | 35 states | About 18 states. Takhar, Balkh, Sirdaryo, Sar-e Pol, and "districts of Republican Subordination" are gone. Khatlon, Gorno-Badakhshan, Badakhshan, and Xinjiang stay |
| Germany area, zoom 7 | 48 states | About 13 |
| India, zoom 6 | 29 states | About 10 |
| USA, zoom 6 | 29 states | About 27 |

The zoom-6 state rows were counted without the state linger. A higher count there is not a failure: a state whose minimum is above 6 and at most 7.5 can appear when its radius passes. The zoom-7 rows are unchanged for the sampled minima (6.6 and 6.7).

## Global Constraints

- Never commit or push.
- Every new or changed field and function needs an orienting comment in the file's existing `Purpose / When to use / Expected outcome / Exceptions` style (`04-orienting-comments.mdc`). Update comments whose stated numbers change.
- Never write "Phase", "R1", or any other identifier from this plan in code, comments, or `doc/` (`12-no-plan-identifiers.mdc`).
- Source files should stay under 600 lines, with a hard limit of 1000. Functions take at most 6 arguments.
- Tests cover contracts only (`03-testing-standards.mdc`). Do not add tests beyond those listed.
- Update `doc/` in the same phase as the behavior, as the steps below state. Do not edit historical documents.
- `static/renderer.js` is a tracked build output. Rebuilding it is expected. Never edit it by hand. Phases 1–3 do not write it, and `npm test` does not either. The Phase 4 smoke run builds it. Run that build before `npm start` if the smoke run did not.
- Change only what a step names. Halo widths, opacity, colors, `visibleLabelKinds`, border rules, and city-name logic stay as they are.

## Review Focus

1. **Panning while a name is shifted:** while the anchor stays blocked and the shifted spot stays clear, the name must not hop. When the anchor is clear again, the name returns to it. A pan that makes the shifted center illegal may move the name. Test in Phase 3.
2. **A broad name near the view edge:** a shift must not push its center inside `LABEL_VIEW_INSET_PX` of the edge. Test in Phase 3.
3. **No clear spot:** the name still draws, at the fewest overlaps, and is never dropped. Test in Phase 3.
4. **A state whose label point sits near its border** (Sirdaryo's primary radius is 1,371 m and its largest is 27,166 m): the largest anchor decides, not the primary. Test in Phase 1.
5. **A view with a single kind** (world view, continents only): nothing moves. Test in Phase 3.

## File Map

| File | Change |
| --- | --- |
| `src/shared/mapLabelRules.ts` | New zoom and size constants, `mapLabelStyleForView`. Keep `LABEL_MIN_ZOOM_SLACK` for states only |
| `src/shared/mapLabelPack.ts` | Comment on `minZoom` only |
| `src/shared/mapLabelPlacement.ts` | `labelFeatureIsCandidate`, `largestAnchorRadiusM`, radius tie-break, shared box helpers |
| `src/shared/mapLabelNudge.ts` (new) | `nudgeBroadLabels` |
| `src/renderer/map/mapLabelLayer.ts` | Use the shared candidate test, the per-view style, and the nudge pass |
| `src/shared/mapLabelPlacement.test.ts`, `src/shared/mapLabelRules.test.ts`, `src/shared/mapLabelNudge.test.ts` (new) | Contract tests |
| `doc/ux/map-surface.md`, `doc/README.md` | Behavior text, symbols, and entry points |
| `scripts/ui-smoke/ui-smoke-map-label-checks.cjs` | Battle restoration is countries without continents |

## Test Commands

Use these in every phase. `FILE` is the test named in the step.

```
npm run build:main
node dist/shared/FILE.test.js
```

`build:main` must succeed before a test run means anything. A TypeScript error counts as a failed step.

---

## Phase 1: Which Names Appear (R1, R3)

Delivers fewer names. Sizes and positions do not change yet.

**Files:** Modify `src/shared/mapLabelRules.ts`, `src/shared/mapLabelPack.ts` (comment only), `src/shared/mapLabelPlacement.ts`, `src/renderer/map/mapLabelLayer.ts`, `src/shared/mapLabelPlacement.test.ts`, `doc/ux/map-surface.md`, `doc/README.md`.

**Produces:**
- `COUNTRY_LABEL_ZOOM_DELAY = 1` and `STATE_LABEL_MIN_RADIUS_PX = 40`, in `mapLabelRules.ts`
- `largestAnchorRadiusM(feature: MapLabelFeature): number`, in `mapLabelPlacement.ts`
- `labelFeatureIsCandidate(feature: MapLabelFeature, kinds: readonly MapLabelKind[], zoom: number): boolean`, in `mapLabelPlacement.ts`

- [x] **Step 1: Adjust the test helpers and existing tests in `mapLabelPlacement.test.ts`**

  - Add an optional `zoom?: number` to the `input` helper's `partial`, defaulting to 4.
  - Add a fifth parameter `minZoom = 1` to `named`, and return it as the feature's `minZoom`. The helper already stores `1`. The default must stay `1`, so existing country tests still pass the delay at zoom 4.
  - In `a state that overlaps a country is painted over it` and `two overlapping states keep one`, give every state anchor the radius `1_000_000_000`. Their radius of 0 would fail the new size rule. At the helper's zoom of 4, `1_000_000_000` clears 40 px. Keep the two radii in `two overlapping states keep one` equal, so the lesser id still wins.

- [x] **Step 2: Write the failing tests in `mapLabelPlacement.test.ts`**

  Import `labelFeatureIsCandidate`. Use `anchor(0, 0, radius)` for the anchors.

  ```ts
  test('a country waits one zoom level past its minimum', () => {
    const country = (minZoom: number) => named('adm0:X', 'country', [anchor(0, 0, 1)], 'X', minZoom);
    const kinds: MapLabelKind[] = ['continent', 'country'];
    for (const minZoom of [2, 3, 4]) assert.equal(labelFeatureIsCandidate(country(minZoom), kinds, 5.25), true);
    assert.equal(labelFeatureIsCandidate(country(5), kinds, 5.25), false);
    assert.equal(labelFeatureIsCandidate(country(5), kinds, 5.75), false);
    assert.equal(labelFeatureIsCandidate(country(5), kinds, 6), true);
  });
  // Zoom 5.75 stays false. That is what proves a country does not keep the 1.5-level linger.

  test('a state needs its minimum zoom and room on screen', () => {
    const state = (radiusM: number, minZoom: number) => named('adm1:X', 'state', [anchor(0, 0, radiusM)], 'X', minZoom);
    const kinds: MapLabelKind[] = ['country', 'state'];
    assert.equal(labelFeatureIsCandidate(state(55_108, 6.7), kinds, 7), true);
    assert.equal(labelFeatureIsCandidate(state(41_520, 6.7), kinds, 7), false);
    assert.equal(labelFeatureIsCandidate(state(41_520, 6.7), kinds, 7.5), true);
    assert.equal(labelFeatureIsCandidate(state(55_108, 8), kinds, 7), true);
    assert.equal(labelFeatureIsCandidate(state(55_108, 8.6), kinds, 7), false);
  });
  // `8 <= 7 + 1.5` and `8.6 > 7 + 1.5`. Radius `55_108` already clears 40 px at zoom 7, so those two assertions are the linger.

  test('the largest anchor decides whether a state has room', () => {
    const state = named('adm1:X', 'state', [anchor(0, 0, 1_371), anchor(1, 1, 55_108)], 'X', 6.6);
    assert.equal(labelFeatureIsCandidate(state, ['state'], 7), true);
  });

  test('a continent has no zoom or size test, and another kind is refused', () => {
    const continent = named('continent:X', 'continent', [anchor(0, 0, 0)], 'X', 99);
    assert.equal(labelFeatureIsCandidate(continent, ['continent'], 1.5), true);
    assert.equal(labelFeatureIsCandidate(continent, ['country', 'state'], 7), false);
  });

  test('the state with more room wins a collision between equal ranks', () => {
    const placed = placeMapLabels(input({
      features: [
        named('adm1:AAA', 'state', [anchor(100, 100, 1_000_000_000)]),
        named('adm1:BBB', 'state', [anchor(100, 100, 2_000_000_000)]),
      ],
      kinds: ['state'],
    }));
    assert.deepEqual(placed.map((label) => label.featureId), ['adm1:BBB']);
  });
  ```

  Give each new test an orienting comment, as the file's existing tests have.

- [x] **Step 3: Run the tests to confirm they fail**

  Run the Test Commands with `FILE` = `mapLabelPlacement`. Expected: compile failure, because `labelFeatureIsCandidate` does not exist.

- [x] **Step 4: Change `mapLabelRules.ts`**

  Keep `LABEL_MIN_ZOOM_SLACK`. Update its comment so it applies to states only: a state may appear this far below its minimum, and it does not vanish on a small zoom-out. Countries do not use it. Add the two constants with these values and meanings:
  - `COUNTRY_LABEL_ZOOM_DELAY = 1`: levels past a country's minimum zoom before its name appears. A country does not linger below that delayed zoom.
  - `STATE_LABEL_MIN_RADIUS_PX = 40`: smallest on-screen inscribed radius that earns a state a name.

- [x] **Step 5: Change `mapLabelPlacement.ts`**

  - Add `largestAnchorRadiusM`, the greatest `radiusM` across `feature.anchors`.
  - Add the exported `labelFeatureIsCandidate`, in this order:
    1. `false` when `kinds` does not include the feature's kind.
    2. `true` for a continent.
    3. For a country: `feature.minZoom + COUNTRY_LABEL_ZOOM_DELAY <= zoom`.
    4. For a state: `feature.minZoom <= zoom + LABEL_MIN_ZOOM_SLACK` and `largestAnchorRadiusM(feature) / mercatorMetersPerPixel(zoom) >= STATE_LABEL_MIN_RADIUS_PX`.
  - Delete `acceptsFeature` and call `labelFeatureIsCandidate(feature, input.kinds, input.zoom)` from `placeMapLabels`.
  - In `compareChosen`, after the `minZoom` comparison and before the id comparison, order the larger `largestAnchorRadiusM` first.
  - Update the comments that describe the slack and the sort order, including the sort order in the comment on `placeMapLabels`. Countries use the delay and do not linger. States keep the slack and add the radius test. The radius tie-break applies to every kind, ahead of id. Equal radii still keep the lesser id.
  - In `mapLabelPack.ts`, update the `minZoom` comment. States compare with `zoom + LABEL_MIN_ZOOM_SLACK`. Countries compare with `minZoom + COUNTRY_LABEL_ZOOM_DELAY`. Continents skip the field. Change no other line in that file.

- [x] **Step 6: Change `mapLabelLayer.ts`**

  Delete `featureIsCandidate`, and call `labelFeatureIsCandidate(feature, kinds, zoom)` where it was used in `labelsForFrame`. Remove the `LABEL_MIN_ZOOM_SLACK` import.

- [x] **Step 7: Update `doc/ux/map-surface.md`, Place names paragraph**

  - Replace `then by rank, minimum zoom, and id` with `then by rank, minimum zoom, largest stored anchor radius, and id`.
  - Immediately before the sentence beginning `Names are placed in continent`, insert: ``A country name appears one zoom level after its Natural Earth minimum zoom (`COUNTRY_LABEL_ZOOM_DELAY`) and does not linger below that. A state name may appear up to 1.5 levels below its minimum (`LABEL_MIN_ZOOM_SLACK`), once the largest stored anchor radius covers at least 40 CSS pixels at the current zoom (`STATE_LABEL_MIN_RADIUS_PX`, `labelFeatureIsCandidate` in `src/shared/mapLabelPlacement.ts`).``
  - In Code Entry Points, change the `mapLabelPlacement.ts` line to list `placeMapLabels`, `labelFeatureIsCandidate`.

- [x] **Step 8: Update `doc/README.md`, last paragraph**

  After the sentence naming `visibleLabelKinds` and `adminBorderGroupsForView` as the zoom gates, add: ``Which features of a visible kind qualify is `labelFeatureIsCandidate` in `src/shared/mapLabelPlacement.ts`.``

- [x] **Step 9: Verify**

  Run the Test Commands with `FILE` = `mapLabelPlacement`, then `mapLabelRules`. Expected: all pass. Then run `npm run lint` and `npm run check:renderer-types`. Expected: no errors. Search `src/` and `doc/` for `LABEL_MIN_ZOOM_SLACK`. Expected: the constant, the state branch, the `minZoom` comment, and the place-name sentence. Not in `mapLabelLayer.ts`, and not on the country path.

---

## Phase 2: Larger Broad Names (R2, R4)

Delivers the sizes. Names of different kinds may overlap until Phase 3. Same-kind collision still uses the measured box, so a 27 px continent, or a 19.5 px country in the detail view, can be omitted when it meets another name of its kind.

**Files:** Modify `src/shared/mapLabelRules.ts`, `src/renderer/map/mapLabelLayer.ts`, `src/shared/mapLabelRules.test.ts`, `doc/ux/map-surface.md`.

**Produces:** `mapLabelStyleForView(kind: MapLabelKind, zoom: number, tacticalView: boolean): MapLabelKindStyle`, in `mapLabelRules.ts`.

- [x] **Step 1: Write the failing test in `mapLabelRules.test.ts`**

  ```ts
  test('a broad name is drawn half again as large beside the smaller names', () => {
    assert.equal(mapLabelStyleForView('continent', 3, false).sizePx, 18);
    assert.equal(mapLabelStyleForView('continent', 4, false).sizePx, 27);
    assert.equal(mapLabelStyleForView('continent', 7, true).sizePx, 18);
    assert.equal(mapLabelStyleForView('country', 5.25, false).sizePx, 13);
    assert.equal(mapLabelStyleForView('country', 7, true).sizePx, 19.5);
    assert.equal(mapLabelStyleForView('state', 7, true).sizePx, 11);
    const { sizePx: _base, ...plain } = mapLabelStyleForView('country', 5.25, false);
    const { sizePx: _large, ...large } = mapLabelStyleForView('country', 7, true);
    assert.deepEqual(large, plain);
  });
  ```

  If ESLint rejects the unused `_base` and `_large`, assert `weight`, `letterSpacingEm`, `haloWidthPx`, and `uppercase` individually instead.

- [x] **Step 2: Run the test to confirm it fails**

  `FILE` = `mapLabelRules`. Expected: compile failure on `mapLabelStyleForView`.

- [x] **Step 3: Change `mapLabelRules.ts`**

  - Leave `MAP_LABEL_KIND_STYLES` at continent 18, country 13, and state 11.
  - Add `CONTINENT_BESIDE_COUNTRY_SIZE_PX = 27` and `COUNTRY_BESIDE_STATE_SIZE_PX = 19.5`.
  - Add a private constant for each enlarged style, so each call does not allocate.
  - Add the exported `mapLabelStyleForView(kind, zoom, tacticalView)`. A continent uses the 27 px constant only when `tacticalView` is false and `zoom >= COUNTRY_LABEL_MIN_ZOOM`. A country uses the 19.5 px constant only when `tacticalView` is true. Every other call returns the table entry.
  - Update the numbers in the `sizePx` comment (`27, 19.5, 18, 13, or 11`) and in the comment on `MAP_LABEL_KIND_STYLES`.

- [x] **Step 4: Change `mapLabelLayer.ts`**

  - `applyLabelFont` takes `style: MapLabelKindStyle` in place of `kind`.
  - `measureLabel` gains `zoom` and `tacticalView`, reads `mapLabelStyleForView(feature.kind, zoom, tacticalView)`, and uses the key `` `${theme.id}|${feature.kind}|${style.sizePx}|${text}` ``. The size must be in the key. Without it, a width measured at 13 px is reused at 19.5 px after entering the detail view, and a width measured at 18 px is reused at 27 px.
  - The `measure` callback in `labelsForFrame` passes `tacticalView`.
  - `paintLabel` gains a `style: MapLabelKindStyle` parameter, and takes `haloWidthPx` from it. `drawMapLabels` passes `mapLabelStyleForView(label.kind, zoom, tacticalView)`.
  - After these changes, this file no longer uses `MAP_LABEL_KIND_STYLES`. Remove that import and add `mapLabelStyleForView` and the type `MapLabelKindStyle`.

- [x] **Step 5: Update `doc/ux/map-surface.md`, Place names paragraph**

  Before the sentence beginning `Standard and Night use Agent Wars Map Sans`, insert: ``Continent names are 18 px, and 27 px from zoom 4 while country names are drawn. Country names are 13 px, and 19.5 px while state names are drawn. State names are 11 px (`MAP_LABEL_KIND_STYLES`, `CONTINENT_BESIDE_COUNTRY_SIZE_PX`, `COUNTRY_BESIDE_STATE_SIZE_PX`, and `mapLabelStyleForView` in `src/shared/mapLabelRules.ts`).``

  Add `mapLabelStyleForView` to the `mapLabelRules.ts` line in Code Entry Points.

- [x] **Step 6: Verify**

  Run the Test Commands with `FILE` = `mapLabelRules`, then `mapLabelPlacement`. Expected: all pass. Then run `npm run lint` and `npm run check:renderer-types`. Expected: no errors.

---

## Phase 3: Move Broad Names Off Smaller Names (R5)

**Files:** Create `src/shared/mapLabelNudge.ts` and `src/shared/mapLabelNudge.test.ts`. Modify `src/shared/mapLabelPlacement.ts`, `src/renderer/map/mapLabelLayer.ts`, `doc/ux/map-surface.md`, `doc/README.md`.

**Consumes:** `PlacedMapLabel` and the two helpers exported in Step 1. `mapLabelNudge.ts` imports from `mapLabelPlacement.ts`, and never the reverse.

**Produces, in `mapLabelNudge.ts`:**

```ts
export interface LabelNudge { readonly dx: number; readonly dy: number }
export interface NudgedMapLabel extends PlacedMapLabel { readonly nudge: LabelNudge }
export interface LabelNudgeFrame {
  readonly viewSize: { readonly width: number; readonly height: number };
  readonly previousNudges: ReadonlyMap<string, LabelNudge>;
}
export function nudgeBroadLabels(labels: readonly PlacedMapLabel[], frame: LabelNudgeFrame): NudgedMapLabel[];
```

- [x] **Step 1: Export the shared geometry from `mapLabelPlacement.ts`**

  - Export `insideInset` unchanged.
  - Add and export `centeredBoxesMeet(a: LabelBox, b: LabelBox, paddingPx: number): boolean`, where `LabelBox` is an exported interface with `x`, `y`, `width`, and `height`. Its body is the two comparisons now in `boxesOverlap`, with `pad` replaced by `paddingPx`.
  - `boxesOverlap` becomes `candidate.feature.kind === placed.kind && centeredBoxesMeet(candidate, placed, LABEL_COLLISION_PADDING_PX)`.

  Run the Test Commands with `FILE` = `mapLabelPlacement`. Expected: all pass, showing the refactor changed nothing.

- [x] **Step 2: Write the failing tests in `mapLabelNudge.test.ts`**

  Use a view of 800 by 600. The helper builds a `PlacedMapLabel`, with `text` equal to the id and `anchorIndex` 0:

  ```ts
  const label = (id: string, kind: MapLabelKind, x: number, y: number, width = 100, height = 36): PlacedMapLabel =>
    ({ featureId: id, kind, text: id, x, y, width, height, anchorIndex: 0 });
  const frame = (previous: ReadonlyMap<string, LabelNudge> = new Map()): LabelNudgeFrame =>
    ({ viewSize: { width: 800, height: 600 }, previousNudges: previous });
  const small = (x: number, y: number) => label('small', 'country', x, y, 100, 20);
  ```

  Each row is one test. In every row the broad label is `label('broad', 'continent', 400, 300)` unless the row says otherwise, and the expected values are for the broad label.

  | Test name | Input labels (in this order) | `previousNudges` | Expected |
  | --- | --- | --- | --- |
  | `a clear broad name stays on its anchor` | broad, `small(400, 500)` | none | nudge `{0, 0}`, y 300 |
  | `a covered broad name takes the nearest clear spot` | broad, `small(400, 300)` | none | nudge `{0, -36}`, x 400, y 264 |
  | `a shifted name stays put while its anchor is blocked` | broad, `small(400, 300)` | broad: `{12, -48}` | nudge `{12, -48}` |
  | `a shifted name returns once its anchor is clear` | broad, `small(400, 500)` | broad: `{12, -48}` | nudge `{0, 0}`, y 300 |
  | `a blocked earlier spot is searched again` | broad, `small(400, 300)` | broad: `{0, 0}` | nudge `{0, -36}` |
  | `a shift does not land on another broad name` | broad, `label('other', 'continent', 400, 258)`, `small(400, 300)` | none | broad nudge `{0, 36}`, other nudge `{0, 0}` |
  | `a shift stays inside the view inset` | `label('broad', 'continent', 400, 30)`, `small(400, 30)` | none | nudge `{0, 36}` |
  | `the fewest overlaps win when nothing is clear` | broad, `label('wall', 'country', 400, 300, 400, 400)`, `small(400, 300)` | none | nudge `{0, -36}` |
  | `a single kind does not move` | broad, `label('other', 'continent', 400, 500)` | broad: `{12, 12}` | both nudges `{0, 0}`, broad y 300 |

  Also assert, in the second row, that the output `featureId` order equals the input order. The inset row uses y 30 because `LABEL_VIEW_INSET_PX` is 24: a move up leaves the margin, and the first clear move down is 36 px. The return row is the one the old rule would fail: the anchor is clear, so a previous shift must not stick. The list is in paint order, with the smaller kind last.

- [x] **Step 3: Run the tests to confirm they fail**

  `FILE` = `mapLabelNudge`. Expected: compile failure, because the module does not exist.

- [x] **Step 4: Implement `mapLabelNudge.ts`**

  Module-level constants, each with an orienting comment:
  - `LABEL_NUDGE_MAX_PX = 60`
  - `LABEL_NUDGE_STEP_PX = 12`
  - `LABEL_NUDGE_GAP_PX = 2`, the padding against a smaller name
  - `LABEL_NUDGE_OFFSETS`, built once: every `{dx, dy}` whose components are multiples of the step and whose length is at most the maximum. Sort by length, then `Math.abs(dx)`, then `dy`, then `dx`. The first entry is `{0, 0}`, and the first entry of length 36 with `dx` 0 is `{0, -36}`.

  Algorithm for `nudgeBroadLabels`:

  1. Empty input returns `[]`.
  2. The foreground kind is the `kind` of the last label, because paint order ends with the most local kind. `foreground` is every label of that kind.
  3. Foreground labels are returned unchanged with nudge `{0, 0}`. If every label is foreground, stop here.
  4. Keep a working array `current`, starting as a copy of the input. For each broad label, in input order:
     - A spot is **allowed** when its center passes `insideInset` and its box does not meet any *other* broad label's entry in `current` (`centeredBoxesMeet` with `LABEL_COLLISION_PADDING_PX`).
     - A spot is **clear** when it is allowed and its overlap count is 0. The overlap count is the number of foreground labels it meets (`centeredBoxesMeet` with `LABEL_NUDGE_GAP_PX`).
     - The anchor is `{0, 0}`. If the anchor is clear, use it, even when `previousNudges` holds another shift.
     - Otherwise, if `previousNudges` has this label's id and that spot is clear, use it.
     - Otherwise walk `LABEL_NUDGE_OFFSETS` in order, skipping spots that are not allowed. Take the first that is clear. If none is clear, take the earliest allowed spot with the lowest overlap count.
     - If no spot is allowed, use `{0, 0}`.
     - Write the moved label into `current`, with `x` and `y` set to the anchor plus the nudge.
  5. Return `current`, in input order. `x` and `y` are the drawn point. `paintLabel` uses them and must not add the nudge again.

- [x] **Step 5: Run the tests to confirm they pass**

  `FILE` = `mapLabelNudge`. Expected: all pass.

- [x] **Step 6: Wire it into `mapLabelLayer.ts`**

  - Add a module-level `previousNudges = new Map<string, LabelNudge>()`, with a one-line comment like its neighbors.
  - `labelsForFrame` returns `NudgedMapLabel[]`. It keeps the `placeMapLabels` call as it is, and does not reorder that result. Then it calls `nudgeBroadLabels(placed, { viewSize: { width: size.x, height: size.y }, previousNudges })`.
  - After that call, replace `previousNudges` with exactly the nudges just returned. Do not keep an id that was only in `candidateIds`. A name that was not drawn must not keep an old shift and reappear already moved. Anchor memory still uses `candidateIds`.
  - Leave `previousAnchors` handling exactly as it is. Do not add the nudge inside `paintLabel`.
  - Update the comment on `labelsForFrame`.

- [x] **Step 7: Update `doc/ux/map-surface.md`, Place names paragraph**

  - Replace `A continent name does not displace a country name, and the country is painted over it.` with `A continent name does not displace a country name. The continent name moves away from a country name it would meet, and the country is painted over it if no clear spot is near.`
  - Replace `A state name is painted over a country name it meets.` with `A country name moves away from a state name it would meet, and the state is painted over it if no clear spot is near.`
  - After the sentence ending `A continent is skipped only when it would touch another continent.`, add: ``The move is at most 60 px, in 12 px steps, to the nearest spot clear of the smaller names. With no clear spot it takes the nearest spot with the fewest overlaps. While the anchor stays blocked and the shifted spot stays clear, the name stays there. When the anchor is clear, the name returns to it (`nudgeBroadLabels` in `src/shared/mapLabelNudge.ts`).``
  - In Code Entry Points, add `` `src/shared/mapLabelNudge.ts` (`nudgeBroadLabels`) `` after the `mapLabelPlacement.ts` line.

- [x] **Step 8: Update `doc/README.md`, last paragraph**

  Before `When one of those changes`, add: ``A broader name moves off the smaller names by `nudgeBroadLabels` in `src/shared/mapLabelNudge.ts`.``

- [x] **Step 9: Verify**

  Run the Test Commands with `FILE` = `mapLabelNudge`, then `mapLabelPlacement`, then `mapLabelRules`. Expected: all pass. Then run `npm run lint`, `npm run check:renderer-types`, and `npm run naming:check`. Expected: no errors. If `naming:check` rejects the new file, follow `doc/naming-conventions-contract-v1.md` and update this plan's references to the name.

---

## Phase 4: Whole-Change Verification

No new behavior. Fix any failure at its cause, in the phase that introduced it.

- [x] **Step 1: Run the full test suite**

  Run: `npm test`. Expected: exit code 0.

- [x] **Step 2: Run the UI smoke test**

  Run: `npm run ui:smoke`. Expected: no `FAIL` lines from this change. In particular, `new game over a battle uses world names` sees continents and no states, and `closing new game restores battle names` sees countries and no continents. A state name is not required there: the battle view can be too wide for any state to pass the 40 px test. Failures in unrelated layout checks stay unrelated.

  This leaves the native module built for Electron. Run `npm run rebuild:native:node` afterward if you run `npm test` again.

- [x] **Step 3: Check documentation for stale values**

  Search `doc/` (skipping the historical documents named in `AGENTS.md`) for `slack`, `18 px`, and any statement that a continent or country name is painted over another name without moving. `slack` may remain where it describes the state linger. Ignore unrelated `18 px` sizes, including the minimap's 18 px icon and 9 px tab label. Flag only place-name sizes, and any sentence that says a broader name is painted over without moving. Expected: nothing contradicts the new behavior. `doc/terrain-pipeline.md` describes only the document format and needs no change.

- [x] **Step 4: Confirm the scope of the diff**

  Run: `git status --short`. Expected changes: the files in the File Map, this plan, and `static/renderer.js`. `scripts/basemap_pipeline/` and `data/generated/` must not appear. If `git status` shows other generated output, report it and do not revert it without checking what produced it.

- [x] **Step 5: Hand over for visual acceptance**

  Do not claim visual acceptance yourself. Report the results of Steps 1 to 4, and ask the user to run `npm start`, start a game on the global map, and check:

  | Where | Check |
  | --- | --- |
  | Eastern Europe, zoom about 5.25 | ITALY, AUSTRIA, and CROATIA show. SAN MARINO, NORTH MACEDONIA, MONACO, and VATICAN do not. EUROPE is about half again its old size and clear of POLAND |
  | Same place, zoom in to 6 or more | The small countries appear |
  | Central Asia, detail view, zoom about 7 | Roughly half as many state names. Country names are about half again their old size, and do not sit on state names where a clear spot is near |
  | Pan slowly in either view | A large name does not hop while its anchor stays blocked and its shifted spot stays clear. It returns to the anchor when that anchor is clear |
  | World view, below zoom 4 | Continent names stay their old size. One is omitted only when its box meets another continent |
  | Main map, zoom 4 or above | Continent names are half again as large |
  | Each map theme | The larger names stay readable with the existing halo |

  If the user wants different thresholds or sizes, the values to change are `COUNTRY_LABEL_ZOOM_DELAY`, `STATE_LABEL_MIN_RADIUS_PX`, `MAP_LABEL_KIND_STYLES`, `CONTINENT_BESIDE_COUNTRY_SIZE_PX`, `COUNTRY_BESIDE_STATE_SIZE_PX`, and `LABEL_NUDGE_MAX_PX`. Update the tests and the numbers in `doc/ux/map-surface.md` with them.

## Out of Scope

- Avoiding city names, which are drawn on the hex canvas above this layer.
- State borders. They stay on `visibleLabelKinds`, so a state that fails the 40 px test can still have a border.
- Keeping a label's whole box inside the view. Today only its center is tested, and that stays.
- Rebuilding the place-name data or adding fields to it.
- Release notes, which are written at release time.
