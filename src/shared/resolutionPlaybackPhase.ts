/**
 * Timeline math for one resolution playback.
 *
 * Purpose: Keeps stage start times, progress, and in-stage flags in shared code so a Node test can cover a zero-length movement stage.
 * When to use: From `buildResolutionPlaybackState` once per animation frame.
 * Expected outcome: Stages stay in air, ranged, movement, then melee order. A stage whose flag is false lasts 0 ms.
 * Exceptions: None.
 */

/**
 * Elapsed-time snapshot of one resolution playback timeline.
 *
 * Purpose: Callers draw the active stage from start times, progress values, and in-stage flags.
 * When to use: After `getResolutionPlaybackPhase` for the current elapsed time.
 * Expected outcome: Start times are milliseconds from playback start. Progress values are in [0, 1].
 * Exceptions: None.
 */
export interface ResolutionPlaybackPhase {
  /**
   * Milliseconds from playback start until air units begin moving out.
   *
   * Contract: Always 0, so later starts are offsets from a named origin.
   * When to use: When placing the outbound air leg on the timeline.
   * Expected outcome: 0.
   * Exceptions: None.
   */
  airStrikeOutboundStart: number;
  /**
   * Milliseconds from playback start until air combat lightning begins.
   *
   * Contract: Equals the outbound leg's end. A missing outbound leg does not add time.
   * When to use: When placing air combat on the timeline.
   * Expected outcome: A non-negative millisecond offset.
   * Exceptions: None.
   */
  airStrikeCombatStart: number;
  /**
   * Milliseconds from playback start until air casualty display begins.
   *
   * Contract: Equals the air combat stage's end. A missing air combat stage does not add time.
   * When to use: When placing air casualties on the timeline.
   * Expected outcome: A non-negative millisecond offset.
   * Exceptions: None.
   */
  airStrikeCasualtyStart: number;
  /**
   * Milliseconds from playback start until air units begin returning.
   *
   * Contract: Equals the air casualty stage's end. A missing casualty stage does not add time.
   * When to use: When placing the return air leg on the timeline.
   * Expected outcome: A non-negative millisecond offset.
   * Exceptions: None.
   */
  airStrikeReturnStart: number;
  /**
   * Milliseconds from playback start until ranged combat lightning begins.
   *
   * Contract: Equals the air return leg's end. A missing return leg does not add time.
   * When to use: When placing ranged combat on the timeline.
   * Expected outcome: A non-negative millisecond offset.
   * Exceptions: None.
   */
  rangedCombatStart: number;
  /**
   * Milliseconds from playback start until ranged casualty display begins.
   *
   * Contract: Equals the ranged combat stage's end. A missing ranged combat stage does not add time.
   * When to use: When placing ranged casualties on the timeline.
   * Expected outcome: A non-negative millisecond offset.
   * Exceptions: None.
   */
  rangedCasualtyStart: number;
  /**
   * Milliseconds from playback start until movement begins.
   *
   * Contract: Equals the ranged casualty stage's end. A missing casualty stage does not add time.
   * When to use: When placing marches on the timeline, including a resolution that has no marches.
   * Expected outcome: A non-negative millisecond offset. The next stage starts at this same time when movement duration is 0.
   * Exceptions: None.
   */
  movementStart: number;
  /**
   * Milliseconds from playback start until melee combat lightning begins.
   *
   * Contract: Movement adds `fadeMs` only when `hasMoves` is true. Otherwise this equals `movementStart`.
   * When to use: When placing melee combat on the timeline.
   * Expected outcome: A non-negative millisecond offset.
   * Exceptions: None.
   */
  meleeCombatStart: number;
  /**
   * Milliseconds from playback start until melee casualty display begins.
   *
   * Contract: Equals the melee combat stage's end. A missing melee combat stage does not add time.
   * When to use: When placing melee casualties on the timeline.
   * Expected outcome: A non-negative millisecond offset.
   * Exceptions: None.
   */
  meleeCasualtyStart: number;
  /**
   * Milliseconds from playback start until the last stage ends.
   *
   * Contract: Equals the melee casualty stage's end. Empty stages do not add time.
   * When to use: When deciding whether the combat stages have finished. Dice chips can keep playback running past this.
   * Expected outcome: A non-negative duration. A stage that is off adds no time.
   * Exceptions: None.
   */
  totalMs: number;
  /**
   * How far through the outbound air leg the clock is, from 0 to 1.
   *
   * Contract: 0 when that leg is absent or has not started, 1 at and after its end, otherwise the fraction through `fadeMs`.
   * When to use: When interpolating outbound air unit positions.
   * Expected outcome: A number in [0, 1].
   * Exceptions: None.
   */
  airStrikeOutboundProgress: number;
  /**
   * How far through the return air leg the clock is, from 0 to 1.
   *
   * Contract: 0 when that leg is absent or has not started, 1 at and after its end, otherwise the fraction through `fadeMs`.
   * When to use: When interpolating returning air unit positions.
   * Expected outcome: A number in [0, 1].
   * Exceptions: None.
   */
  airStrikeReturnProgress: number;
  /**
   * How far through movement the clock is, from 0 to 1.
   *
   * Contract: 0 before `movementStart`. When movement duration is 0, 1 at and after `movementStart`. Otherwise the fraction through `fadeMs`.
   * When to use: When interpolating march positions.
   * Expected outcome: A number in [0, 1]. A zero-length movement stage does not divide by zero.
   * Exceptions: None.
   */
  moveProgress: number;
  /**
   * Whether the clock is inside the outbound air leg.
   *
   * Contract: True only when that leg exists and elapsed time is within its half-open interval.
   * When to use: When choosing the outbound air drawing pass.
   * Expected outcome: False when the leg is absent.
   * Exceptions: None.
   */
  inAirStrikeOutbound: boolean;
  /**
   * Whether the clock is inside air combat lightning.
   *
   * Contract: True only when air combat exists and elapsed time is within its half-open interval.
   * When to use: When drawing air combat lightning.
   * Expected outcome: False when air combat is absent.
   * Exceptions: None.
   */
  inAirStrikeLightning: boolean;
  /**
   * Whether the clock is inside air casualty display.
   *
   * Contract: True only when air casualties exist and elapsed time is within their half-open interval.
   * When to use: When drawing air casualties.
   * Expected outcome: False when air casualties are absent.
   * Exceptions: None.
   */
  inAirStrikeCasualty: boolean;
  /**
   * Whether the clock is inside the return air leg.
   *
   * Contract: True only when that leg exists and elapsed time is within its half-open interval.
   * When to use: When choosing the return air drawing pass.
   * Expected outcome: False when the leg is absent.
   * Exceptions: None.
   */
  inAirStrikeReturn: boolean;
  /**
   * Whether the clock is inside ranged combat lightning.
   *
   * Contract: True only when ranged combat exists and elapsed time is within its half-open interval.
   * When to use: When drawing ranged combat lightning.
   * Expected outcome: False when ranged combat is absent.
   * Exceptions: None.
   */
  inRangedLightning: boolean;
  /**
   * Whether the clock is inside ranged casualty display.
   *
   * Contract: True only when ranged casualties exist and elapsed time is within their half-open interval.
   * When to use: When drawing ranged casualties.
   * Expected outcome: False when ranged casualties are absent.
   * Exceptions: None.
   */
  inRangedCasualty: boolean;
  /**
   * Whether the clock is inside movement.
   *
   * Contract: False when there are no moves or movement duration is 0. Otherwise true on the half-open movement interval.
   * When to use: When choosing the march drawing pass.
   * Expected outcome: False for a resolution that has nothing to move.
   * Exceptions: None.
   */
  inMovement: boolean;
  /**
   * Whether the clock is inside melee combat lightning.
   *
   * Contract: True only when melee combat exists and elapsed time is within its half-open interval.
   * When to use: When drawing melee combat lightning.
   * Expected outcome: False when melee combat is absent.
   * Exceptions: None.
   */
  inMeleeLightning: boolean;
  /**
   * Whether the clock is inside melee casualty display.
   *
   * Contract: True only when melee casualties exist and elapsed time is within their half-open interval.
   * When to use: When drawing melee casualties.
   * Expected outcome: False when melee casualties are absent.
   * Exceptions: None.
   */
  inMeleeCasualty: boolean;
}

