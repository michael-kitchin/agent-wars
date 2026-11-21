import type { KnockoutStatusForSeat, SideKnockoutStatus } from '../gameActions/knockoutStatus';
import { briefingOwnSeatId } from '../briefing/briefingPerspective';
import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logTrace } from '../logger';
import { isSeatActive, sortSeatsByOrder } from '../../shared/seatRoster';
import { NEAR_KNOCKOUT_MAX_CITY_HEXES } from '../../shared/victoryRules';
import { formatHomeRegionHexCodesForPrompt } from './consultPromptPartsHelpers';
import { SECTION_TITLE_SCENARIO_OBJECTIVE, topLevelHeading } from './promptSpec/sectionHeadings';

/** First sentence of the strategic win reminder (single source for prompts and matrix tests). */
export const WIN_CONDITION_REMINDER_FIRST_SENTENCE =
  'Your goal is to be the last side standing. A side is knocked out when other sides and Neutral together hold its home region (see the share below), when its home region has no cities left, or when it holds no city hexes anywhere. A knocked-out side\'s units become neutral garrisons and its land becomes neutral.';

/**
 * Turn-limit sentence appended to the last-side goal.
 *
 * Purpose: A global match can end with several sides still playing, ranked by city hexes.
 * When to use: `buildWinConditionReminderClause` when the victory rule is `most_city_hexes_at_turn_limit` and a limit is stored.
 * Expected outcome: Replace `{L}` with the stored turn limit before printing.
 * Exceptions: None.
 */
export const TURN_LIMIT_GOAL_SENTENCE =
  'The match ends after turn {L}. If more than one side is left then, the side holding the most city hexes wins.';

/**
 * Mutual-wipe sentence appended to both win rules.
 *
 * Purpose: A turn that would knock out every side cancels those knockouts and ranks by city hexes, with no winner when the top count is shared.
 * When to use: After the last-side sentence, and after the turn-limit sentence when that sentence is present.
 * Expected outcome: The printed sentence. A tie leaves no single side the winner.
 * Exceptions: None.
 */
export const MUTUAL_WIPE_GOAL_SENTENCE =
  'If every side would be knocked out on the same turn, none is knocked out and the match ends. The side holding the most city hexes wins. If several sides hold that many, no single side wins.';

const WIN_CONDITION_REMINDER_SECOND_SENTENCE =
  'Enemy units can be destroyed through ranged and melee combat, and production capacity can be destroyed through air strikes. Review the rules, below, for how to order this.';

/** Substring matched by matrix tests for the home-loss branch of the scenario objective when no share applies. */
export const REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET =
  'Other sides and Neutral together holding every hex of the enemy home region';

/** Substring matched by matrix tests for the urban-elimination branch of the scenario objective. */
export const REGION_VS_REGION_SCENARIO_WIN_URBAN_SNIPPET =
  'Eliminating all urban production (tactical urban hexes) in the enemy home region';

/** Substring matched by matrix tests for the no-city-hexes branch of the scenario objective. */
export const REGION_VS_REGION_SCENARIO_NO_CITY_SNIPPET =
  'Taking every city hex the enemy holds anywhere';

/**
 * The generic objective used when the snapshot has no recognised scenario id.
 *
 * Purpose: A prompt without `region_vs_region` must still name a goal, and must not reuse home-region wording.
 * When to use: `buildWinConditionReminderClause` for an absent or unrecognised id.
 * Expected outcome: Destroy-the-force or take-territory language with no home-region or urban-production clause.
 * Exceptions: None.
 */
export const GENERIC_OBJECTIVE_SENTENCE =
  'Your goal is to destroy the enemy force or take enemy territory.';

/**
 * Percent label for the home-loss share.
 *
 * Purpose: The reminder, the objective snippet, and the coaching bullet must print the same percent.
 * When to use: Whenever a numeric home-loss share is shown to the commander.
 * Expected outcome: `Math.round(share * 100)`. `0.75` is 75.
 * Exceptions: None.
 */
export function controlWinUrbanSharePercent(share: number): number {
  logTrace('scenarioGoals controlWinUrbanSharePercent', { share });
  return Math.round(share * 100);
}

