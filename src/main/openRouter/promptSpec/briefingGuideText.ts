/**
 * @file briefingGuideText.ts
 * Turn-invariant rules for reading the briefing.
 *
 * Purpose: The rules for reading the briefing do not change from turn to turn, so they live in the cached system prompt.
 * When to use: From the consultation assembler, after the context section and before Available Tools.
 * Expected outcome: `# Reading the Briefing` and the subsections whose gates hold, or '' when none apply. Map legend, distances, and the odds key require a precomputed briefing. Air, memory, missiles, and transport do not.
 * Exceptions: None.
 */

import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../../shared/tacticalRanges';
import { strategicFerryRangeHexes } from '../../../shared/weatherBonusRules';
import { FORTIFIED_MAP_LEGEND_FRAGMENT } from '../../../shared/fortificationRules';
import { emptyOverlayGlyph } from '../../briefing/map/hexMapRenderer';
import { BEST_OPTIONS_ODDS_LINE } from '../../briefing/map/briefingTables';
import { MISSILE_TARGETS_TABLE_INTRO } from '../briefingSectionsMissiles';
import { PERSISTENT_LIMIT } from '../../tools/memory';
import { logTrace } from '../../logger';
import { SECTION_TITLE_READING_THE_BRIEFING, subHeading, topLevelHeading } from './sectionHeadings';
import {
  SECTION_TITLE_AIR_OPERATIONS_TABLE,
  SECTION_TITLE_BEST_OPTIONS_ODDS,
  SECTION_TITLE_DISTANCES_AND_INTEL_AGE,
  SECTION_TITLE_MAP_LEGEND,
  SECTION_TITLE_MEMORY_SLOTS,
  SECTION_TITLE_MISSILE_TARGETS,
  SECTION_TITLE_TRANSPORT,
} from './subsectionHeadings';

/**
 * Which briefing-guide subsections to print.
 *
 * Purpose: Each flag matches one subsection the outline names.
 * When to use: When assembling the system prompt.
 * Expected outcome: A subsection prints only when its flag holds and the briefing was precomputed.
 * Exceptions: None.
 */
export interface BriefingGuideGates {
  /**
   * Strategic or tactical wording for the map, air, and transport lines.
   *
   * Contract: `'tactical'` selects the battle sentences. Any other value selects the strategic sentences.
   * When to use: Pass the consultation coordinate mode.
   * Expected outcome: Battle consultations omit distances, odds, memory, and missiles.
   * Exceptions: None.
   */
  readonly coordinateMode: 'strategic' | 'tactical';
  /**
   * Whether a Commander's Briefing was built for this consultation.
   *
   * Contract: False omits the map legend, the distance caveats, and the odds key. Roster rules still print.
   * When to use: True only when `formatBriefing` ran.
   * Expected outcome: The map legend, distance caveats, and odds key are omitted when false.
   * Exceptions: None.
   */
  readonly hasPrecomputedBriefing: boolean;
  /**
   * Distance and intel-age sentences for this fog setting.
   *
   * Contract: Printed only on a strategic precomputed briefing, and only when the list is non-empty.
   * When to use: Pass `briefingDistanceCaveatLines`.
   * Expected outcome: One paragraph per line under Distances and Intel Age.
   * Exceptions: None.
   */
  readonly distanceCaveatLines: readonly string[];
  /**
   * Whether the Best Options table has an Odds column in this mode.
   *
   * Contract: True for a precomputed briefing in either mode, because both Best Options tables carry Odds.
   * When to use: Set from the briefing flag.
   * Expected outcome: The odds glossary prints only when true.
   * Exceptions: None.
   */
  readonly includeOddsKey: boolean;
  /**
   * Whether memory tools and the memory envelope are on.
   *
   * Contract: Strategic only. Battles omit the subsection even when this is true.
   * When to use: Pass the memory tool flag.
   * Expected outcome: The slot rules print when this is true on a strategic consultation.
   * Exceptions: None.
   */
  readonly memoryEnabled: boolean;
  /**
   * Whether the side's roster includes an air unit.
   *
   * Contract: Gates the air-operations sentence and the airlift sentence.
   * When to use: Pass the roster flag.
   * Expected outcome: No air subsection when false.
   * Exceptions: None.
   */
  readonly hasAirUnits: boolean;
  /**
   * Whether the side's roster includes a naval unit.
   *
   * Contract: Gates the embark sentence.
   * When to use: Pass the roster flag.
   * Expected outcome: No embark sentence when false. Airlift can still print.
   * Exceptions: None.
   */
  readonly hasNavalUnits: boolean;
  /**
   * Whether the side's roster includes a missile unit.
   *
   * Contract: Strategic only.
   * When to use: Pass the roster flag.
   * Expected outcome: The missile-target sentence prints when this is true on a strategic consultation.
   * Exceptions: None.
   */
  readonly hasMissileUnits: boolean;
}

