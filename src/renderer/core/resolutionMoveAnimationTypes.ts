/**
 * Renderer-side shape of an active resolution playback (strategic Ready or tactical commit).
 */

import type {
  CombatDicePlaybackFields,
  GameStateSnapshot,
  RemovedUnitSnapshot,
} from '../../shared/ipcTypes';
import type { OrdersHeldUntilMovementEnds } from '../../shared/ordersHeldForPlayback';
import type { RangedResolutionShotLine } from '../../shared/rangedResolutionShotLines';
import type { ResolutionMove, ResolutionPlaybackMove } from './types';

/**
 * Everything one resolution playback draws, from the time it starts until it is cleared.
 *
 * Purpose: Holds the moves, combat and casualty hexes, shot lines, and recorded dice rolls that the canvas overlays
 *   read each frame, so the playback never reads the live game state for what happened during the turn.
 * When to use: Assign to `rendererSharedState.resolutionMoveAnimation` when a Ready or tactical commit result
 *   arrives; set it to `null` when playback ends.
 * Expected outcome: Each optional list is omitted or empty when its stage has nothing to show, and
 *   `getResolutionPlaybackPhase` then gives that stage no time. The dice roll arrays, when present, have already
 *   been filtered for fog by `pickPlaybackDiceRolls`.
 * Exceptions: None.
 */