/**
 * Home-loss branch of the scenario objective when a share applies.
 *
 * Purpose: Line (1) of the knockout block names the urban-cell share that other sides and Neutral must hold together.
 * When to use: `buildScenarioObjectiveRulesBlock` when the effective share is a number.
 * Expected outcome: The percent comes from `controlWinUrbanSharePercent`.
 * Exceptions: None.
 */
function regionalControlSnippet(share: number): string {
  const pct = controlWinUrbanSharePercent(share);
  return `Other sides and Neutral together holding enemy home region hexes with at least ${pct}% of its original urban cells`;
}

/**
 * Coaching bullet for the home-loss share.
 *
 * Purpose: The context block and the scenario objective name the same percent, and the bullet tells the commander that a side with few city hexes is close to being knocked out.
 * When to use: Strategic coaching when the effective share is a number.
 * Expected outcome: The percent comes from `controlWinUrbanSharePercent`.
 * Exceptions: None.
 */
export function regionalWinPathsBullet(share: number): string {
  logTrace('scenarioGoals regionalWinPathsBullet', { share });
  const pct = controlWinUrbanSharePercent(share);
  return `- Win by being the last side standing: an enemy is knocked out when other sides and Neutral together hold its home region (at least ${pct}% of its original urban cells), when its home cities are destroyed, or when it holds no city hex anywhere. Those are the cells that matter. A side with only a few city hexes left is close to being knocked out.`;
}

/**
 * Builds the early win-condition paragraph for the strategic system prompt.
 *
 * Purpose: States how this consultation is won, matching the scenario the snapshot actually carries.
 * When to use: Strategic `buildSystemPromptForTools` after the opening line.
 * Expected outcome: The last-side sentence as its own paragraph, then the mutual-wipe sentence and the combat sentence together. A turn-limit match puts the limit sentence in the paragraph between those two. Otherwise the generic objective, still one paragraph.
 * Exceptions: None.
 */
export function buildWinConditionReminderClause(args: {
  readonly scenarioId?: string | null;
  readonly controlWinMinUrbanShare?: number | null;
  readonly victoryRule?: string | null;
  readonly turnLimit?: number | null;
}): string {
  logDebug('scenarioGoals buildWinConditionReminderClause', {
    scenarioId: args.scenarioId,
    controlWinMinUrbanShare: args.controlWinMinUrbanShare ?? null,
    victoryRule: args.victoryRule ?? null,
    turnLimit: args.turnLimit ?? null,
  });
  const matchGoal = args.scenarioId === 'region_vs_region'
    || args.victoryRule === 'last_side_standing'
    || args.victoryRule === 'most_city_hexes_at_turn_limit';
  if (!matchGoal) return GENERIC_OBJECTIVE_SENTENCE;
  const parts = [WIN_CONDITION_REMINDER_FIRST_SENTENCE];
  if (args.victoryRule === 'most_city_hexes_at_turn_limit' && typeof args.turnLimit === 'number') {
    parts.push(TURN_LIMIT_GOAL_SENTENCE.replace('{L}', String(args.turnLimit)));
  }
  parts.push(`${MUTUAL_WIPE_GOAL_SENTENCE} ${WIN_CONDITION_REMINDER_SECOND_SENTENCE}`);
  return parts.join('\n\n');
}

/**
 * Battle-local goal sentence for tactical system prompts (no regional win-condition text).
 *
 * Purpose: Keeps tactical beats focused on engaging forces inside the footprint without restating strategic home-region victory.
 * When to use: `buildSystemPromptForTools` when `coordinateContext.mode === 'tactical'`.
 * Expected outcome: Short engage-and-defeat reminder plus pointer to combat/order rules below.
 * Exceptions: None.
 */
export function buildTacticalBattleGoalClause(): string {
  logDebug('scenarioGoals buildTacticalBattleGoalClause', {});
  return 'Your goal is to engage and defeat enemy forces in this battle. Review the rules, below, for how to order this.';
}

/**
 * Active enemies' home names in seat order, or the two-sided human home when the roster is absent.
 *
 * Purpose: The objective line lists every enemy home.
 * When to use: The "Enemy home regions" line and the fallback progress label.
 * Expected outcome: Full home names. An empty list when the roster is absent.
 * Exceptions: None.
 */