/**
 * Strategic operational-map legend, one line per bullet.
 *
 * Purpose: The legend does not change with the window, so it leaves the map and the get_map tool.
 * When to use: The Map Legend subsection of a strategic briefing guide.
 * Expected outcome: Five lines. The Shown line stays with the map.
 * Exceptions: None.
 */
export const STRATEGIC_MAP_LEGEND_LINES: readonly string[] = [
  'Each cell: top = hex code, bottom = terrain + overlay.',
  'Terrain: x = land, . = water.',
  `Overlay: ${emptyOverlayGlyph} = nothing here, * = your units, ! = enemy units, including neutral garrisons, # = contested, ? = undiscovered intel.`,
  'Features: A/a airport, S/s seaport, B/b both, U/u urban only; uppercase = your control.',
  'Each fenced block is one connected area. Odd rows in that block are indented one space. Use only hex codes from these blocks or the tables.',
];

/**
 * Battle-map legend, one line per bullet.
 *
 * Purpose: The battle legend always names fortified cells, even when this battle has none.
 * When to use: The Map Legend subsection of a battle briefing guide.
 * Expected outcome: Five lines. The Shown line stays with the map.
 * Exceptions: None.
 */
export const TACTICAL_MAP_LEGEND_LINES: readonly string[] = [
  'Each cell: top = tactical hex code, bottom = terrain + overlay.',
  'Terrain: x = land, . = water.',
  `Overlay: ${emptyOverlayGlyph} = nothing here, * = your units, ! = enemy units, including neutral garrisons, # = contested.`,
  `Features: A/a airport, S/s seaport, B/b both, U/u urban only${FORTIFIED_MAP_LEGEND_FRAGMENT}; uppercase = your control.`,
  'Odd rows are indented one space. Use only hex codes from this map or tables.',
];

const SNOW_FERRY_RANGE = strategicFerryRangeHexes({ weatherAtDestination: 'snow', tags: [], enabled: true });

/**
 * Strategic air-operations rules, including the callback sentence.
 *
 * Purpose: Both sentences used to sit under Air Operations Status and do not read the snapshot.
 * When to use: The Air Operations Table subsection when the side has air units.
 * Expected outcome: The ferry and strike sentence, a blank line, then the infrastructure_destroyed callback sentence.
 * Exceptions: None.
 */
export const AIR_OPERATIONS_TABLE_RULES =
  `Air rules: an air unit ferries any distance by hopping controlled intact airports. Each hop is at most ${AIR_FERRY_RANGE_HEXES} hexes, or ${SNOW_FERRY_RANGE} into snow when the unit lacks the snow tag. It strikes and drops within ${AIR_STRIKE_RANGE_HEXES} of its current airport. Ferry Destinations lists at most 8 nearest reachable airports; any other airport you control may be legal, and plan_route confirms the chain. One air action per unit per turn.\n\nCallback support: subscribe with event "infrastructure_destroyed" and parameters targetType plus the briefing hex code to be re-consulted after successful infra strikes.`;

/**
 * Battle air-operations rules.
 *
 * Purpose: The battle sentence does not read the snapshot.
 * When to use: The Air Operations Table subsection of a battle whose roster has air.
 * Expected outcome: Footprint strikes, one-hop ferry, and one infantry sub-unit per air sub-unit.
 * Exceptions: None.
 */
export const TACTICAL_AIR_OPERATIONS_TABLE_RULES =
  'Air rules (tactical): strikes and drops cover this battle footprint; ferry is one hop between intact airport cells; an air sub-unit carries one infantry sub-unit.';

/**
 * Strategic naval embark rule.
 *
 * Purpose: The sentence used to sit under Naval Transport Status.
 * When to use: The Transport subsection when the side has naval units.
 * Expected outcome: Coastal or land seaport, or a water seaport the side controls, and the capacity line.
 * Exceptions: None.
 */
export const NAVAL_EMBARK_RULE =
  'Embark: coastal or land seaport (control not required), or a water seaport you control. Capacity: 1 armor or 2 infantry per naval unit.';

/**
 * Battle naval capacity rule.
 *
 * Purpose: The sentence does not read the battle snapshot.
 * When to use: The Transport subsection of a battle whose roster has naval units.
 * Expected outcome: The same capacity, plus the debark reminder.
 * Exceptions: None.
 */
export const TACTICAL_SEALIFT_RULE =
  'Tactical sealift: capacity 1 armor or 2 infantry per naval sub-unit. Debark before independent land marches.';

/**
 * Strategic airlift rule.
 *
 * Purpose: The sentence used to sit in the sealift block when the side has air units.
 * When to use: The Transport subsection of a strategic consultation.
 * Expected outcome: One infantry unit, boarded with embark and moved with ferryOrders.
 * Exceptions: None.
 */
export const AIRLIFT_RULE_STRATEGIC =
  'An air unit carries one infantry unit, boarded with embark, moved with ferryOrders, unloaded with disembark or airDrops.';