export type ResolutionMoveAnimationState = (CombatDicePlaybackFields & {
  /**
   * Marches that resolved this turn or beat, human and opponent together.
   *
   * Purpose: Drives the movement stage and keeps movers drawn at their origins before it.
   * When to use: Read by the unit layer and `buildResolutionPlaybackMoves`; set from the result's human and AI moves.
   * Expected outcome: Movers glide from `fromH3Index` to their destination during movement. An empty list skips
   *   the movement stage.
   * Exceptions: None.
   */
  moves: ResolutionMove[];
  /**
   * Air strike flights from each striker's base to its target.
   *
   * Purpose: Drives the air outbound stage, and places strikers on their targets during air combat and casualties.
   * When to use: Set from the result's air strike moves; omit when no strike flew.
   * Expected outcome: Strikers fly out first; omitted gives the outbound stage no time.
   * Exceptions: None.
   */
  airStrikeOutboundMoves?: ResolutionPlaybackMove[];
  /**
   * Air strike flights from each target back to base, for strikers that survived.
   *
   * Purpose: Drives the air return stage.
   * When to use: Set from the result's air strike moves; omit when no striker returns.
   * Expected outcome: Survivors fly home after air casualties; omitted gives the return stage no time.
   * Exceptions: None.
   */
  airStrikeReturnMoves?: ResolutionPlaybackMove[];
  /**
   * Hexes or cells that show lightning during the air combat stage.
   *
   * Purpose: Marks where air strikes hit or missed.
   * When to use: Set from the result's air strike hexes; omit when there were none.
   * Expected outcome: Lightning on these hexes during air combat; omitted gives that stage no time.
   * Exceptions: None.
   */
  airStrikeCombatHexes?: string[];
  /**
   * Hexes or cells that show the casualty X during the air casualty stage.
   *
   * Purpose: Marks where air strikes or anti-air removed units.
   * When to use: Set from the result's air strike casualty hexes; omit when there were none.
   * Expected outcome: A red X on these hexes during air casualties; omitted gives that stage no time.
   * Exceptions: None.
   */
  airStrikeCasualtyHexes?: string[];
  /**
   * Units removed during the air-strike stage, as they were before removal.
   *
   * Contract: The icon layer reads this during the air stages. An id here follows the air-strike window even when the ranged list repeats it.
   * When to use: Set from the tactical playback field or from the strategic air-phase removal list. Omit when this playback removed nobody in the air phase.
   * Expected outcome: Those icons stay through the air casualty mark and are not drawn again.
   * Exceptions: None.
   */
  airStrikeRemovedUnits?: RemovedUnitSnapshot[];
  /**
   * `Date.now()` value when the playback started.
   *
   * Purpose: Origin of the playback clock.
   * When to use: Read through `resolutionAnimationElapsedMs`, never by subtracting directly, so
   *   `tacticalDeferResolutionClock` is honored.
   * Expected outcome: Elapsed time is `Date.now() - startTime` once the clock runs.
   * Exceptions: None.
   */
  startTime: number;
  /**
   * When true, resolution playback elapsed stays at 0 until tactical Ready clears it and resets `startTime` after IPC.
   *
   * Purpose: Prevents `requestAnimationFrame` from advancing the movement timeline during `await getGameState` and
   *   terrain refresh while the canvas is not yet showing the committed frame.
   * When to use: Only tactical `commitHumanTacticalDraftOrders` success path; omit for strategic Ready animations.
   * Expected outcome: Hop-free snapshot swap without consuming the movement segment before the first visible paint.
   * Exceptions: None.
   */
  tacticalDeferResolutionClock?: boolean;
  /**
   * Sub-units copied at tactical Ready commit time (pre-commit snapshot) for resolution march playback lookup only.
   *
   * Purpose: `buildResolutionPlaybackMoves` needs `player`/`unitType` per `unitId`. The live tactical snapshot omits
   *   casualties, so a melee arrival would otherwise lose its march. Air and ranged removals do not glide.
   * When to use: Tactical `commitHumanTacticalDraftOrders` path when arming `resolutionMoveAnimation` with march moves.
   * Expected outcome: Merged with current snapshot rows so a melee arrival can still resolve for lines and glides.
   * Exceptions: None.
   */
  tacticalMarchPlaybackUnits?: GameStateSnapshot['units'];
  /**
   * Combined combat hexes from results that do not split ranged from melee.
   *
   * Purpose: Fallback for the ranged lightning stage.
   * When to use: Set from the result's `combatHexes`; `rangedCombatHexes` wins when both are present.
   * Expected outcome: Lightning on these hexes during ranged combat when `rangedCombatHexes` is absent.
   * Exceptions: None.
   */
  combatHexes?: string[];
  /**
   * Combined casualty hexes from results that do not split ranged from melee.
   *
   * Purpose: Fallback for the ranged casualty stage.
   * When to use: Set from the result's `casualtyHexes`; `rangedCasualtyHexes` wins when both are present.
   * Expected outcome: A red X on these hexes during ranged casualties when `rangedCasualtyHexes` is absent.
   * Exceptions: None.
   */
  casualtyHexes?: string[];
  /**
   * Hexes or cells that show lightning during the ranged combat stage.
   *
   * Purpose: Marks where ranged fire and return fire happened.
   * When to use: Set from the result's ranged combat hexes; omit when there were none.
   * Expected outcome: Lightning on these hexes during ranged combat, with units at their pre-move positions.
   * Exceptions: None.
   */
  rangedCombatHexes?: string[];
  /**
   * Hexes or cells that show the casualty X during the ranged casualty stage.
   *
   * Purpose: Marks where ranged fire removed units.
   * When to use: Set from the result's ranged casualty hexes; omit when there were none.
   * Expected outcome: A red X on these hexes during ranged casualties.
   * Exceptions: None.
   */
  rangedCasualtyHexes?: string[];
  /**
   * Units removed by ranged fire, as they were before removal.
   *
   * Purpose: The live state no longer lists them, but they must stay drawn through the ranged stages.
   * When to use: Set from the result's ranged removed units; read by the unit layer.
   * Expected outcome: These units are drawn during ranged combat and casualties, then disappear.
   * Exceptions: None.
   */
  rangedRemovedUnits?: RemovedUnitSnapshot[];
  /**
   * Hex-to-hex ranged connectors drawn during the ranged lightning playback window.
   *
   * Purpose: Carries IPC `rangedResolutionShotLines` for strategic Ready and tactical commit until the anim ends.
   * When to use: Set when arming `resolutionMoveAnimation`; drawn only while `inRangedLightning`.
   * Expected outcome: Deduped pairs; cleared when anim is nulled.
   * Exceptions: None.
   */
  rangedResolutionShotLines?: RangedResolutionShotLine[];
  /**
   * Hexes or cells that show lightning during the melee combat stage.
   *
   * Purpose: Marks contested hexes where melee was fought.
   * When to use: Set from the result's melee combat hexes; omit when there were none.
   * Expected outcome: Lightning on these hexes during melee combat, with units at their post-move positions.
   * Exceptions: None.
   */
  meleeCombatHexes?: string[];
  /**
   * Hexes the human lost to the opponent this turn, flashed with the melee lightning.
   *
   * Purpose: Shows a lost hex even where no melee dice were rolled there.
   * When to use: Set from the result's control-loss lightning hexes; merged with `meleeCombatHexes` when drawn.
   * Expected outcome: Lightning on these hexes during melee combat; their presence alone gives that stage time.
   * Exceptions: None.
   */
  controlLossLightningHexes?: string[];
  /**
   * Hexes or cells that show the casualty X during the melee casualty stage.
   *
   * Purpose: Marks where melee removed units.
   * When to use: Set from the result's melee casualty hexes; omit when there were none.
   * Expected outcome: A red X on these hexes during melee casualties; omitted gives that stage no time.
   * Exceptions: None.
   */
  meleeCasualtyHexes?: string[];
  /**
   * Units removed by melee, as they were before removal.
   *
   * Purpose: The live state no longer lists them, but they must stay drawn through the melee stages.
   * When to use: Set from the result's melee removed units; read by the unit layer.
   * Expected outcome: These units are drawn during melee combat and casualties, then disappear.
   * Exceptions: None.
   */
  meleeRemovedUnits?: RemovedUnitSnapshot[];
  /**
   * Combat hexes the player cannot see, from the strategic fog classification.
   *
   * Purpose: Draws unknown-battle markers instead of lightning where the player has no vision.
   * When to use: Strategic Ready only; tactical battles have no fog.
   * Expected outcome: Any combat hex listed here shows an unknown-battle marker instead of lightning.
   * Exceptions: None.
   */
  unknownCombatHexes?: string[];
  /**
   * Casualty hexes the player cannot see, from the strategic fog classification.
   *
   * Purpose: Draws unknown-battle markers instead of the casualty X where the player has no vision.
   * When to use: Strategic Ready only; tactical battles have no fog.
   * Expected outcome: Any casualty hex listed here shows an unknown-battle marker instead of the X.
   * Exceptions: None.
   */
  unknownCasualtyHexes?: string[];
  /**
   * Queued human marches whose units are already on the destination in the settled snapshot.
   *
   * Purpose: The standing-order list is replaced with empty routes when Ready returns, before the movement stage.
   *   These copies keep the route, and its arrowhead, until that stage finishes.
   * When to use: Set from `ordersHeldUntilMovementEnds` when strategic playback is created. Drawn while movement
   *   progress is below 1, from `originH3ByUnitId` when a route has no segments.
   * Expected outcome: Omitted when no arrived march still has a playback move. After movement progress reaches 1 the
   *   copies are ignored and the arrived march draws nothing.
   * Exceptions: None.
   */
  marchArrowsUntilMovementEnds?: OrdersHeldUntilMovementEnds;
}) | null;
