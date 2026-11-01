/**
 * Shared durations for resolution playback stages.
 *
 * Purpose: One stage length drives the fade, the lightning, the dice-chip fades, and the combat pulse.
 * When to use: From the playback timeline and from the dice-chip and overlay modules.
 * Expected outcome: Whole-millisecond durations derived from `RESOLUTION_STAGE_MS`.
 * Exceptions: None. This module does not import the main-process logger.
 */

/**
 * Length of every playback stage, in milliseconds.
 *
 * Purpose: Fade stages and lightning stages last this long. Changing it rescales the timed work the other constants derive from it.
 * When to use: The playback module's fade and lightning durations, and any timing that should stay in proportion.
 * Expected outcome: 1500. Keep it divisible by 20 so the derived durations stay whole milliseconds.
 * Exceptions: None.
 */
export const RESOLUTION_STAGE_MS = 1500;

/**
 * Angular rate of the combat and casualty opacity pulse, in radians per millisecond.
 *
 * Purpose: The pulse completes the same number of cycles in one stage at any stage length.
 * When to use: The sine that drives lightning and casualty opacity.
 * Expected outcome: `8 / RESOLUTION_STAGE_MS`. That was 0.008 when stages lasted 1000 ms.
 * Exceptions: None.
 */
export const RESOLUTION_PULSE_RADIANS_PER_MS = 8 / RESOLUTION_STAGE_MS;

/**
 * How long sight lines take to draw in, in milliseconds.
 *
 * Purpose: The opening stage reveals every beam together.
 * When to use: `sightCueFrameAt` and the playback timeline.
 * Expected outcome: One fifth of `RESOLUTION_STAGE_MS`.
 * Exceptions: None.
 */
export const SIGHT_CUE_DRAW_IN_MS = RESOLUTION_STAGE_MS / 5;

/**
 * How long sight lines stay fully drawn, in milliseconds.
 *
 * Purpose: The hold is long enough to read a front before the lines fade.
 * When to use: `sightCueFrameAt` and the playback timeline.
 * Expected outcome: Three fifths of `RESOLUTION_STAGE_MS`.
 * Exceptions: None.
 */
export const SIGHT_CUE_HOLD_MS = (RESOLUTION_STAGE_MS * 3) / 5;

/**
 * How long sight lines take to fade, in milliseconds.
 *
 * Purpose: The stage ends by fading rather than popping out.
 * When to use: `sightCueFrameAt` and the playback timeline.
 * Expected outcome: One fifth of `RESOLUTION_STAGE_MS`.
 * Exceptions: None.
 */
export const SIGHT_CUE_FADE_MS = RESOLUTION_STAGE_MS / 5;

/**
 * Length of the sight-cue stage, in milliseconds.
 *
 * Purpose: The three windows add up to one playback stage.
 * When to use: Pass as `sightCueMs` when the turn has beams.
 * Expected outcome: Equal to `RESOLUTION_STAGE_MS`.
 * Exceptions: None.
 */
export const SIGHT_CUE_STAGE_MS = SIGHT_CUE_DRAW_IN_MS + SIGHT_CUE_HOLD_MS + SIGHT_CUE_FADE_MS;
