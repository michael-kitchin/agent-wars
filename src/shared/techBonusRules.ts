/**
 * Pure tech-bonus amounts.
 *
 * Purpose: Dice, estimates, prompts, and briefings share one rule for Basic and Advanced.
 * When to use: After a birth hex has been counted, or when formatting a bonus the model will read.
 * Expected outcome: Basic and a turned-off option add nothing. Advanced adds 2 attack at Low and High, and 2 defense only at High.
 * Exceptions: None.
 */

import type { BonusLevel } from './bonusLevel';
import { formatOriginBonusTableCell } from './originBonusRules';
import type { OriginBonusSettings, OriginHitBonus, OriginBonusSource } from './originBonusTypes';
import type { TechHitBonus, TechLevel } from './techBonusTypes';

/**
 * Urban cells a birth hex needs before its units are Advanced.
 *
 * Purpose: The cut is on the generated baseline count, not the live count after air strikes.
 * When to use: `techLevelFromUrbanHexCount`.
 * Expected outcome: Five.
 * Exceptions: None.
 */
export const TECH_ADVANCED_MIN_URBAN_HEX_COUNT = 5;

/**
 * Points an Advanced unit adds.
 *
 * Purpose: Low and High share the attack amount. High also uses the defense amount.
 * When to use: The bonus helpers below.
 * Expected outcome: Attack 2 and defense 2.
 * Exceptions: None.
 */
export const TECH_HIT_BONUS: TechHitBonus = Object.freeze({ attack: 2, defense: 2 });

/**
 * Classifies a birth hex from its generated urban-cell count.
 *
 * Purpose: The tier is a fact about the hex, independent of whether the match uses it.
 * When to use: When a unit is stamped or a lookup is built. A missing count is Basic.
 * Expected outcome: `advanced` at `TECH_ADVANCED_MIN_URBAN_HEX_COUNT` or more; otherwise `basic`.
 * Exceptions: None.
 */
export function techLevelFromUrbanHexCount(urbanHexCount: number | null | undefined): TechLevel {
  if (urbanHexCount == null || !Number.isFinite(urbanHexCount)) return 'basic';
  return urbanHexCount >= TECH_ADVANCED_MIN_URBAN_HEX_COUNT ? 'advanced' : 'basic';
}

/**
 * Returns the match's tech level, or off.
 *
 * Purpose: A missing flag is off, and a present flag with no level is Low.
 * When to use: Before adding tech points.
 * Expected outcome: `off`, `low`, or `high`.
 * Exceptions: None.
 */
export function techBonusLevelOf(settings: OriginBonusSettings): BonusLevel {
  if (settings.techBonusEnabled !== true) return 'off';
  return settings.techBonusLevel ?? 'low';
}

/**
 * Returns the attack points for one unit's tier.
 *
 * Purpose: Low and High both help Advanced attacks. Basic never does.
 * When to use: Attack hit thresholds and attack estimates.
 * Expected outcome: 2 or 0.
 * Exceptions: None.
 */
export function techAttackBonus(settings: OriginBonusSettings, techLevel: TechLevel | null | undefined): number {
  if (techLevel !== 'advanced') return 0;
  const level = techBonusLevelOf(settings);
  return level === 'low' || level === 'high' ? TECH_HIT_BONUS.attack : 0;
}

/**
 * Returns the defense points for one unit's tier.
 *
 * Purpose: Only High helps Advanced defense. Casualty order still uses the printed defense.
 * When to use: Defense hit thresholds and defense estimates.
 * Expected outcome: 2 or 0.
 * Exceptions: None.
 */
export function techDefenseBonus(settings: OriginBonusSettings, techLevel: TechLevel | null | undefined): number {
  if (techLevel !== 'advanced') return 0;
  return techBonusLevelOf(settings) === 'high' ? TECH_HIT_BONUS.defense : 0;
}

/**
 * Returns both tech points for one unit's tier.
 *
 * Purpose: Lookups and estimates need the pair together.
 * When to use: After classifying the birth hex.
 * Expected outcome: Both zero unless the unit is Advanced and the option is on.
 * Exceptions: None.
 */
export function techHitBonusFor(settings: OriginBonusSettings, techLevel: TechLevel | null | undefined): TechHitBonus {
  return {
    attack: techAttackBonus(settings, techLevel),
    defense: techDefenseBonus(settings, techLevel),
  };
}

/**
 * Formats one Unit Status Bonus cell, including tech.
 *
 * Purpose: The column stays rectangular. A Basic unit with no origin bonus is still a dash.
 * When to use: `buildUnitStatusTable` when the column is shown.
 * Expected outcome: The origin clause, the tech clause, both joined by a semicolon, or a dash.
 * Exceptions: None.
 */
export function formatBonusTableCellWithTech(input: {
  readonly sources: readonly OriginBonusSource[];
  readonly amount: OriginHitBonus;
  readonly techLevel?: TechLevel | null;
  readonly settings: OriginBonusSettings;
}): string {
  const origin = formatOriginBonusTableCell([...input.sources], input.amount);
  const tech = formatTechBonusBriefingClause(input.settings, input.techLevel);
  if (!tech) return origin;
  return origin === '—' ? tech : `${origin}; ${tech}`;
}

/**
 * Formats the briefing Bonus cell's tech clause.
 *
 * Purpose: The Bonus column stays one cell per row, and Low must not be read as helping defense.
 * When to use: When a row's unit is Advanced and tech is on.
 * Expected outcome: `tech +2 attack` at Low, `tech +2 attack and defense` at High, or empty when there is nothing to add.
 * Exceptions: None.
 */
export function formatTechBonusBriefingClause(settings: OriginBonusSettings, techLevel: TechLevel | null | undefined): string {
  const bonus = techHitBonusFor(settings, techLevel);
  if (bonus.attack === 0 && bonus.defense === 0) return '';
  if (bonus.defense === 0) return `tech +${bonus.attack} attack`;
  return `tech +${bonus.attack} attack and defense`;
}
