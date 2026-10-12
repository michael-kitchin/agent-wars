/**
 * Strategic and tactical coordinate preambles.
 *
 * Purpose: Locks the map name and strategic resolution the model is told, and the unchanged battle-map sentence.
 * When to use: `node --test dist/main/openRouter/promptText.test.js` after `npm run build:main`.
 * Expected outcome: The global profile says `Global Earth map` at its strategic resolution. A regional profile says its display name at the catalog resolution. The tactical sentence is the same on every profile.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { GLOBAL_GAME_MAP, withGameMap } from '../../shared/activeGameMap';
import type { GameMapProfile } from '../../shared/gameMapTypes';
import { REGIONAL_RULES_BY_ID, type RegionalGameMapId } from '../../shared/regionalRulesCatalog';
import { buildLatLngPreamble, buildTacticalLatLngPreamble } from './promptText';

const POSITIONS_CLAUSE =
  'Positions are two-character briefing hex codes (A–Z and 0–9) from the operational map and Unit Status table — copy exactly; never invent codes. Distances are hex counts where shown.';

const SECOND_PARAGRAPH =
  'Final JSON: use briefing hex codes for cells; standing-order pursue uses enemy unit id (targetUnitId). Never emit raw H3 strings or latitude/longitude pairs.';

const TACTICAL_OPENING =
  "Tactical battle map: the enclosing strategic hex's tactical cells plus up to three neighboring rings (cells beyond a regional map's edge are not part of the battle).";

/**
 * A regional profile whose name and resolutions are the ones the preamble must print.
 *
 * Purpose: The assertion can read the catalog instead of repeating a resolution literal.
 * When to use: Each regional case in this file.
 * Expected outcome: The global rules and scaleranks, with this map's id, title, and catalog resolutions.
 * Exceptions: None.
 */
function regionalProfile(id: RegionalGameMapId, displayName: string): GameMapProfile {
  const rules = REGIONAL_RULES_BY_ID[id];
  return {
    ...GLOBAL_GAME_MAP,
    id,
    displayName,
    strategicResolution: rules.strategicResolution,
    tacticalResolution: rules.tacticalResolution,
  };
}

/**
 * The full strategic preamble for one map label and resolution.
 *
 * Purpose: The assertion fails when either paragraph changes, not only when the opening words are missing.
 * When to use: Each strategic case in this file.
 * Expected outcome: The label and resolution, then the unchanged positions clause and final-JSON paragraph.
 * Exceptions: None.
 */
function expectedStrategicPreamble(label: string, resolution: number): string {
  return `${label}, H3 resolution ${resolution}. ${POSITIONS_CLAUSE}\n\n${SECOND_PARAGRAPH}`;
}

test('global preamble names the Earth at the loaded strategic resolution', () => {
  const text = withGameMap(GLOBAL_GAME_MAP, () => buildLatLngPreamble());
  assert.equal(text, expectedStrategicPreamble('Global Earth map', GLOBAL_GAME_MAP.strategicResolution));
});

test('regional preamble names the loaded map at its catalog resolution', () => {
  const westernRules = REGIONAL_RULES_BY_ID.western_asia_north;
  const westernText = withGameMap(regionalProfile('western_asia_north', 'Western Asia North'), () =>
    buildLatLngPreamble()
  );
  assert.equal(westernText, expectedStrategicPreamble('Western Asia North', westernRules.strategicResolution));

  const easternRules = REGIONAL_RULES_BY_ID.eastern_asia;
  const easternText = withGameMap(regionalProfile('eastern_asia', 'Eastern Asia'), () => buildLatLngPreamble());
  assert.equal(easternText, expectedStrategicPreamble('Eastern Asia', easternRules.strategicResolution));
});

test('tactical preamble keeps one sentence on the global map and on a regional map', () => {
  const onGlobal = buildTacticalLatLngPreamble(0);
  const onWesternAsia = withGameMap(regionalProfile('western_asia_north', 'Western Asia North'), () =>
    buildTacticalLatLngPreamble(0)
  );
  const onEasternAsia = withGameMap(regionalProfile('eastern_asia', 'Eastern Asia'), () =>
    buildTacticalLatLngPreamble(0)
  );
  assert.equal(onGlobal, onWesternAsia);
  assert.equal(onGlobal, onEasternAsia);
  assert.ok(onGlobal.startsWith(TACTICAL_OPENING));
});
