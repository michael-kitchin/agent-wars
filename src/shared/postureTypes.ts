/**
 * One stored intent per AI seat, and the settings each intent applies.
 *
 * Purpose: Production, operations, and the campaign read one row instead of branching on a name.
 * When to use: Parsing a reply, storing a choice, and reading the settings for a decision.
 * Expected outcome: Four postures. `overland` is the default and matches the constants those decisions used before a posture existed.
 * Exceptions: None. This file imports only `operationTypes`, which imports nothing.
 */

import type { OperationChoiceMethod } from './operationTypes';

/**
 * The postures a commander may declare.
 *
 * Purpose: The parser, the schema text, and the prompt share one list.
 * When to use: When checking a reply or listing the choices.
 * Expected outcome: `overland`, `maritime`, `strangle`, and `blitz`, in that order.
 * Exceptions: None.
 */
export const POSTURES = ['overland', 'maritime', 'strangle', 'blitz'] as const;

/**
 * One posture name.
 *
 * Purpose: Callers pass a checked name instead of an open string.
 * When to use: Stored rows and settings lookups.
 * Expected outcome: A member of `POSTURES`.
 * Exceptions: None.
 */
export type Posture = (typeof POSTURES)[number];

/**
 * The posture a seat is on when it has never declared one.
 *
 * Purpose: A missing row and a failed read both mean this posture.
 * When to use: When `readPosture` returns null.
 * Expected outcome: `overland`.
 * Exceptions: None.
 */
export const DEFAULT_POSTURE: Posture = 'overland';

/**
 * How many turns a declared posture stays in force.
 *
 * Purpose: The briefing and the reply check share one hold.
 * When to use: When deciding whether a new name replaces the stored one, and when telling the commander the next turn it may change.
 * Expected outcome: 6. The count starts on the turn the posture was stored.
 * Exceptions: None.
 */
export const POSTURE_MIN_HOLD_TURNS = 6;

/**
 * A menu method, the same three the operation menu already uses.
 *
 * Purpose: A posture orders land, sea, and air without a second method type.
 * When to use: `menuMethodOrder`.
 * Expected outcome: `land`, `sea`, or `air`.
 * Exceptions: None.
 */
export type PostureMenuMethod = OperationChoiceMethod;

/**
 * The settings one posture applies.
 *
 * Purpose: A decision reads a field. It does not branch on the posture name.
 * When to use: The value of `POSTURE_SETTINGS` for the seat's current posture.
 * Expected outcome: The eight fields below. `overland` matches the constants those decisions used before postures.
 * Exceptions: None.
 */
