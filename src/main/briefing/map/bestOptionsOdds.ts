/**
 * Engine-computed odds for Best Options attack rows.
 *
 * Purpose: The briefing carries the fight math, so the model does not have to call `estimate_combat` before a listed row.
 * When to use: From the Best Options table renderer, once per grouped row.
 * Expected outcome: A short cell such as `wipe 62%, lose 19%`, or an em dash when the row is not a fight.
 * Exceptions: A thrown estimate is logged and becomes an em dash. One bad row does not drop the briefing.
 */

import type { GameStateSnapshot } from '../../gameDb';
import { logDebug, logError, logTrace } from '../../logger';
import { executeEstimateCombat } from '../../tools/combatEstimation';
import type { TacticalBattleSnapshot } from '../../../shared/tacticalBattleTypes';

/**
 * The em dash used for a Best Options cell that is not a fight.
 *
 * Purpose: Matches the empty-cell character the rest of the table already uses.
 * When to use: Approach, ferry, air strike, uncontested, and failed rows.
 * Expected outcome: The single character `—`.
 * Exceptions: None.
 */
export const bestOptionsOddsEmpty = '—';

/**
 * One grouped Best Options row, with the target cell the estimator needs.
 *
 * Purpose: The rendered table keeps a hex code, and the estimator needs the H3 the code came from.
 * When to use: Passed into `resolveBestOptionsOdds` after rows that share a target have been merged.
 * Expected outcome: `unitIds` is every unit on the merged row.
 * Exceptions: None.
 */
export interface BestOptionsOddsRow {
  /**
   * Display action label from the Best Options table.
   *
   * Contract: `ranged` and `move/melee` are estimated. Every other label is an em dash.
   * When to use: The grouped row.
   * Expected outcome: One of the Best Options action labels.
   * Exceptions: None.
   */
  readonly action: string;
  /**
   * Unit ids that share this action and target.
   *
   * Contract: Estimated together, as one engagement.
   * When to use: The attackers list.
   * Expected outcome: Non-empty for a real row.
   * Exceptions: None.
   */
  readonly unitIds: readonly string[];
  /**
   * H3 index of the target cell.
   *
   * Contract: A key in `latLngByH3`.
   * When to use: The estimate target and the cache key.
   * Expected outcome: The cell the row's hex code names.
   * Exceptions: None.
   */
  readonly targetH3: string;
}

/**
 * Numeric prediction fields the odds cell reads.
 *
 * Purpose: Keeps the formatter off the estimator's full result object.
 * When to use: `formatBestOptionsOdds`.
 * Expected outcome: Probabilities in the 0 to 1 range, or an `uncontested` assessment.
 * Exceptions: None.
 */
export interface BestOptionsOddsPrediction {
  /**
   * Chance the defenders are wiped out.
   *
   * Contract: A fraction from 0 to 1. Absent when the prediction is not a fight.
   * When to use: The `wipe` percentage.
   * Expected outcome: Rounded with `Math.round(p * 100)`.
   * Exceptions: None.
   */
  readonly probabilityDefenderEliminated?: number;
  /**
   * Chance the attacker loses at least one unit.
   *
   * Contract: A fraction from 0 to 1.
   * When to use: The `lose` percentage.
   * Expected outcome: Rounded with `Math.round(p * 100)`.
   * Exceptions: None.
   */
  readonly probabilityAttackerLosesUnit?: number;
  /**
   * Estimator label. `uncontested` is not a fight.
   *
   * Contract: Optional. `uncontested` forces an em dash.
   * When to use: After `executeEstimateCombat`.
   * Expected outcome: An em dash when this is `uncontested`.
   * Exceptions: None.
   */
  readonly assessment?: string;
}

/**
 * What one odds lookup needs from the consultation.
 *
 * Purpose: One object, so the resolver stays under the argument limit.
 * When to use: `resolveBestOptionsOdds` and `bindBestOptionsOdds`.
 * Expected outcome: The same snapshot the tool loop would estimate against.
 * Exceptions: None.
 */
export interface BestOptionsOddsInput {
  /**
   * The grouped row to price.
   *
   * Contract: `ranged` or `move/melee` to call the estimator.
   * When to use: Once per table row.
   * Expected outcome: A cell string.
   * Exceptions: None.
   */
  readonly row: BestOptionsOddsRow;
  /**
   * Snapshot the estimator reads.
   *
   * Contract: The briefing snapshot for this consultation.
   * When to use: Every call in one table shares it.
   * Expected outcome: Units and hexes the estimator can resolve.
   * Exceptions: None.
   */
  readonly state: GameStateSnapshot;
  /**
   * Cell centers for the snapshot.
   *
   * Contract: Contains `row.targetH3`.
   * When to use: The target pair passed to the estimator.
   * Expected outcome: A lat/lng pair, or an em dash when the cell is missing.
   * Exceptions: None.
   */
  readonly latLngByH3: Map<string, [number, number]>;
  /**
   * Maps a lat/lng pair back to an H3 index.
   *
   * Contract: Returns the H3 for a pair taken from `latLngByH3`.
   * When to use: The estimator's own hex check.
   * Expected outcome: The target H3 for a pair this map produced.
   * Exceptions: None.
   */
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
  /**
   * Battle snapshot when the consultation is a battle.
   *
   * Contract: Absent on the strategic map. Present in a battle so battle range rules apply.
   * When to use: Tactical Best Options only.
   * Expected outcome: The estimator rejects air attackers in a battle.
   * Exceptions: None.
   */
  readonly tacticalBattle?: TacticalBattleSnapshot;
  /**
   * Replacement for `executeEstimateCombat`.
   *
   * Contract: Absent uses the real estimator. A test passes a counter.
   * When to use: Tests that must not run combat math.
   * Expected outcome: Called only for `ranged` and `move/melee`.
   * Exceptions: A throw becomes an em dash.
   */
  readonly estimate?: typeof executeEstimateCombat;
  /**
   * Cell strings already computed for this table.
   *
   * Contract: Keyed by engagement type, sorted unit ids, and target H3. Shared across rows.
   * When to use: One map per table.
   * Expected outcome: A repeated key does not call the estimator again.
   * Exceptions: None.
   */
  readonly cache?: Map<string, string>;
}

