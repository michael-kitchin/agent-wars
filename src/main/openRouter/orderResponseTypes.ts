/**
 * The shape of a normalized orders reply.
 *
 * Purpose: Keeps the parser's return contract apart from the parsing code.
 * When to use: Anywhere that needs to name what a non-null parse returns.
 * Expected outcome: Types only; nothing here runs.
 * Exceptions: None.
 */

import type { CallbackSubscription } from '../callbackSubscriptions';
import type { AirStrikeOrder, EmbarkOrder, FerryOrder } from '../../shared/ipcTypes';
import type { MissileLaunchOrder } from '../../shared/ipc/missileTypes';
import type { Posture } from '../../shared/postureTypes';
import type { OperationCommand } from './operationCommandParsing';
import type { HoldAutomaticFireAgainstChoice } from './holdAutomaticFireAgainstParsing';
import type { MemoryUpdateItem } from './orderResponseParsing';
import type { ParsedAgreementDecision } from './sideAgreementDecisionParsing';

/**
 * The normalized orders reply.
 *
 * Contract: The shape a non-null `parseOrdersResponse` call returns.
 * When to use: Passing a parsed envelope from the parser to the apply step.
 * Expected outcome: Coordinates are H3 and bad fields have become drop reasons.
 * Exceptions: None.
 */
