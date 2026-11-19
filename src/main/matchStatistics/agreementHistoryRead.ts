/**
 * Reads the agreement history for the charts from recorder events.
 *
 * Purpose: The agreements strip is rebuilt from `agreement_recorded`, `agreement_decision`, and `losses_attributed` events, so no new data is stored.
 * When to use: `buildMatchChartsSnapshot`, and tests.
 * Expected outcome: An `AgreementHistory`. A bad record is skipped, and any failure gives the empty history, so the charts always load.
 * Exceptions: None. Every error is logged and swallowed.
 */

import type {
  AgreementDecisionRecord,
  AgreementHistory,
  AgreementHistoryEntry,
  AgreementVersion,
  AttackLossRecord,
} from '../../shared/agreementHistoryTypes';
import { EMPTY_AGREEMENT_HISTORY } from '../../shared/agreementHistoryTypes';
import { isAttributedLossesRecord } from '../../shared/lossHistory';
import type { MatchRecord } from '../../shared/matchRecording';
import {
  isSideAgreementDecision,
  isSideAgreementIntent,
  isSideAgreementKind,
  isSideAgreementStatus,
  type SideAgreementDecision,
  type SideAgreementIntent,
  type SideAgreementKind,
  type SideAgreementStatus,
} from '../../shared/sideAgreements';
import type { BasicDbOps } from '../gameDb/dbOps';
import { logDebug, logError } from '../logger';
import { COMBAT_RECORD_CATEGORY_BY_CAUSE } from '../briefing/sideCombatRecord';
import { listReadableMatchEventsOfType } from '../recorder/matchRecordStore';
import { zoneH3ToCodes, type ZoneCodeTranslator } from '../sideAgreements/sideAgreementZoneCodes';

/**
 * The fixed facts and first state of an agreement, as one recorded payload holds them.
 *
 * Contract: Produced only by `parseRecordedPayload`, after every field is checked.
 * When to use: Inside this module.
 * Expected outcome: The agreement's fixed facts and the state recorded.
 * Exceptions: None.
 */
interface ParsedRecorded {
  /**
   * The fixed facts of the agreement.
   *
   * Contract: Without versions or decisions.
   * When to use: Creating an entry the first time an id is seen.
   * Expected outcome: An entry with empty lists.
   * Exceptions: None.
   */
  readonly base: AgreementHistoryEntry;
  /**
   * The state this record holds.
   *
   * Contract: Its turn is set by the caller.
   * When to use: Adding a version.
   * Expected outcome: A version.
   * Exceptions: None.
   */
  readonly version: AgreementVersion;
}

/**
 * Reads a field of an unknown payload.
 *
 * Purpose: Payloads are decoded JSON and are not trusted.
 * When to use: Inside the payload parsers.
 * Expected outcome: The named field, or undefined when the payload is not an object.
 * Exceptions: None.
 */
function field(payload: unknown, name: string): unknown {
  return payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>)[name] : undefined;
}

/**
 * Tells whether a value is a whole number.
 *
 * Purpose: Ids and turns are integers.
 * When to use: Inside the payload parsers.
 * Expected outcome: True for an integer.
 * Exceptions: None.
 */
function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/**
 * Checks and converts one `agreement_recorded` payload.
 *
 * Purpose: A damaged or newer payload must be skipped, not trusted.
 * When to use: For each recorded agreement event.
 * Expected outcome: The fixed facts and one version, or null when any field is missing or of the wrong type.
 * Exceptions: None.
 */
