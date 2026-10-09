import type { HomeControlProgress } from '../gameActions/homeControlProgress';
import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logTrace } from '../logger';
import { SECTION_TITLE_SCENARIO_OBJECTIVE, topLevelHeading } from './promptSpec/sectionHeadings';

/** First sentence of the strategic/tactical win reminder (single source for prompts and matrix tests). */
export const WIN_CONDITION_REMINDER_FIRST_SENTENCE =
  'Your goal is to win the game, and to achieve this you must control all enemy home region hexes or destroy all enemy home region production capacity.';

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
 * First sentence of the regional urban-share win reminder.
 *
 * Purpose: A regional map states the urban-cell share instead of every hex.
 * When to use: `buildWinConditionReminderClause` when the effective share is a number.
 * Expected outcome: The percent comes from `controlWinUrbanSharePercent`.
 * Exceptions: None.
 */
function regionalWinConditionFirstSentence(share: number): string {
  const pct = controlWinUrbanSharePercent(share);
  return `Your goal is to win the game, and to achieve this you must control enemy home region hexes that together hold at least ${pct}% of the enemy home region's original urban cells, or destroy all enemy home region production capacity.`;
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
  return `- Win by controlling enemy home hexes that hold at least ${pct}% of its original urban cells, or by destroying all enemy home region production capacity. Those are the cells that matter.`;
}

/**
 * Builds the early win-condition paragraph for the strategic system prompt.
 *
 * Purpose: States how this consultation is won, matching the scenario the snapshot actually carries.
 * When to use: Strategic `buildSystemPromptForTools` after the opening line.
 * Expected outcome: Home-region wording only for `region_vs_region`; otherwise the generic objective with no reused home-region sentences.
 * Exceptions: None.
 */
export function buildWinConditionReminderClause(args: {
  readonly scenarioId?: string | null;
  readonly controlWinMinUrbanShare?: number | null;
}): string {
  logDebug('scenarioGoals buildWinConditionReminderClause', {
    scenarioId: args.scenarioId,
    controlWinMinUrbanShare: args.controlWinMinUrbanShare ?? null,
  });
  if (args.scenarioId === 'region_vs_region') {
    const first =
      typeof args.controlWinMinUrbanShare === 'number'
        ? regionalWinConditionFirstSentence(args.controlWinMinUrbanShare)
        : WIN_CONDITION_REMINDER_FIRST_SENTENCE;
    return `${first} ${WIN_CONDITION_REMINDER_SECOND_SENTENCE}`;
  }
  return `${GENERIC_OBJECTIVE_SENTENCE}`;
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
 * Builds the Markdown “Scenario Objective” section for `region_vs_region`, or an empty string for other scenarios.
 *
 * Contract: When `state.scenarioId === 'region_vs_region'`, returns a fixed heading plus home-region labels (when present) and win paths aligned with `evaluateRegionControlWinnerAtEndOfTurn`; otherwise returns ''.
 * When to use: Strategic system prompt assembly only (`buildSystemPromptForTools`), not tactical-only prompts unless explicitly wired.
 * Expected outcome: Multi-line string listing scenario id, optional “Your home region” / “Enemy home region” lines from state, win bullets for full enemy-home control or enemy-home urban elimination, and visibility note.
 * Exceptions: None.
 */
export function buildRegionVsRegionScenarioObjectiveBlock(
  state: GameStateSnapshot,
  options?: {
    readonly controlWinMinUrbanShare?: number | null;
    readonly progress?: { readonly ai: HomeControlProgress; readonly human: HomeControlProgress } | null;
  }
): string {
  logDebug('scenarioGoals buildRegionVsRegionScenarioObjectiveBlock', {
    scenarioId: state.scenarioId,
    controlWinMinUrbanShare: options?.controlWinMinUrbanShare ?? null,
  });
  if (state.scenarioId !== 'region_vs_region') return '';
  const lines: string[] = [
    topLevelHeading(SECTION_TITLE_SCENARIO_OBJECTIVE),
    '',
    '- Scenario: region_vs_region',
  ];
  const aiName = typeof state.aiHomeRegion === 'string' ? state.aiHomeRegion.trim() : '';
  const humanName = typeof state.humanHomeRegion === 'string' ? state.humanHomeRegion.trim() : '';
  if (aiName.length > 0) {
    lines.push(`- Your home region: ${aiName}`);
  }
  if (humanName.length > 0) {
    lines.push(`- Enemy home region: ${humanName}`);
  }
  const share = options?.controlWinMinUrbanShare;
  const controlSnippet = typeof share === 'number' ? regionalControlSnippet(share) : REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET;
  lines.push(
    '- Win at end of turn by either:\n' +
      `    (1) ${controlSnippet}, OR\n` +
      `    (2) ${REGION_VS_REGION_SCENARIO_WIN_URBAN_SNIPPET}.`
  );
  const progress = options?.progress;
  if (progress && typeof share === 'number') {
    lines.push(
      `- Enemy home urban cells in hexes you control: ${progress.ai.heldUrbanCells} of ${progress.ai.totalUrbanCells} (you need ${progress.ai.neededUrbanCells}).`
    );
    lines.push(
      `- Your home urban cells in hexes the enemy controls: ${progress.human.heldUrbanCells} of ${progress.human.totalUrbanCells} (they need ${progress.human.neededUrbanCells}).`
    );
  }
  lines.push('- Both home-region outlines are always visible on the map.');
  return lines.join('\n');
}