export type ParsedOrdersResponse = {
  /**
   * Moves the reply ordered.
   *
   * Contract: One row per expanded actor, with an H3 destination.
   * When to use: Validating movement.
   * Expected outcome: Empty when none was kept.
   * Exceptions: None.
   */
  movementOrders: { unitId: string; toH3Index: string }[];
  /**
   * Ranged attacks the reply ordered.
   *
   * Contract: One row per expanded actor, with an H3 target.
   * When to use: Merging attacks.
   * Expected outcome: Empty when none was kept.
   * Exceptions: None.
   */
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  /**
   * Embark orders the reply named.
   *
   * Contract: Rows with H3 coordinates.
   * When to use: Validating sealift.
   * Expected outcome: Empty when none was kept.
   * Exceptions: None.
   */
  embarkOrders: EmbarkOrder[];
  /**
   * Air strikes the reply ordered.
   *
   * Contract: Rows with an H3 target and a target type.
   * When to use: Merging attacks.
   * Expected outcome: Empty when none was kept.
   * Exceptions: None.
   */
  airStrikes: AirStrikeOrder[];
  /**
   * Ferry orders the reply named.
   *
   * Contract: Rows with an H3 destination.
   * When to use: Validating ferries.
   * Expected outcome: Empty when none was kept.
   * Exceptions: None.
   */
  ferryOrders: FerryOrder[];
  /**
   * Air drops normalized to H3 targets.
   *
   * Contract: One row per expanded actor. Empty when the model omitted the field or every row was dropped.
   * When to use: `applyParsedRequestOrders` validates this list.
   * Expected outcome: `unitId` and `targetH3Index` only.
   * Exceptions: None.
   */
  airDropOrders: import('../../shared/ipc/airDropTypes').AirDropOrder[];
  /**
   * Missile launches normalized to H3 targets.
   *
   * Contract: One row per expanded actor. Empty when the model omitted the field or every row was dropped.
   * When to use: `applyParsedRequestOrders` validates this list.
   * Expected outcome: `unitId` and `targetH3Index` only. A tactical envelope yields an empty list and a battle drop reason.
   * Exceptions: None.
   */
  missileLaunches: MissileLaunchOrder[];
  /**
   * The commander's plan in its own words.
   *
   * Contract: Absent when the reply sent none.
   * When to use: Storing the plan and showing it in Reports.
   * Expected outcome: The reply text.
   * Exceptions: None.
   */
  strategy?: string;
  /**
   * Whether this commander asked to leave an AI-only battle.
   *
   * Contract: True only when the envelope field is boolean true. Missing and every other value are false.
   * When to use: Storing the tactical plan. The flag does not drop the orders on this beat.
   * Expected outcome: `false` unless the model set `exitBattle` to true.
   * Exceptions: None.
   */
  exitBattle: boolean;
  /**
   * Events the commander asks to be consulted about.
   *
   * Contract: Absent when the reply sent none.
   * When to use: Replacing the stored subscriptions.
   * Expected outcome: The parsed subscriptions.
   * Exceptions: None.
   */
  callbacks?: CallbackSubscription[];
  /**
   * Notes the commander asks to keep.
   *
   * Contract: Absent when the reply sent none.
   * When to use: Applying memory changes.
   * Expected outcome: The parsed updates in reply order.
   * Exceptions: None.
   */
  memoryUpdates?: MemoryUpdateItem[];
  /**
   * Briefing code the commander named as the next campaign city.
   * Contract: Present only when the strategic envelope's `campaignTarget` is one two-character code. Absent otherwise, including every tactical envelope.
   * When to use: `applyCampaignTargetOverride` after the orders are stored.
   * Expected outcome: The trimmed code. A present non-code adds a drop reason and leaves this absent.
   * Exceptions: None.
   */
  campaignTargetCode?: string;
  /**
   * Launch and cancel commands from a strategic reply.
   * Contract: Present when `operations` held at least one command. Absent for a tactical reply, an omitted field, and an empty array.
   * When to use: `applyOperationCommands` before standing orders are expanded.
   * Expected outcome: At most one launch, and every well-formed cancel. A bad entry is only a drop reason.
   * Exceptions: None.
   */
  operationCommands?: readonly OperationCommand[];
  /**
   * Posture the commander declared.
   *
   * Contract: A member of `POSTURES`. Absent for a tactical reply, an omitted field, and a name that is not a posture.
   * When to use: `applyPostureChoice` after operation commands.
   * Expected outcome: The lowercased name. A present bad name adds a drop reason and leaves this absent.
   * Exceptions: None.
   */
  postureChoice?: Posture;
  /**
   * Keep-or-break decisions the commander recorded for its active agreements.
   *
   * Contract: Absent for a tactical reply, an omitted field, and a field with no valid entry.
   * When to use: `applySideAgreementDecisions` after the orders are applied.
   * Expected outcome: The accepted entries in reply order. A refused entry adds a drop reason.
   * Exceptions: None.
   */
  agreementDecisions?: readonly ParsedAgreementDecision[];
  /**
   * What the reply asked for the automatic-fire list.
   *
   * Contract: Undefined when the field was missing, empty, or dropped. Read in both theaters. The codes are unresolved.
   * When to use: `applyHoldAutomaticFireAgainstChoice` while applying the reply.
   * Expected outcome: A replace or a clear request.
   * Exceptions: None.
   */
  holdAutomaticFireAgainstChoice?: HoldAutomaticFireAgainstChoice;
  /**
   * How many production orders were applied while parsing.
   *
   * Contract: Absent when none was applied.
   * When to use: Deciding whether a repair request is needed.
   * Expected outcome: A positive count.
   * Exceptions: None.
   */
  productionAppliedCount?: number;
  /**
   * Units whose standing order this response assigned or cancelled.
   * Contract: Present when at least one assign succeeded or one cancel ran. Absent when that list is empty.
   * When to use: Skipping a defend-post move for a unit this response already changed through a standing-order row.
   * Expected outcome: Unit ids in envelope order. Undefined when none.
   * Exceptions: None.
   */
  standingOrderUnitIds?: string[];
  /**
   * Why parts of the reply were refused.
   *
   * Contract: Absent when nothing was refused.
   * When to use: Showing the commander and the log what was dropped.
   * Expected outcome: One sentence for each refusal.
   * Exceptions: None.
   */
  dropReasons?: string[];
  /**
   * True when the envelope named actor rows and none of them were kept.
   * Contract: True only when the expanded `orders`, `airStrikes`, and `ferryOrders` arrays together are non-empty, and movement, ranged, embark, air, ferry, and applied standing-order counts are all zero. Empty actor arrays are false.
   * When to use: The consultation flow, to decide whether one repair call should replace this parse.
   * Expected outcome: False when at least one actor row was applied, or when no actor row was submitted.
   * Exceptions: None.
   */
  everyActorRowDropped: boolean;
  /**
   * How many actor rows the envelope submitted after grouped ids were expanded.
   *
   * Contract: Sum of the expanded `orders`, `airStrikes`, `ferryOrders`, and `missileLaunches` lengths, including entries that are not objects.
   * When to use: The debug log when `everyActorRowDropped` triggers a repair.
   * Expected outcome: Zero when those four arrays are empty.
   * Exceptions: None.
   */
  expandedActorRowCount: number;
};
