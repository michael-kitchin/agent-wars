/**
 * Contracts for the order-planning effects tooltip.
 *
 * Purpose: Locks the copy for a march, ferry, air strike, and ranged attack.
 * When to use: `node --test dist/main/orderPreviewEffectsTooltip.test.js` after `tsc -p tsconfig.main.json`.
 * Expected outcome: Happy paths include icons or swatches. Blocked, tagged, off, and empty orders stay null.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveOrderPreviewEffectsTooltipHtml,
  type OrderPreviewEffectsTooltipInput,
  type OrderPreviewRangedTerrainBattle,
} from '../shared/orderPreviewEffectsTooltip';
import { TOOLTIP_SECTION_GAP_HTML } from '../shared/tooltipSectionGap';
import { tacticalRes4Cell } from './tacticalBattle/testSupport/tacticalRes4HexFixtures';

const snowIcon = '<img class="weather-icon" src="weather/snow.svg" alt="" aria-hidden="true" />Snow';
const rainIcon = '<img class="weather-icon" src="weather/rain.svg" alt="" aria-hidden="true" />Rain';
const heatIcon = '<img class="weather-icon" src="weather/heat.svg" alt="" aria-hidden="true" />Heat';
const forestSwatch =
  '<span class="terrain-swatch" data-terrain-kind="forest" aria-hidden="true"></span>Forest';
const roadMark = '<img class="feature-icon" src="transport/road.svg" alt="" aria-hidden="true" />Road';
const railMark = '<img class="feature-icon" src="transport/rail.svg" alt="" aria-hidden="true" />Rail';
const usingBoth = `<strong>Using:</strong> ${roadMark}, ${railMark}`;

/**
 * Builds a legal effects input, so each test only overrides the order it cares about.
 *
 * Purpose: Keeps the null cases from repeating the shared flags.
 * When to use: Every test in this file.
 * Expected outcome: A valid, unblocked hover at Low.
 * Exceptions: None.
 */
function legal(overrides: Partial<OrderPreviewEffectsTooltipInput>): OrderPreviewEffectsTooltipInput {
  return {
    kind: 'tacticalMarch',
    hasBlockedMessage: false,
    validForAll: true,
    level: 'low',
    units: [],
    ...overrides,
  };
}

test('resolveOrderPreviewEffectsTooltipHtml shows a tactical march slowdown with a weather icon and a terrain swatch', () => {
  const html = resolveOrderPreviewEffectsTooltipHtml(
    legal({
      marchImpact: { slower: ['Forest', 'Snow'], roadRail: true },
    })
  );
  assert.ok(html?.includes(`<strong>Slower:</strong> ${forestSwatch}, ${snowIcon}`));
  assert.ok(html?.includes(`${TOOLTIP_SECTION_GAP_HTML}${usingBoth}`));
});

test('resolveOrderPreviewEffectsTooltipHtml keeps a road-or-rail tactical march on the Using line', () => {
  assert.equal(
    resolveOrderPreviewEffectsTooltipHtml(legal({ marchImpact: { slower: [], roadRail: true } })),
    usingBoth
  );
});

test('resolveOrderPreviewEffectsTooltipHtml names origin weather that slows a strategic march', () => {
  const html = resolveOrderPreviewEffectsTooltipHtml(
    legal({
      kind: 'strategicMarch',
      units: [
        { unitType: 'infantry', originWeather: 'snow', weatherTags: [] },
        { unitType: 'armor', originWeather: 'snow', weatherTags: [] },
        { unitType: 'armor', originWeather: 'snow', weatherTags: [] },
      ],
    })
  );
  assert.equal(html, `<strong>Slower:</strong> ${snowIcon}`);
});

test('resolveOrderPreviewEffectsTooltipHtml names snow when it shortens a strategic ferry', () => {
  const html = resolveOrderPreviewEffectsTooltipHtml(
    legal({
      kind: 'strategicFerry',
      destinationWeather: 'snow',
      units: [{ unitType: 'air', originWeather: 'mild', weatherTags: [] }],
    })
  );
  assert.equal(html, `<strong>Effects:</strong> ${snowIcon}`);
});

test('resolveOrderPreviewEffectsTooltipHtml names the attacker cell and unit-hex weather for a ranged shot', () => {
  const cell = tacticalRes4Cell(43, 53);
  const rangedBattle = {
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [cell]: 'forest' },
    subUnits: [
      {
        id: 'armor-1',
        parentUnitId: 'armor',
        player: 'human' as const,
        unitType: 'armor',
        h3Index: cell,
        displayName: 'Armor',
      },
    ],
  } satisfies OrderPreviewRangedTerrainBattle;
  const html = resolveOrderPreviewEffectsTooltipHtml(
    legal({
      kind: 'ranged',
      units: [{ unitType: 'armor', originWeather: 'snow', weatherTags: [] }],
      rangedBattle,
      rangedPreviewUnitIds: ['armor-1'],
    })
  );
  assert.equal(html, `<strong>Effects:</strong> ${forestSwatch}, ${snowIcon}`);
});