/**
 * Battle airlift rule.
 *
 * Purpose: The battle sentence names sub-units and omits ferryOrders.
 * When to use: The Transport subsection of a battle whose roster has air.
 * Expected outcome: One infantry sub-unit, boarded with embark.
 * Exceptions: None.
 */
export const AIRLIFT_RULE_TACTICAL =
  'An air sub-unit carries one infantry sub-unit, boarded with embark, unloaded with disembark or airDrops.';

/**
 * Missile target-table rule. One definition with the briefing constant.
 *
 * Purpose: The sentence used to introduce the target table.
 * When to use: The Missile Targets subsection.
 * Expected outcome: Explored enemy hexes a missile can reach.
 * Exceptions: None.
 */
export const MISSILE_TARGETS_RULE = MISSILE_TARGETS_TABLE_INTRO;

/**
 * Persistent-slot rules.
 *
 * Purpose: The two sentences used to sit in Your Strategic Memory and do not list stored keys.
 * When to use: The Memory Slots subsection.
 * Expected outcome: The replacement rule, then the memory_read rule. The slot count matches `PERSISTENT_LIMIT`.
 * Exceptions: None.
 */
export const MEMORY_SLOT_RULES =
  `A new persistent key replaces the oldest persistent note when all ${PERSISTENT_LIMIT} persistent slots are full.\n\nUse memory_read to retrieve stored memories by key or tag. To add, update, or remove memories, use "memoryUpdates" in your final JSON (write/delete actions); there are no memory_write or memory_delete tools.`;

/**
 * Appends one H2 subsection when its body is non-empty.
 *
 * Purpose: Keeps the section order in one place.
 * When to use: From `buildBriefingGuideSection` only.
 * Expected outcome: Heading, blank line, body.
 * Exceptions: None.
 */
function pushSubsection(sections: string[], title: string, body: string): void {
  const trimmed = body.trim();
  if (trimmed.length === 0) return;
  sections.push(`${subHeading(title)}\n\n${trimmed}`);
}

/**
 * Builds `# Reading the Briefing` for the gates that hold.
 *
 * Purpose: One cached section replaces the sentences that used to repeat inside the briefing.
 * When to use: After the context section. Skip the result when it is ''.
 * Expected outcome: The subsections in outline order, or '' when no subsection applies. A briefing is required only for the map, the distance caveats, and the odds key.
 * Exceptions: None.
 */
export function buildBriefingGuideSection(gates: BriefingGuideGates): string {
  logTrace('briefingGuideText buildBriefingGuideSection', {
    coordinateMode: gates.coordinateMode,
    hasPrecomputedBriefing: gates.hasPrecomputedBriefing,
    caveatCount: gates.distanceCaveatLines.length,
  });
  const strategic = gates.coordinateMode !== 'tactical';
  const sections: string[] = [];
  if (gates.hasPrecomputedBriefing && strategic && gates.distanceCaveatLines.length > 0) {
    pushSubsection(sections, SECTION_TITLE_DISTANCES_AND_INTEL_AGE, gates.distanceCaveatLines.join('\n\n'));
  }
  if (gates.hasPrecomputedBriefing) {
    const legend = strategic ? STRATEGIC_MAP_LEGEND_LINES : TACTICAL_MAP_LEGEND_LINES;
    pushSubsection(sections, SECTION_TITLE_MAP_LEGEND, legend.map((line) => `- ${line}`).join('\n'));
  }
  if (gates.includeOddsKey) pushSubsection(sections, SECTION_TITLE_BEST_OPTIONS_ODDS, BEST_OPTIONS_ODDS_LINE);
  if (strategic && gates.memoryEnabled) pushSubsection(sections, SECTION_TITLE_MEMORY_SLOTS, MEMORY_SLOT_RULES);
  if (gates.hasAirUnits) {
    pushSubsection(
      sections,
      SECTION_TITLE_AIR_OPERATIONS_TABLE,
      strategic ? AIR_OPERATIONS_TABLE_RULES : TACTICAL_AIR_OPERATIONS_TABLE_RULES
    );
  }
  if (strategic && gates.hasMissileUnits) pushSubsection(sections, SECTION_TITLE_MISSILE_TARGETS, MISSILE_TARGETS_RULE);
  const transport: string[] = [];
  if (gates.hasNavalUnits) transport.push(strategic ? NAVAL_EMBARK_RULE : TACTICAL_SEALIFT_RULE);
  if (gates.hasAirUnits) transport.push(strategic ? AIRLIFT_RULE_STRATEGIC : AIRLIFT_RULE_TACTICAL);
  if (transport.length > 0) pushSubsection(sections, SECTION_TITLE_TRANSPORT, transport.join('\n\n'));
  if (sections.length === 0) return '';
  return `${topLevelHeading(SECTION_TITLE_READING_THE_BRIEFING)}\n\n${sections.join('\n\n')}`;
}
