import { COUNTRY_FLAG_CLASS_NAME, countryFlagAssetPath } from '../../shared/countryFlags';
import type { GameStateSnapshot } from '../../shared/ipc/gameStateTypes';
import { LOSS_CAUSE_KEYS, type TurnLossSummary } from '../../shared/lossSummary';
import { parseTacticalSubUnitId } from '../../shared/unitIds';
import { formatUnitOriginTooltipText, unitOriginsPresentTheSame } from '../../shared/unitOriginTooltipText';
import type { UnitOrigin } from '../../shared/unitOriginTypes';
import { originBonusTooltipLineForUnit } from './unitOriginBonusLine';

/**
 * Birth origins of every unit seen in a snapshot this game, keyed by strategic unit id.
 *
 * Purpose: Lets unit labels show a country flag, including labels for units that have since been destroyed
 *   (loss toasts and tactical casualty rows). Only the flag helpers in this module read or write it.
 * When to use: Through `rememberUnitOrigins`, `resolveUnitOrigin`, and `clearRememberedUnitOrigins` only.
 * Expected outcome: Entries accumulate across snapshots and are never removed when a unit dies; the map is
 *   cleared on new game. Units without recorded origin data have no entry.
 * Exceptions: None.
 */
const unitOriginById = new Map<string, UnitOrigin>();

/**
 * Records the birth origin of every unit in a snapshot that carries one.
 *
 * Purpose: Fills the accumulating origin cache so unit labels can show flags, even after a unit is destroyed.
 * When to use: For every applied game-state snapshot, before unit labels are rendered.
 * Expected outcome: Each unit with `origin` has an entry; existing entries are overwritten, never deleted.
 * Exceptions: None.
 */
export function rememberUnitOrigins(units: GameStateSnapshot['units']): void {
  for (const unit of units) {
    if (unit.origin) unitOriginById.set(unit.id, unit.origin);
  }
}

/**
 * Forgets every remembered unit origin.
 *
 * Purpose: Prevents a previous game's origins from attaching to reused unit ids in a new game.
 * When to use: When a new game starts, right before its first snapshot is remembered.
 * Expected outcome: The origin cache is empty.
 * Exceptions: None.
 */
export function clearRememberedUnitOrigins(): void {
  unitOriginById.clear();
}

/**
 * Looks up the birth origin for a strategic unit id or a tactical sub-unit id.
 *
 * Purpose: Tactical sub-units have no origin of their own; they share their parent unit's.
 * When to use: Before rendering a flag for a unit label.
 * Expected outcome: The remembered origin for the id, else the parent's origin for a sub-unit id, else `null`.
 * Exceptions: None.
 */
export function resolveUnitOrigin(unitId: string): UnitOrigin | null {
  const direct = unitOriginById.get(unitId);
  if (direct) return direct;
  const parentUnitId = parseTacticalSubUnitId(unitId)?.parentUnitId;
  return parentUnitId ? (unitOriginById.get(parentUnitId) ?? null) : null;
}

/**
 * Builds the flag image placed before a unit's name.
 *
 * Purpose: One element shape for every unit-name surface, carrying the text for the origin hover tooltip.
 * When to use: For DOM-built labels; the delegated origin tooltip reads `data-unit-origin-tooltip` on hover.
 * Expected outcome: A decorative, non-draggable `<img>` hidden from assistive tech, with the shared flag class;
 *   the placeholder flag when the origin has no country code with a vendored flag. A non-empty `bonusLine` is
 *   appended to the tooltip text.
 * Exceptions: None.
 */
export function createUnitOriginFlagImage(origin: UnitOrigin, bonusLine?: string | null): HTMLImageElement {
  const img = document.createElement('img');
  img.className = COUNTRY_FLAG_CLASS_NAME;
  img.src = countryFlagAssetPath(origin.birthCountryCode);
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.draggable = false;
  img.dataset.unitOriginTooltip = formatUnitOriginTooltipText(origin, bonusLine);
  return img;
}

/**
 * Replaces an element's content with a unit label, prefixed by the unit's flag when its origin is known.
 *
 * Purpose: The single helper every unit-name surface uses in place of assigning `textContent`.
 * When to use: For labels that start with a unit's full display name; `text` is the full existing label text.
 * Expected outcome: `target` holds an optional flag followed by one text node; units without a remembered
 *   origin render exactly as plain text did before. The flag tooltip carries the origin bonus line when one applies
 *   where the unit stands.
 * Exceptions: None.
 */
export function setUnitNameContent(target: HTMLElement, unitId: string, text: string): void {
  target.replaceChildren();
  const origin = resolveUnitOrigin(unitId);
  if (origin) target.appendChild(createUnitOriginFlagImage(origin, originBonusTooltipLineForUnit(unitId, origin)));
  target.appendChild(document.createTextNode(text));
}

/**
 * Maps each named victim of a turn's losses to its birth origin, for flags in the loss toast.
 *
 * Purpose: The toast is plain text built from display names, so its flags are matched by name.
 * When to use: Right before showing a map toast built from `summary`.
 * Expected outcome: One entry per victim display name whose unit id has a remembered origin. A name shared by
 *   victims whose origins would not show the same flag and tooltip is left out, so no flag is shown rather than a wrong one.
 * Exceptions: None.
 */
export function buildUnitOriginByLossDisplayName(summary: TurnLossSummary): ReadonlyMap<string, UnitOrigin> {
  const originByName = new Map<string, UnitOrigin>();
  const ambiguousNames = new Set<string>();
  const victims = [summary.human, summary.ai].flatMap((player) => LOSS_CAUSE_KEYS.flatMap((key) => player[key]));
  for (const victim of victims) {
    const origin = victim.unitId ? resolveUnitOrigin(victim.unitId) : null;
    if (!origin) continue;
    const existing = originByName.get(victim.displayName);
    if (existing && !unitOriginsPresentTheSame(existing, origin)) ambiguousNames.add(victim.displayName);
    else originByName.set(victim.displayName, origin);
  }
  for (const name of ambiguousNames) originByName.delete(name);
  return originByName;
}