/**
 * Inputs for one playback timeline sample.
 *
 * Purpose: One object keeps the stage flags and the two caller-supplied durations together. The function already needed more than six named arguments.
 * When to use: From `buildResolutionPlaybackState`. Pass the fade and lightning durations from the playback module; do not copy those numbers here.
 * Expected outcome: `getResolutionPlaybackPhase` reads every flag and both durations from this object.
 * Exceptions: None.
 */
export interface ResolutionPlaybackPhaseArgs {
  /**
   * Milliseconds since playback started.
   *
   * Contract: Negative values are treated as before every stage that starts at 0.
   * When to use: Pass the value from `resolutionAnimationElapsedMs`.
   * Expected outcome: Progress and in-stage flags follow this clock.
   * Exceptions: None.
   */
  elapsed: number;
  /**
   * Duration of one fade stage, in milliseconds.
   *
   * Contract: Movement uses this only when `hasMoves` is true. Air legs use it when those legs exist.
   * When to use: Pass the playback module's fade duration.
   * Expected outcome: A non-negative duration. Zero does not cause a division by zero.
   * Exceptions: None.
   */
  fadeMs: number;
  /**
   * Duration of one lightning stage, in milliseconds.
   *
   * Contract: Combat and casualty stages use this when those stages exist.
   * When to use: Pass the playback module's lightning duration.
   * Expected outcome: A non-negative duration.
   * Exceptions: None.
   */
  lightningMs: number;
  /**
   * Whether air units have an outbound leg.
   *
   * Contract: False gives that leg duration 0.
   * When to use: True when the outbound move list is non-empty.
   * Expected outcome: The outbound leg lasts `fadeMs` only when this is true.
   * Exceptions: None.
   */
  hasAirStrikeOutbound: boolean;
  /**
   * Whether air combat lightning should play.
   *
   * Contract: False gives that stage duration 0.
   * When to use: True when the air combat hex list is non-empty.
   * Expected outcome: The stage lasts `lightningMs` only when this is true.
   * Exceptions: None.
   */
  hasAirStrikeCombat: boolean;
  /**
   * Whether air casualties should play.
   *
   * Contract: False gives that stage duration 0.
   * When to use: True when the air casualty hex list is non-empty.
   * Expected outcome: The stage lasts `lightningMs` only when this is true.
   * Exceptions: None.
   */
  hasAirStrikeCasualties: boolean;
  /**
   * Whether air units have a return leg.
   *
   * Contract: False gives that leg duration 0.
   * When to use: True when the return move list is non-empty.
   * Expected outcome: The return leg lasts `fadeMs` only when this is true.
   * Exceptions: None.
   */
  hasAirStrikeReturn: boolean;
  /**
   * Whether ranged combat lightning should play.
   *
   * Contract: False gives that stage duration 0.
   * When to use: True when a ranged combat hex list is non-empty.
   * Expected outcome: The stage lasts `lightningMs` only when this is true.
   * Exceptions: None.
   */
  hasRangedCombat: boolean;
  /**
   * Whether ranged casualties should play.
   *
   * Contract: False gives that stage duration 0.
   * When to use: True when a ranged casualty hex list is non-empty.
   * Expected outcome: The stage lasts `lightningMs` only when this is true.
   * Exceptions: None.
   */
  hasRangedCasualties: boolean;
  /**
   * Whether this resolution has marches to show.
   *
   * Contract: False gives movement duration 0. True gives movement duration `fadeMs`.
   * When to use: True when the animation's move list is non-empty.
   * Expected outcome: Melee starts at `movementStart` when this is false, and one fade interval later when this is true.
   * Exceptions: None.
   */
  hasMoves: boolean;
  /**
   * Whether melee combat lightning should play.
   *
   * Contract: False gives that stage duration 0.
   * When to use: True when a melee combat or control-loss hex list is non-empty.
   * Expected outcome: The stage lasts `lightningMs` only when this is true.
   * Exceptions: None.
   */
  hasMeleeCombat: boolean;
  /**
   * Whether melee casualties should play.
   *
   * Contract: False gives that stage duration 0.
   * When to use: True when the melee casualty hex list is non-empty.
   * Expected outcome: The stage lasts `lightningMs` only when this is true.
   * Exceptions: None.
   */
  hasMeleeCasualties: boolean;
}