function parseRecordedPayload(record: MatchRecord, zoneTranslator: ZoneCodeTranslator | undefined): ParsedRecorded | null {
  const p = record.payload;
  const get = (name: string): unknown => field(p, name);
  const kind = get('kind');
  const status = get('status');
  const intent = get('intent');
  const zoneH3 = get('zoneH3');
  const against = get('againstSeatId');
  const strings = ['seatId', 'counterpartSeatId', 'terms', 'reason'].map(get);
  if (
    !isInt(get('agreementId')) || !isInt(get('startTurn')) || !isInt(get('endTurn')) ||
    !strings.every((value) => typeof value === 'string') ||
    !isSideAgreementKind(kind) || !isSideAgreementStatus(status) || !isSideAgreementIntent(intent) ||
    !Array.isArray(zoneH3) || !zoneH3.every((cell) => typeof cell === 'string') ||
    !(against === null || typeof against === 'string')
  ) {
    return null;
  }
  const [seatId, counterpartSeatId, terms, reason] = strings as string[];
  const agreementId = get('agreementId') as number;
  const endTurn = get('endTurn') as number;
  return {
    base: {
      agreementId,
      seatId,
      counterpartSeatId,
      kind: kind as SideAgreementKind,
      againstSeatId: against,
      startTurn: get('startTurn') as number,
      versions: [],
      decisions: [],
    },
    version: {
      turnNumber: record.turnNumber,
      status: status as SideAgreementStatus,
      endTurn,
      terms,
      zoneCodes: zoneH3ToCodes(zoneH3 as string[], zoneTranslator),
      intent: intent as SideAgreementIntent,
      reason,
    },
  };
}

/**
 * Replaces the item of the same turn, or adds the item, and keeps the list ordered by turn.
 *
 * Purpose: A turn keeps only its last record.
 * When to use: Adding a version or a decision.
 * Expected outcome: A new ascending list with at most one item per turn.
 * Exceptions: None.
 */
function withTurnItem<Item extends { readonly turnNumber: number }>(items: readonly Item[], next: Item): Item[] {
  return [...items.filter((item) => item.turnNumber !== next.turnNumber), next].sort((a, b) => a.turnNumber - b.turnNumber);
}

/**
 * Builds the agreement entries from the recorded events.
 *
 * Purpose: The first record of an id fixes the facts. Every record adds a version.
 * When to use: First step of `readAgreementHistory`.
 * Expected outcome: The entries by id, and how many records were skipped.
 * Exceptions: None.
 */
function readAgreements(
  ops: BasicDbOps,
  zoneTranslator: ZoneCodeTranslator | undefined,
): { readonly entries: Map<number, AgreementHistoryEntry>; readonly skipped: number } {
  const entries = new Map<number, AgreementHistoryEntry>();
  let skipped = 0;
  for (const record of listReadableMatchEventsOfType(ops, 'agreement_recorded')) {
    if (record.scope !== 'strategic') continue;
    const parsed = parseRecordedPayload(record, zoneTranslator);
    if (!parsed) {
      skipped += 1;
      continue;
    }
    const existing = entries.get(parsed.base.agreementId) ?? parsed.base;
    entries.set(existing.agreementId, { ...existing, versions: withTurnItem(existing.versions, parsed.version) });
  }
  return { entries, skipped };
}

/**
 * Attaches the recorded decisions to their agreements.
 *
 * Purpose: A decision is shown with its agreement.
 * When to use: Second step of `readAgreementHistory`.
 * Expected outcome: Decisions added, and the number of records skipped for a bad payload or an unknown agreement.
 * Exceptions: None.
 */
function attachDecisions(ops: BasicDbOps, entries: Map<number, AgreementHistoryEntry>): number {
  let skipped = 0;
  for (const record of listReadableMatchEventsOfType(ops, 'agreement_decision')) {
    if (record.scope !== 'strategic') continue;
    const agreementId = field(record.payload, 'agreementId');
    const decision = field(record.payload, 'decision');
    const reason = field(record.payload, 'reason');
    const entry = isInt(agreementId) ? entries.get(agreementId) : undefined;
    if (!entry || !isSideAgreementDecision(decision) || typeof reason !== 'string') {
      skipped += 1;
      continue;
    }
    const next: AgreementDecisionRecord = { turnNumber: record.turnNumber, decision: decision as SideAgreementDecision, reason };
    entries.set(entry.agreementId, { ...entry, decisions: withTurnItem(entry.decisions, next) });
  }
  return skipped;
}