test('resolveOrderPreviewEffectsTooltipHtml names each untagged weather that cuts an air strike', () => {
  const html = resolveOrderPreviewEffectsTooltipHtml(
    legal({
      kind: 'airStrike',
      targetWeather: 'heat',
      units: [{ unitType: 'air', originWeather: 'snow', weatherTags: [] }],
    })
  );
  assert.equal(html, `<strong>Effects:</strong> ${snowIcon}, ${heatIcon}`);
});

test('resolveOrderPreviewEffectsTooltipHtml adds a Cover line only when the target has cover against the shooter', () => {
  assert.equal(
    resolveOrderPreviewEffectsTooltipHtml(
      legal({ kind: 'ranged', units: [{ unitType: 'armor', originWeather: 'mild' }], targetCover: { terrainKind: 'forest' } })
    ),
    `<strong>Cover:</strong> ${forestSwatch}`
  );
  assert.equal(
    resolveOrderPreviewEffectsTooltipHtml(
      legal({ kind: 'airStrike', units: [{ unitType: 'air', originWeather: 'mild' }], targetCover: { terrainKind: 'mountain' } })
    ),
    null
  );
  const snowArmor = legal({ kind: 'ranged', units: [{ unitType: 'armor', originWeather: 'snow', weatherTags: [] }] });
  assert.equal(
    resolveOrderPreviewEffectsTooltipHtml({ ...snowArmor, targetCover: null }),
    resolveOrderPreviewEffectsTooltipHtml(snowArmor)
  );
});

test('resolveOrderPreviewEffectsTooltipHtml stays empty when the order is unchanged or blocked', () => {
  assert.equal(
    resolveOrderPreviewEffectsTooltipHtml(legal({ marchImpact: { slower: [], roadRail: false } })),
    null
  );
  assert.equal(
    resolveOrderPreviewEffectsTooltipHtml(legal({ kind: 'tacticalFerry', destinationWeather: 'snow' })),
    null
  );
  assert.equal(
    resolveOrderPreviewEffectsTooltipHtml(
      legal({
        kind: 'strategicMarch',
        units: [{ unitType: 'armor', originWeather: 'mild', weatherTags: [] }],
        destinationWeather: 'snow',
      })
    ),
    null
  );
  assert.equal(
    resolveOrderPreviewEffectsTooltipHtml(
      legal({
        kind: 'strategicMarch',
        level: 'off',
        units: [{ unitType: 'armor', originWeather: 'snow', weatherTags: [] }],
      })
    ),
    null
  );
  assert.equal(
    resolveOrderPreviewEffectsTooltipHtml(
      legal({
        kind: 'strategicMarch',
        units: [{ unitType: 'armor', originWeather: 'snow', weatherTags: ['snow'] }],
      })
    ),
    null
  );
  assert.equal(
    resolveOrderPreviewEffectsTooltipHtml(
      legal({
        kind: 'strategicFerry',
        destinationWeather: 'rain',
        units: [{ unitType: 'air', weatherTags: [] }],
      })
    ),
    null
  );
  assert.equal(
    resolveOrderPreviewEffectsTooltipHtml(
      legal({
        kind: 'strategicFerry',
        level: 'off',
        destinationWeather: 'snow',
        units: [{ unitType: 'air', weatherTags: [] }],
      })
    ),
    null
  );
  assert.equal(
    resolveOrderPreviewEffectsTooltipHtml(
      legal({
        hasBlockedMessage: true,
        kind: 'ranged',
        units: [{ unitType: 'armor', originWeather: 'snow', weatherTags: [] }],
      })
    ),
    null
  );
  assert.equal(
    resolveOrderPreviewEffectsTooltipHtml(
      legal({
        kind: 'airStrike',
        targetWeather: 'mild',
        units: [{ unitType: 'air', originWeather: 'snow', weatherTags: ['snow'] }],
      })
    ),
    null
  );
  assert.equal(htmlIncludesRain(legal({ kind: 'ranged', units: [{ unitType: 'armor', originWeather: 'rain', weatherTags: [] }] })), false);
});

/**
 * Reports whether a ranged hover named rain.
 *
 * Purpose: Rain slows armor and does not change its shot, so the effects line must omit it.
 * When to use: The empty-order test.
 * Expected outcome: False for armor standing in rain.
 * Exceptions: None.
 */
function htmlIncludesRain(input: OrderPreviewEffectsTooltipInput): boolean {
  return resolveOrderPreviewEffectsTooltipHtml(input)?.includes(rainIcon) === true;
}