/**
 * Maps elapsed time onto a stage that may last 0 ms.
 *
 * Purpose: A zero-length movement stage must report progress 1 at its start without dividing by zero.
 * When to use: For movement progress. Other stages keep their own progress rules.
 * Expected outcome: 0 before `startMs`. 1 when `durationMs` is 0 or the clock has reached the stage end. Otherwise the fraction through the stage.
 * Exceptions: None.
 */
function progressAtStage(elapsed: number, startMs: number, durationMs: number): number {
  if (elapsed < startMs) return 0;
  if (durationMs <= 0 || elapsed >= startMs + durationMs) return 1;
  return (elapsed - startMs) / durationMs;
}

/**
 * Places one elapsed time on the resolution playback timeline.
 *
 * Purpose: Stage order is air outbound, air combat, air casualties, air return, ranged combat, ranged casualties, movement, melee combat, then melee casualties. Movement is skipped when there are no moves.
 * When to use: Once per animation frame from `buildResolutionPlaybackState`. Do not call this to decide whether playback should start; that guard stays outside.
 * Expected outcome: Start times, progress values, and in-stage flags for `elapsed`. Movement progress is 0 before a zero-length movement stage and 1 at and after it, and `inMovement` is false for that stage.
 * Exceptions: None.
 */
export function getResolutionPlaybackPhase(args: ResolutionPlaybackPhaseArgs): ResolutionPlaybackPhase {
  const fadeMs = args.fadeMs;
  const lightningMs = args.lightningMs;
  const airStrikeOutboundStart = 0;
  const airStrikeOutboundEnd = airStrikeOutboundStart + (args.hasAirStrikeOutbound ? fadeMs : 0);
  const airStrikeCombatStart = airStrikeOutboundEnd;
  const airStrikeCombatEnd = airStrikeCombatStart + (args.hasAirStrikeCombat ? lightningMs : 0);
  const airStrikeCasualtyStart = airStrikeCombatEnd;
  const airStrikeCasualtyEnd = airStrikeCasualtyStart + (args.hasAirStrikeCasualties ? lightningMs : 0);
  const airStrikeReturnStart = airStrikeCasualtyEnd;
  const airStrikeReturnEnd = airStrikeReturnStart + (args.hasAirStrikeReturn ? fadeMs : 0);
  const rangedCombatStart = airStrikeReturnEnd;
  const rangedLightningEnd = rangedCombatStart + (args.hasRangedCombat ? lightningMs : 0);
  const rangedCasualtyStart = rangedLightningEnd;
  const rangedCasualtyEnd = rangedCasualtyStart + (args.hasRangedCasualties ? lightningMs : 0);
  const movementStart = rangedCasualtyEnd;
  const movementMs = args.hasMoves ? fadeMs : 0;
  const movementEnd = movementStart + movementMs;
  const meleeCombatStart = movementEnd;
  const meleeLightningEnd = meleeCombatStart + (args.hasMeleeCombat ? lightningMs : 0);
  const meleeCasualtyStart = meleeLightningEnd;
  const meleeCasualtyEnd = meleeCasualtyStart + (args.hasMeleeCasualties ? lightningMs : 0);
  const airStrikeOutboundProgress =
    !args.hasAirStrikeOutbound || args.elapsed < airStrikeOutboundStart
      ? 0
      : args.elapsed >= airStrikeOutboundEnd
        ? 1
        : (args.elapsed - airStrikeOutboundStart) / fadeMs;
  const airStrikeReturnProgress =
    !args.hasAirStrikeReturn || args.elapsed < airStrikeReturnStart
      ? 0
      : args.elapsed >= airStrikeReturnEnd
        ? 1
        : (args.elapsed - airStrikeReturnStart) / fadeMs;
  return {
    airStrikeOutboundStart,
    airStrikeCombatStart,
    airStrikeCasualtyStart,
    airStrikeReturnStart,
    rangedCombatStart,
    rangedCasualtyStart,
    movementStart,
    meleeCombatStart,
    meleeCasualtyStart,
    totalMs: meleeCasualtyEnd,
    airStrikeOutboundProgress,
    airStrikeReturnProgress,
    moveProgress: progressAtStage(args.elapsed, movementStart, movementMs),
    inAirStrikeOutbound:
      args.hasAirStrikeOutbound && args.elapsed >= airStrikeOutboundStart && args.elapsed < airStrikeOutboundEnd,
    inAirStrikeLightning:
      args.hasAirStrikeCombat && args.elapsed >= airStrikeCombatStart && args.elapsed < airStrikeCombatEnd,
    inAirStrikeCasualty:
      args.hasAirStrikeCasualties && args.elapsed >= airStrikeCasualtyStart && args.elapsed < airStrikeCasualtyEnd,
    inAirStrikeReturn:
      args.hasAirStrikeReturn && args.elapsed >= airStrikeReturnStart && args.elapsed < airStrikeReturnEnd,
    inRangedLightning: args.hasRangedCombat && args.elapsed >= rangedCombatStart && args.elapsed < rangedLightningEnd,
    inRangedCasualty:
      args.hasRangedCasualties && args.elapsed >= rangedCasualtyStart && args.elapsed < rangedCasualtyEnd,
    inMovement: args.hasMoves && movementMs > 0 && args.elapsed >= movementStart && args.elapsed < movementEnd,
    inMeleeLightning: args.hasMeleeCombat && args.elapsed >= meleeCombatStart && args.elapsed < meleeLightningEnd,
    inMeleeCasualty: args.hasMeleeCasualties && args.elapsed >= meleeCasualtyStart && args.elapsed < meleeCasualtyEnd,
  };
}