/**
 * Counts the units one victim lost to attacks, by responsible owner.
 *
 * Purpose: Only ranged, air, and missile losses are attacks the responsible side started.
 * When to use: For each victim of one strategic loss record.
 * Expected outcome: The units per responsible owner. A unit with no responsible owner list counts for nobody.
 * Exceptions: None.
 */
function attackUnitsByAttacker(victimId: string, buckets: unknown): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [cause, category] of Object.entries(COMBAT_RECORD_CATEGORY_BY_CAUSE)) {
    const bucket = field(buckets, cause);
    if (category !== 'responsibleAttacked' || !Array.isArray(bucket)) continue;
    for (const unit of bucket) {
      const responsible = field(field(unit, 'attribution'), 'responsibleOwnerIds');
      if (!Array.isArray(responsible)) continue;
      for (const attacker of responsible) {
        if (typeof attacker === 'string' && attacker !== victimId) counts.set(attacker, (counts.get(attacker) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/**
 * Reads the attack records from the strategic loss events.
 *
 * Purpose: A breach is an attack on the other side, and battle losses cannot say who started the fight.
 * When to use: Third step of `readAgreementHistory`.
 * Expected outcome: Records summed by turn, attacker, and victim, in turn then attacker then victim order.
 * Exceptions: None.
 */
function readAttacks(ops: BasicDbOps): AttackLossRecord[] {
  const totals = new Map<string, AttackLossRecord>();
  for (const record of listReadableMatchEventsOfType(ops, 'losses_attributed')) {
    const { payload } = record;
    if (record.scope !== 'strategic' || !isAttributedLossesRecord(payload) || payload.source !== 'strategicTurn') continue;
    for (const [fromSeatId, buckets] of Object.entries(payload.byOwner)) {
      for (const [bySeatId, units] of attackUnitsByAttacker(fromSeatId, buckets)) {
        const key = `${record.turnNumber}|${bySeatId}|${fromSeatId}`;
        const previous = totals.get(key);
        totals.set(key, { turnNumber: record.turnNumber, bySeatId, fromSeatId, units: (previous?.units ?? 0) + units });
      }
    }
  }
  return [...totals.values()].sort(
    (a, b) => a.turnNumber - b.turnNumber || a.bySeatId.localeCompare(b.bySeatId) || a.fromSeatId.localeCompare(b.fromSeatId),
  );
}

/**
 * Rebuilds every agreement's history and the attacks between sides.
 *
 * Purpose: Feeds the charts snapshot's `agreementHistory`.
 * When to use: Whenever the charts snapshot is built.
 * Expected outcome: Agreements by id with ascending versions and decisions, and attack records. A match with no events, or a failed read, gives `EMPTY_AGREEMENT_HISTORY`.
 * Exceptions: None. A thrown error is logged with `logError` and the empty history is returned.
 */
export function readAgreementHistory(ops: BasicDbOps, zoneTranslator?: ZoneCodeTranslator): AgreementHistory {
  logDebug('agreementHistoryRead readAgreementHistory');
  try {
    const { entries, skipped: skippedAgreements } = readAgreements(ops, zoneTranslator);
    const skippedDecisions = attachDecisions(ops, entries);
    const attacks = readAttacks(ops);
    const agreements = [...entries.values()].sort((a, b) => a.agreementId - b.agreementId);
    logDebug('agreementHistoryRead readAgreementHistory done', {
      agreementCount: agreements.length,
      decisionCount: agreements.reduce((sum, entry) => sum + entry.decisions.length, 0),
      attackCount: attacks.length,
      skippedAgreements,
      skippedDecisions,
    });
    return agreements.length === 0 && attacks.length === 0 ? EMPTY_AGREEMENT_HISTORY : { agreements, attacks };
  } catch (err) {
    logError('agreementHistoryRead readAgreementHistory failed', err);
    return EMPTY_AGREEMENT_HISTORY;
  }
}