function enemyHomeNames(state: GameStateSnapshot): string[] {
  const seats = state.seats ?? [];
  if (seats.length > 0) {
    const own = briefingOwnSeatId(state);
    return sortSeatsByOrder(seats)
      .filter((seat) => seat.seatId !== own && isSeatActive(seat))
      .map((seat) => seat.homeRegion.trim())
      .filter((name) => name.length > 0);
  }
  return [];
}

/**
 * Own home name from the roster, or the two-sided AI home when the roster is absent.
 *
 * Purpose: "Your home region" follows the commander being briefed.
 * When to use: The objective block's own-home line.
 * Expected outcome: That seat's `homeRegion`. Empty when the roster has no row for the seat.
 * Exceptions: None.
 */
function ownHomeName(state: GameStateSnapshot): string {
  const seats = state.seats ?? [];
  if (seats.length > 0) {
    const own = briefingOwnSeatId(state);
    const seat = seats.find((row) => row.seatId === own);
    return seat?.homeRegion.trim() ?? '';
  }
  return '';
}

/**
 * Builds the turn-invariant Scenario Objective section for `region_vs_region`.
 *
 * Purpose: Home names, win paths, and the visibility sentence do not change during a match, so they belong in the system prompt.
 * When to use: Strategic system-prompt assembly when `scenarioId` is `region_vs_region`.
 * Expected outcome: The heading, the scenario id, home names, the three knockout paths, and the outline sentence. '' for any other scenario. No urban-share counts.
 * Exceptions: None.
 */
export function buildScenarioObjectiveRulesBlock(
  state: GameStateSnapshot,
  options?: { readonly controlWinMinUrbanShare?: number | null }
): string {
  logDebug('scenarioGoals buildScenarioObjectiveRulesBlock', {
    scenarioId: state.scenarioId,
    controlWinMinUrbanShare: options?.controlWinMinUrbanShare ?? null,
  });
  if (state.scenarioId !== 'region_vs_region') return '';
  const lines: string[] = [
    topLevelHeading(SECTION_TITLE_SCENARIO_OBJECTIVE),
    '',
    '- Scenario: region_vs_region',
  ];
  const aiName = ownHomeName(state);
  const enemyNames = enemyHomeNames(state);
  if (aiName.length > 0) lines.push(`- Your home region: ${aiName}`);
  if (enemyNames.length > 0) lines.push(`- Enemy home regions: ${enemyNames.join(', ')}`);
  const share = options?.controlWinMinUrbanShare;
  const controlSnippet = typeof share === 'number' ? regionalControlSnippet(share) : REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET;
  lines.push(
    '- Knock an enemy out at the end of a turn by any of these:\n' +
      `    (1) ${controlSnippet}, OR\n` +
      `    (2) ${REGION_VS_REGION_SCENARIO_WIN_URBAN_SNIPPET}, OR\n` +
      `    (3) ${REGION_VS_REGION_SCENARIO_NO_CITY_SNIPPET}.`
  );
  lines.push('- Every home-region outline is always visible on the map.');
  return lines.join('\n');
}

/**
 * Phrase for how many city hexes a side holds.
 *
 * Purpose: The knockout status lines read the same way for every count.
 * When to use: `ownStatusLines` and `enemyStatusLines`.
 * Expected outcome: `no city hexes`, `1 city hex`, or `${n} city hexes`.
 * Exceptions: None.
 */
function cityHexPhrase(count: number): string {
  if (count === 0) return 'no city hexes';
  return count === 1 ? '1 city hex' : `${count} city hexes`;
}

/**
 * Listing of city hexes with their codes and urban cells.
 *
 * Purpose: A side close to being knocked out has its city hexes named so a commander can go for them.
 * When to use: The second line under a near-knockout side.
 * Expected outcome: `${code} (${cells} urban cell(s))` items joined with `, `.
 * Exceptions: None.
 */
function cityHexListing(cityHexes: SideKnockoutStatus['cityHexes']): string {
  return cityHexes
    .map((hex) => `${formatHomeRegionHexCodesForPrompt([hex.h3Index])} (${hex.urbanCells} urban ${hex.urbanCells === 1 ? 'cell' : 'cells'})`)
    .join(', ');
}

/**
 * Whether a side's city hexes should be listed.
 *
 * Purpose: Only a side that holds at least one and at most `NEAR_KNOCKOUT_MAX_CITY_HEXES` city hexes is listed.
 * When to use: `ownStatusLines` and `enemyStatusLines`.
 * Expected outcome: True for a count from 1 through the near-knockout limit.
 * Exceptions: None.
 */