export interface PostureSettings {
  /**
   * Share of the naval cap Production Priorities still asks for.
   *
   * Contract: Multiplies the naval cap inside the naval line. 1 asks up to the full cap.
   * When to use: The naval condition of `buildProductionPriorityLines`.
   * Expected outcome: 0.5 for `overland`, which is `NAVAL_PRIORITY_CAP_SHARE`. 1 for `maritime`.
   * Exceptions: None.
   */
  readonly navalPriorityCapShare: number;
  /**
   * Whether a missile line is still offered after one city has a missile queued.
   *
   * Contract: True skips the global queued-missile gate and skips only the city that already has one queued.
   * When to use: The missile branch of `buildProductionPriorityLines`.
   * Expected outcome: True only for `strangle`. The function still emits one line.
   * Exceptions: None.
   */
  readonly missilePriorityEveryCity: boolean;
  /**
   * Multiplier on the smallest city Production Priorities will name for credits.
   *
   * Contract: Multiplies `CREDITS_CITY_MIN_URBAN_PER_SIZE` times the game-size multiplier. The treasury ceiling uses that product.
   * When to use: The credits branch of `buildProductionPriorityLines`.
   * Expected outcome: 1, or 2 for `strangle`.
   * Exceptions: None.
   */
  readonly creditsCityUrbanFactor: number;
  /**
   * Share of ground units a sea lift may take while a campaign plan exists.
   *
   * Contract: Passed to `liftGroundCap` as `campaignShare`. A match with no campaign uses the no-campaign cap unless this share is larger.
   * When to use: `listSeaOperationCandidates`.
   * Expected outcome: 0.25, which is `LIFT_MAX_GROUND_SHARE`, or 0.5 for `maritime`.
   * Exceptions: None.
   */
  readonly liftGroundShare: number;
  /**
   * Multiplier on how many air operations may be active.
   *
   * Contract: Multiplies `operationSlotsForState` for air only. It does not change how many air rows one menu shows.
   * When to use: `operationSlotsForState` and the named air launch.
   * Expected outcome: 1, or 2 for `blitz`.
   * Exceptions: None.
   */
  readonly airOperationSlotFactor: number;
  /**
   * The order of land, sea, and air rows after the menu budget is applied.
   *
   * Contract: Each of the three methods appears once. A method with no row is skipped. The engine list omits land and keeps this order.
   * When to use: The end of `operationCandidatesForSeat`.
   * Expected outcome: `overland` and `strangle` are land, sea, air. `maritime` is sea, air, land. `blitz` is air, land, sea.
   * Exceptions: None.
   */
  readonly menuMethodOrder: readonly PostureMenuMethod[];
  /**
   * How many defenders a sea objective may have and still count as clear for the engine's launch.
   *
   * Contract: A land-free row counts when `clear` is true or `defenders` is at most this number. Land rows are excluded before the check.
   * When to use: `advanceOperationsForSeat`, for both the offer clock and the launch.
   * Expected outcome: 0, or 1 for `blitz`. An air row stays clear because its `clear` flag is true.
   * Exceptions: None.
   */
  readonly engineLaunchMaxDefenders: number;
  /**
   * Multiplier on how many ground units must be massed before the campaign assaults.
   *
   * Contract: `campaignAssaultMinUnitsFor` turns this into the threshold argument. Callers that pass nothing keep today's threshold.
   * When to use: The campaign resolve, the plan, and the ready check.
   * Expected outcome: 1, or 0.5 for `blitz`, which masses 3 instead of 6.
   * Exceptions: None.
   */
  readonly campaignAssaultFactor: number;
}

/**
 * Settings for each posture.
 *
 * Purpose: One table. Decisions read a field from the row for the seat's posture.
 * When to use: `postureSettingsForSeat` and the briefing's effect line.
 * Expected outcome: `overland` repeats 0.25, 0.5, and a factor of 1. A test under `src/main` proves those equal the constants they replace.
 * Exceptions: None.
 */
export const POSTURE_SETTINGS: Readonly<Record<Posture, PostureSettings>> = {
  overland: {
    navalPriorityCapShare: 0.5,
    missilePriorityEveryCity: false,
    creditsCityUrbanFactor: 1,
    liftGroundShare: 0.25,
    airOperationSlotFactor: 1,
    menuMethodOrder: ['land', 'sea', 'air'],
    engineLaunchMaxDefenders: 0,
    campaignAssaultFactor: 1,
  },
  maritime: {
    navalPriorityCapShare: 1,
    missilePriorityEveryCity: false,
    creditsCityUrbanFactor: 1,
    liftGroundShare: 0.5,
    airOperationSlotFactor: 1,
    menuMethodOrder: ['sea', 'air', 'land'],
    engineLaunchMaxDefenders: 0,
    campaignAssaultFactor: 1,
  },
  strangle: {
    navalPriorityCapShare: 0.5,
    missilePriorityEveryCity: true,
    creditsCityUrbanFactor: 2,
    liftGroundShare: 0.25,
    airOperationSlotFactor: 1,
    menuMethodOrder: ['land', 'sea', 'air'],
    engineLaunchMaxDefenders: 0,
    campaignAssaultFactor: 1,
  },
  blitz: {
    navalPriorityCapShare: 0.5,
    missilePriorityEveryCity: false,
    creditsCityUrbanFactor: 1,
    liftGroundShare: 0.25,
    airOperationSlotFactor: 2,
    menuMethodOrder: ['air', 'land', 'sea'],
    engineLaunchMaxDefenders: 1,
    campaignAssaultFactor: 0.5,
  },
};

/**
 * Reports whether a value is a posture name.
 *
 * Purpose: The parser and the stored-row reader share one check.
 * When to use: After trimming and lowercasing a reply, and when reading a stored entry. This function does not change case.
 * Expected outcome: True for a member of `POSTURES`. False for anything else, including `Maritime`.
 * Exceptions: None.
 */
export function isPosture(value: unknown): value is Posture {
  return typeof value === 'string' && (POSTURES as readonly string[]).includes(value);
}
