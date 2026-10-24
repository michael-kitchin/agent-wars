import type { HomeControlProgress } from '../gameActions/homeControlProgress';
import { briefingOwnSeatId } from '../briefing/briefingPerspective';
import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logTrace } from '../logger';
import { isSeatActive, sortSeatsByOrder } from '../../shared/seatRoster';
import { SECTION_TITLE_SCENARIO_OBJECTIVE, topLevelHeading } from './promptSpec/sectionHeadings';

/** First sentence of the strategic win reminder (single source for prompts and matrix tests). */
export const WIN_CONDITION_REMINDER_FIRST_SENTENCE =
  'Your goal is to be the last side standing. A side is knocked out when one other side controls its home region (see the share below), when its home region has no cities left, or when it holds no city hexes anywhere. A knocked-out side\'s units become neutral garrisons and its land becomes neutral.';

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

/** Substring matched by matrix tests for the control-based branch of the scenario objective. */
export const REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET =
  'Controlling all hexes intersecting the enemy home region';

/** Substring matched by matrix tests for the urban-elimination branch of the scenario objective. */
export const REGION_VS_REGION_SCENARIO_WIN_URBAN_SNIPPET =
  'Eliminating all urban production (tactical urban hexes) in the enemy home region';

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
 * Percent label for a regional urban-share control win.
 *
 * Purpose: The reminder, the objective snippet, and the coaching bullet must print the same percent.
 * When to use: Whenever a numeric control-win share is shown to the commander.
 * Expected outcome: `Math.round(share * 100)`. `0.75` is 75.
 * Exceptions: None.
 */
export function controlWinUrbanSharePercent(share: number): number {
  logTrace('scenarioGoals controlWinUrbanSharePercent', { share });
  return Math.round(share * 100);
}

/**
 * Control branch of the regional scenario objective.
 *
 * Purpose: Line (1) of the win block names the urban-cell share.
 * When to use: `buildRegionVsRegionScenarioObjectiveBlock` when the effective share is a number.
 * Expected outcome: The percent comes from `controlWinUrbanSharePercent`.
 * Exceptions: None.
 */
function regionalControlSnippet(share: number): string {
  const pct = controlWinUrbanSharePercent(share);
  return `Controlling enemy home region hexes that together hold at least ${pct}% of its original urban cells`;
}

/**
 * Coaching bullet for a regional urban-share control win.
 *
 * Purpose: The context block and the scenario objective name the same percent.
 * When to use: Strategic coaching when the effective share is a number.
 * Expected outcome: The percent comes from `controlWinUrbanSharePercent`.
 * Exceptions: None.
 */
export function regionalWinPathsBullet(share: number): string {
  logTrace('scenarioGoals regionalWinPathsBullet', { share });
  const pct = controlWinUrbanSharePercent(share);
  return `- Win by being the last side standing: knock out each enemy by controlling its home region (at least ${pct}% of its original urban cells), or by destroying or taking all of its cities. Those are the cells that matter.`;
}

/**
 * Builds the early win-condition paragraph for the strategic system prompt.
 *
 * Purpose: States how this consultation is won, matching the scenario the snapshot actually carries.
 * When to use: Strategic `buildSystemPromptForTools` after the opening line.
 * Expected outcome: The last-side sentence, the mutual-wipe sentence, and the combat sentence for a regional match or a known victory rule. A turn-limit match also names the limit. Otherwise the generic objective.
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
  parts.push(MUTUAL_WIPE_GOAL_SENTENCE, WIN_CONDITION_REMINDER_SECOND_SENTENCE);
  return parts.join(' ');
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
 * Urban progress against one enemy home, and that enemy's progress against ours.
 *
 * Purpose: The objective block prints one pair of lines per enemy instead of a single human-and-opponent pair.
 * When to use: `buildRegionVsRegionScenarioObjectiveBlock` when a share is in force.
 * Expected outcome: `ownAgainstEnemy` is always printed. `enemyAgainstOwn` is printed only when that enemy holds any of our home's urban cells.
 * Exceptions: None.
 */
