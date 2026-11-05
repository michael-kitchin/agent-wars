/**
 * Roster HTML for the ranged-attack effects tooltip.
 *
 * Purpose: The publisher asks for opponent lines built from the defenders the odds call counted.
 * When to use: While publishing a legal ranged hover.
 * Expected outcome: One HTML block, or null when no opponent line applies. Names are escaped by the shared builder.
 * Exceptions: None.
 */

import { COUNTRY_FLAG_CLASS_NAME } from '../../shared/countryFlags';
import { originFlagAssetPath } from '../../shared/originArea';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { buildRangedTargetRosterHtml } from '../../shared/rangedTargetTooltip';
import { buildRangedTargetRosterLines, type RangedTargetRosterUnit } from '../../shared/rangedTargetRoster';
import { fallbackDisplayNameFromUnitId } from '../../shared/unitDisplayNames';
import { createLossTypeToken, createSideNumberFlag } from '../chrome/toastInlineMarks';
import { rendererSharedState as S } from '../core/state';
import type { HoverRoutePreviewState } from '../core/types';
import { resolveUnitOrigin } from '../core/unitOriginFlags';

/**
 * A unit standing on the hovered cell.
 *
 * Purpose: Strategic units and battle sub-units both carry the fields the roster needs.
 * When to use: Filtering the snapshot the player is looking at.
 * Expected outcome: `player` is the seat id or Neutral.
 * Exceptions: None.
 */
interface HoveredCellUnit {
  readonly id: string;
  readonly player: string;
  readonly unitType: string;
  readonly h3Index: string;
}

/**
 * Defender ids on the hovered cell, other than the human seat.
 *
 * Purpose: The odds call counts the units the player can already see, including Neutral.
 * When to use: After ranged validation succeeds, before the odds request.
 * Expected outcome: Ids whose `h3Index` is the hovered cell. The human seat is omitted.
 * Exceptions: None.
 */
export function defenderIdsOnHoveredCell(hoveredH3: string, inBattle: boolean): string[] {
  return occupants(hoveredH3, inBattle)
    .filter((unit) => unit.player !== HUMAN_SEAT_ID)
    .map((unit) => unit.id);
}

/**
 * Opponent lines for the defenders a ranged estimate counted.
 *
 * Purpose: The tooltip names those opponents with the same flags and collapse as a turn-update line.
 * When to use: When the hover preview is a legal ranged attack.
 * Expected outcome: HTML for the opponent lines, or null when none of the counted ids belong to an opponent.
 * Exceptions: None.
 */
export function rangedTargetRosterHtml(preview: HoverRoutePreviewState): string | null {
  const counted = new Set(preview.countedDefenderIds ?? []);
  if (counted.size === 0) return null;
  const defenders = rosterUnits(preview.hoveredH3Index, counted);
  const seats = (S.gameState?.seats ?? []).map((seat) => ({
    seatId: seat.seatId,
    seatOrder: seat.seatOrder,
    nickname: seat.nickname,
    homeRegion: seat.homeRegion,
    kind: seat.kind,
  }));
  const lines = buildRangedTargetRosterLines({ defenders, seats });
  return buildRangedTargetRosterHtml(lines, {
    sideFlagHtml: (seatId) => {
      const flag = createSideNumberFlag(seatId, seats);
      return flag ? flag.outerHTML : '';
    },
    originFlagHtml: originFlagHtml,
    groupMarkHtml: (seatId, unitType) => createLossTypeToken(unitType, seatId, seats).outerHTML,
  });
}

/**
 * Units on one cell in the snapshot the player is looking at.
 *
 * Purpose: A battle reads sub-units. The strategic map reads `gameState.units`.
 * When to use: Defender ids and roster rows for the same hover.
 * Expected outcome: Units whose cell is `hoveredH3`.
 * Exceptions: None.
 */
function occupants(hoveredH3: string, inBattle: boolean): readonly HoveredCellUnit[] {
  if (inBattle) {
    return (S.tacticalBattleSnapshot?.subUnits ?? []).filter((unit) => unit.h3Index === hoveredH3);
  }
  return (S.gameState?.units ?? []).filter((unit) => unit.h3Index === hoveredH3);
}

/**
 * Counted defenders still standing on the hovered cell.
 *
 * Purpose: The roster lists opponent seats among the ids that entered the estimate.
 * When to use: `rangedTargetRosterHtml`.
 * Expected outcome: One roster unit per counted id that is still on that cell.
 * Exceptions: None.
 */
function rosterUnits(hoveredH3: string, counted: ReadonlySet<string>): RangedTargetRosterUnit[] {
  return occupants(hoveredH3, S.tacticalBattleSnapshot != null)
    .filter((unit) => counted.has(unit.id))
    .map((unit) => ({
      unitId: unit.id,
      seatId: unit.player,
      unitType: unit.unitType,
      displayName: S.unitDisplayNameById.get(unit.id) ?? fallbackDisplayNameFromUnitId(unit.id),
    }));
}

/**
 * Origin flag markup for one named unit.
 *
 * Purpose: The tooltip shows the birth flag and does not open the origin tooltip from that image.
 * When to use: Before a named token.
 * Expected outcome: An `<img>` with the shared flag class, or an empty string when the unit has no origin.
 * Exceptions: None.
 */
function originFlagHtml(unitId: string): string {
  const origin = resolveUnitOrigin(unitId);
  if (!origin) return '';
  const image = document.createElement('img');
  image.className = COUNTRY_FLAG_CLASS_NAME;
  image.src = originFlagAssetPath({
    subdivisionCode: origin.birthSubdivisionCode ?? null,
    countryCode: origin.birthCountryCode,
  });
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.draggable = false;
  return image.outerHTML;
}