/**
 * Formats one prediction as the Odds cell.
 *
 * Purpose: The table shows two percentages, not the raw fractions.
 * When to use: After a successful estimate, and for a null or uncontested prediction.
 * Expected outcome: `wipe N%, lose M%`, or an em dash.
 * Exceptions: None.
 */
export function formatBestOptionsOdds(prediction: BestOptionsOddsPrediction | null | undefined): string {
  logTrace('bestOptionsOdds formatBestOptionsOdds', { assessment: prediction?.assessment ?? null });
  if (
    prediction == null ||
    prediction.assessment === 'uncontested' ||
    typeof prediction.probabilityDefenderEliminated !== 'number' ||
    typeof prediction.probabilityAttackerLosesUnit !== 'number'
  ) {
    return bestOptionsOddsEmpty;
  }
  const wipe = Math.round(prediction.probabilityDefenderEliminated * 100);
  const lose = Math.round(prediction.probabilityAttackerLosesUnit * 100);
  return `wipe ${wipe}%, lose ${lose}%`;
}

/**
 * Odds cell for one grouped Best Options row.
 *
 * Purpose: Ranged and move/melee rows show the estimator's wipe and loss chances for every listed unit together.
 * When to use: Once per grouped row, with a cache shared by the table.
 * Expected outcome: An em dash for any other action, a missing target, an error result, or a thrown estimate.
 * Exceptions: A thrown estimate is logged and becomes an em dash.
 */
export function resolveBestOptionsOdds(input: BestOptionsOddsInput): string {
  const { row } = input;
  logDebug('bestOptionsOdds resolveBestOptionsOdds', {
    action: row.action,
    unitCount: row.unitIds.length,
    targetH3: row.targetH3,
  });
  if (row.action !== 'ranged' && row.action !== 'move/melee') return bestOptionsOddsEmpty;
  const engagementType = row.action === 'ranged' ? 'ranged' : 'melee';
  const ids = [...row.unitIds].sort();
  const key = `${engagementType}\u0000${ids.join(',')}\u0000${row.targetH3}`;
  const cached = input.cache?.get(key);
  if (cached !== undefined) return cached;
  const target = input.latLngByH3.get(row.targetH3);
  const cell = target == null ? bestOptionsOddsEmpty : estimateOddsCell(input, engagementType, ids, target);
  input.cache?.set(key, cell);
  return cell;
}

/**
 * Runs one estimate and formats it.
 *
 * Purpose: Keeps the cache lookup separate from the call that can throw.
 * When to use: From `resolveBestOptionsOdds` on a cache miss with a known target.
 * Expected outcome: The formatted cell, or an em dash when the estimate fails.
 * Exceptions: A throw is logged and becomes an em dash.
 */
function estimateOddsCell(
  input: BestOptionsOddsInput,
  engagementType: 'ranged' | 'melee',
  unitIds: readonly string[],
  target: [number, number]
): string {
  const estimate = input.estimate ?? executeEstimateCombat;
  try {
    const result = estimate(
      { engagementType, attackers: { units: [...unitIds] }, targetHex: target },
      input.state,
      input.latLngByH3,
      input.resolveToH3,
      input.tacticalBattle
    );
    if (result.status !== 'ok') return bestOptionsOddsEmpty;
    const prediction = result.prediction;
    if (typeof prediction !== 'object' || prediction == null) return bestOptionsOddsEmpty;
    return formatBestOptionsOdds(prediction as BestOptionsOddsPrediction);
  } catch (err) {
    logError('bestOptionsOdds resolveBestOptionsOdds', err);
    return bestOptionsOddsEmpty;
  }
}

/**
 * A row resolver that shares one cache and one lat/lng lookup for a whole table.
 *
 * Purpose: The map builders do not carry `resolveToH3`, and the table must not estimate the same fight twice.
 * When to use: Once per operational map, then pass the function to the table renderer.
 * Expected outcome: A function from a grouped row to an Odds cell.
 * Exceptions: None. Failures stay inside `resolveBestOptionsOdds`.
 */
export function bindBestOptionsOdds(input: {
  readonly state: GameStateSnapshot;
  readonly latLngByH3: Map<string, [number, number]>;
  readonly tacticalBattle?: TacticalBattleSnapshot;
}): (row: BestOptionsOddsRow) => string {
  logDebug('bestOptionsOdds bindBestOptionsOdds', {
    turn: input.state.turnNumber,
    battleId: input.tacticalBattle?.battleId ?? null,
    cellCount: input.latLngByH3.size,
  });
  const cache = new Map<string, string>();
  const byCoord = new Map<string, string>();
  for (const [h3, latLng] of input.latLngByH3) {
    byCoord.set(`${latLng[0]},${latLng[1]}`, h3);
  }
  const resolveToH3 = (lat: number, lng: number): string | undefined => byCoord.get(`${lat},${lng}`);
  return (row) =>
    resolveBestOptionsOdds({
      row,
      state: input.state,
      latLngByH3: input.latLngByH3,
      resolveToH3,
      tacticalBattle: input.tacticalBattle,
      cache,
    });
}