export type EnemyUrbanProgress = {
  /**
   * The enemy's full home display name.
   *
   * Contract: `homeRegion`, not the short name.
   * When to use: Both progress labels.
   * Expected outcome: A non-empty name.
   * Exceptions: None.
   */
  readonly name: string;
  /**
   * Urban cells of that enemy's home that this commander controls.
   *
   * Contract: The pair helper's `ownAgainstEnemy`, or the older opponent-against-human progress.
   * When to use: The "in hexes you control" line.
   * Expected outcome: Held, total, and needed counts.
   * Exceptions: None.
   */
  readonly ownAgainstEnemy: HomeControlProgress;
  /**
   * Urban cells of this commander's home that the enemy controls.
   *
   * Contract: The pair helper's `enemyAgainstOwn`, or the older human-against-opponent progress.
   * When to use: The "in hexes {name} controls" line, only when `heldUrbanCells` is greater than zero.
   * Expected outcome: Held, total, and needed counts.
   * Exceptions: None.
   */
  readonly enemyAgainstOwn: HomeControlProgress;
};

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
 * Builds the Markdown “Scenario Objective” section for `region_vs_region`, or an empty string for other scenarios.
 *
 * Contract: When `state.scenarioId === 'region_vs_region'`, returns a fixed heading plus home-region labels (when present) and the two win paths the prompt still states; otherwise returns ''.
 * When to use: Strategic system prompt assembly only (`buildSystemPromptForTools`), not tactical-only prompts unless explicitly wired.
 * Expected outcome: Scenario id, own home name, one combined enemy-homes line, win bullets, one urban-progress line per enemy, and the visibility note.
 * Exceptions: None.
 */
export function buildRegionVsRegionScenarioObjectiveBlock(
  state: GameStateSnapshot,
  options?: {
    readonly controlWinMinUrbanShare?: number | null;
    readonly progress?: { readonly ai: HomeControlProgress; readonly human: HomeControlProgress } | null;
    readonly enemyProgress?: readonly EnemyUrbanProgress[] | null;
  }
): string {
  logDebug('scenarioGoals buildRegionVsRegionScenarioObjectiveBlock', {
    scenarioId: state.scenarioId,
    controlWinMinUrbanShare: options?.controlWinMinUrbanShare ?? null,
    enemyProgressCount: options?.enemyProgress?.length ?? 0,
  });
  if (state.scenarioId !== 'region_vs_region') return '';
  const lines: string[] = [
    topLevelHeading(SECTION_TITLE_SCENARIO_OBJECTIVE),
    '',
    '- Scenario: region_vs_region',
  ];
  const aiName = ownHomeName(state);
  const enemyNames = enemyHomeNames(state);
  if (aiName.length > 0) {
    lines.push(`- Your home region: ${aiName}`);
  }
  if (enemyNames.length > 0) {
    lines.push(`- Enemy home regions: ${enemyNames.join(', ')}`);
  }
  const share = options?.controlWinMinUrbanShare;
  const controlSnippet = typeof share === 'number' ? regionalControlSnippet(share) : REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET;
  lines.push(
    '- Win at end of turn by either:\n' +
      `    (1) ${controlSnippet}, OR\n` +
      `    (2) ${REGION_VS_REGION_SCENARIO_WIN_URBAN_SNIPPET}.`
  );
  const listed = enemyProgressRows(state, options);
  if (typeof share === 'number') {
    for (const row of listed) {
      lines.push(
        `- ${row.name} home urban cells in hexes you control: ${row.ownAgainstEnemy.heldUrbanCells} of ${row.ownAgainstEnemy.totalUrbanCells} (you need ${row.ownAgainstEnemy.neededUrbanCells}).`
      );
      if (row.enemyAgainstOwn.heldUrbanCells > 0) {
        lines.push(
          `- Your home urban cells in hexes ${row.name} controls: ${row.enemyAgainstOwn.heldUrbanCells} of ${row.enemyAgainstOwn.totalUrbanCells} (they need ${row.enemyAgainstOwn.neededUrbanCells}).`
        );
      }
    }
  }
  lines.push('- Every home-region outline is always visible on the map.');
  return lines.join('\n');
}

/**
 * Progress rows for the objective block.
 *
 * Purpose: Callers may pass per-enemy pairs, or the older two-sided pair, which is labeled with the human home name.
 * When to use: Only from `buildRegionVsRegionScenarioObjectiveBlock`.
 * Expected outcome: Per-enemy rows when supplied. Otherwise one row from `progress` when that object is present. Otherwise none.
 * Exceptions: None.
 */
function enemyProgressRows(
  state: GameStateSnapshot,
  options: {
    readonly progress?: { readonly ai: HomeControlProgress; readonly human: HomeControlProgress } | null;
    readonly enemyProgress?: readonly EnemyUrbanProgress[] | null;
  } | undefined
): readonly EnemyUrbanProgress[] {
  if (options?.enemyProgress && options.enemyProgress.length > 0) return options.enemyProgress;
  if (!options?.progress) return [];
  const names = enemyHomeNames(state);
  return [{
    name: names[0] ?? 'the enemy',
    ownAgainstEnemy: options.progress.ai,
    enemyAgainstOwn: options.progress.human,
  }];
}