function isNearKnockout(row: SideKnockoutStatus): boolean {
  return row.cityHexes.length >= 1 && row.cityHexes.length <= NEAR_KNOCKOUT_MAX_CITY_HEXES;
}

/**
 * Knockout status lines for the commander's own side.
 *
 * Purpose: The commander sees how many city hexes it holds and how much of its home is lost.
 * When to use: First in `buildScenarioProgressLines`.
 * Expected outcome: The share or every-hex line, then the city hex listing when the side is near knockout.
 * Exceptions: None.
 */
function ownStatusLines(row: SideKnockoutStatus): string[] {
  const loss = row.homeLoss;
  const held = cityHexPhrase(row.cityHexes.length);
  const lines = [
    loss.everyHexRule
      ? `- Your side: you hold ${held}. Other sides and Neutral hold ${loss.lostHexes} of your ${loss.totalHexes} home hexes. You are knocked out if they hold all of them, or if you lose every city hex.`
      : `- Your side: you hold ${held}. Other sides and Neutral hold ${loss.lostUrbanCells} of your home's ${loss.totalUrbanCells} original urban cells. You are knocked out if they reach ${loss.neededUrbanCells}, or if you lose every city hex.`,
  ];
  if (isNearKnockout(row)) lines.push(`  Your city hexes: ${cityHexListing(row.cityHexes)}.`);
  return lines;
}

/**
 * Knockout status lines for one enemy.
 *
 * Purpose: The commander sees how close an enemy is to being knocked out, and which of its city hexes it knows about.
 * When to use: Once per enemy in `buildScenarioProgressLines`.
 * Expected outcome: The share or every-hex line, then a listing line when the enemy is near knockout. The listing respects the hexes the viewer has explored. A missing explored list means every hex is explored.
 * Exceptions: None.
 */
function enemyStatusLines(state: GameStateSnapshot, row: SideKnockoutStatus): string[] {
  const loss = row.homeLoss;
  const held = cityHexPhrase(row.cityHexes.length);
  const lines = [
    loss.everyHexRule
      ? `- ${row.name}: holds ${held}. Other sides and Neutral hold ${loss.lostHexes} of its ${loss.totalHexes} home hexes. It is knocked out if they hold all of them, or if it loses every city hex.`
      : `- ${row.name}: holds ${held}. Other sides and Neutral hold ${loss.lostUrbanCells} of its home's ${loss.totalUrbanCells} original urban cells, ${row.viewerHeldHomeUrbanCells} of them yours. It is knocked out if they reach ${loss.neededUrbanCells}, or if it loses every city hex.`,
  ];
  if (!isNearKnockout(row)) return lines;
  const explored = state.exploredHexes ? new Set(state.exploredHexes) : null;
  const known = explored ? row.cityHexes.filter((hex) => explored.has(hex.h3Index)) : row.cityHexes;
  if (known.length === row.cityHexes.length) {
    lines.push(`  Its city hexes: ${cityHexListing(known)}. Taking all of them knocks it out.`);
  } else if (known.length > 0) {
    lines.push(`  Its known city hexes: ${cityHexListing(known)}. Some of its city hexes are unexplored.`);
  } else {
    lines.push('  Its city hexes are unexplored.');
  }
  return lines;
}

/**
 * Knockout status bullets for the situation message.
 *
 * Purpose: These counts change as hexes change hands, so they stay out of the cached system prompt.
 * When to use: Under Scenario Progress on a strategic region-versus-region consultation.
 * Expected outcome: The commander's own lines, then each enemy's lines in the order of `status.enemies`. [] when the scenario is not region_vs_region or `status` is null.
 * Exceptions: None.
 */
export function buildScenarioProgressLines(state: GameStateSnapshot, status: KnockoutStatusForSeat | null): string[] {
  logDebug('scenarioGoals buildScenarioProgressLines', {
    scenarioId: state.scenarioId,
    enemyCount: status?.enemies.length ?? 0,
  });
  if (state.scenarioId !== 'region_vs_region' || !status) return [];
  return [...ownStatusLines(status.own), ...status.enemies.flatMap((row) => enemyStatusLines(state, row))];
}
