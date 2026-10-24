/**
 * Canvas drawing for resolution-playback dice chips: small panels under each stack showing the dice it rolled.
 * Grouping, timing, and fog rules live in `src/shared/combatDiceChips.ts`; this module only lays out and paints.
 */

import {
  buildCombatDiceChips,
  combatDiceChipOpacity,
  combatDiceWindowForPhase,
  isCombatDiceHit,
  type CombatDiceChip,
  type CombatDiceChipRow,
  type CombatDicePlaybackPhaseKey,
} from '../../shared/combatDiceChips';
import type { CombatDiceInfrastructureType, CombatDiceRoll } from '../../shared/ipcTypes';
import { UNIT_RADIUS, UNIT_TYPE_LABELS } from '../core/constants';
import { paletteForCurrentOwner } from './ownerColors';
import type { ResolutionMoveAnimationState } from '../core/state';
import { hexCenterPx } from '../map/mapHelpers';
import { shouldHideStrategicMapUnitsForZoom } from '../map/terrainView';
import { buildResolutionPlaybackState, resolutionAnimationElapsedMs } from './resolutionPlayback';
import { drawUnitTypeGlyph } from './unitDrawing';

/**
 * Font for every chip line.
 *
 * Purpose: One small bold face keeps faces and tallies legible at the chip's size.
 * When to use: Set before measuring or drawing chip text.
 * Expected outcome: 10px bold system UI text.
 * Exceptions: None.
 */
const CHIP_FONT = 'bold 10px system-ui, sans-serif';

/**
 * Chip layout metrics in CSS pixels.
 *
 * Purpose: Keeps measuring and drawing on the same numbers.
 * When to use: All chip layout in this module.
 * Expected outcome: Row height 14, padding 4 horizontal and 3 vertical, 3 between row segments, 1 between lines,
 *   corner radius 3, mini-token radius 6, unit glyph size 10, and at least 2 between a chip and the canvas edge.
 * Exceptions: None.
 */
const CHIP_LAYOUT = Object.freeze({
  rowHeight: 14,
  padX: 4,
  padY: 3,
  gap: 3,
  rowGap: 1,
  cornerRadius: 3,
  tokenRadius: 6,
  glyphSize: 10,
  edgeInset: 2,
});

/**
 * Chip colors.
 *
 * Purpose: Dark panel chrome matching the app's overlays, with hit and miss faces readable on top of it.
 * When to use: All chip painting in this module; documented in `doc/ui-style-guide.md`.
 * Expected outcome: Background `#1b2838` at 92% opacity with a `#5a7090` border; text `#f4f6f8`; tags and the
 *   "+N more" line `#b7c4d4`; hit faces `#86efac`; miss faces `#8aa0b8`.
 * Exceptions: None.
 */
const CHIP_COLORS = Object.freeze({
  background: 'rgba(27, 40, 56, 0.92)',
  border: '#5a7090',
  text: '#f4f6f8',
  tag: '#b7c4d4',
  hit: '#86efac',
  miss: '#8aa0b8',
});

/**
 * Text shown in place of a mini token on infrastructure counter-fire rows.
 *
 * Purpose: Infrastructure has no unit glyph, so the row names what fired back.
 * When to use: Rows whose `infrastructureType` is set.
 * Expected outcome: `City`, `Airport`, or `Port`.
 * Exceptions: None.
 */
const INFRASTRUCTURE_LABELS: Readonly<Record<CombatDiceInfrastructureType, string>> = Object.freeze({
  urban: 'City',
  airport: 'Airport',
  seaport: 'Port',
});

/**
 * Phases in drawing order, each with the animation field holding its rolls.
 *
 * Purpose: One loop draws every phase's chips the same way.
 * When to use: `drawResolutionDiceChips`.
 * Expected outcome: Air strike, ranged, then melee. Their windows never overlap, so at most one phase draws at a time.
 * Exceptions: None.
 */
const DICE_PHASES: readonly {
  readonly key: CombatDicePlaybackPhaseKey;
  readonly rolls: (anim: NonNullable<ResolutionMoveAnimationState>) => readonly CombatDiceRoll[] | undefined;
}[] = [
  { key: 'airStrike', rolls: (anim) => anim.airStrikeDiceRolls },
  { key: 'ranged', rolls: (anim) => anim.rangedDiceRolls },
  { key: 'melee', rolls: (anim) => anim.meleeDiceRolls },
];

/**
 * Chips already built for a roll array.
 *
 * Purpose: Roll arrays never change during a playback, so grouping runs once per array instead of every frame.
 * When to use: `chipsForRolls` only.
 * Expected outcome: Entries go away with the playback state that owns the arrays.
 * Exceptions: None.
 */
const chipsByRollArray = new WeakMap<readonly CombatDiceRoll[], CombatDiceChip[]>();

/**
 * One piece of a chip line, measured and drawn left to right.
 *
 * Purpose: Measuring and painting walk the same segments, so widths always match what is drawn.
 * When to use: Built by `rowSegments` and `moreSegments`.
 * Expected outcome: Either colored text or a mini unit token.
 * Exceptions: None.
 */
type ChipSegment =
  | { readonly type: 'text'; readonly text: string; readonly color: string }
  | { readonly type: 'token'; readonly player: string | null; readonly unitType: string | null };

/**
 * A chip with its lines resolved into segments and its size measured.
 *
 * Purpose: Lets the caller sort and place chips before painting.
 * When to use: Between `layoutChip` and `paintChip`.
 * Expected outcome: `width` and `height` include padding.
 * Exceptions: None.
 */
interface LaidOutChip {
  /**
   * Hex or cell the chip hangs from.
   *
   * Contract: Same as the source chip's anchor.
   * When to use: Positioning.
   * Expected outcome: An H3 index.
   * Exceptions: None.
   */
  readonly anchorH3Index: string;
  /**
   * Segments for each line, top to bottom.
   *
   * Contract: One entry per drawn line, including the "+N more" line.
   * When to use: Painting.
   * Expected outcome: Never empty.
   * Exceptions: None.
   */
  readonly lines: readonly (readonly ChipSegment[])[];
  /**
   * Chip width in CSS pixels.
   *
   * Contract: Widest line plus horizontal padding.
   * When to use: Positioning and the background rectangle.
   * Expected outcome: Positive.
   * Exceptions: None.
   */
  readonly width: number;
  /**
   * Chip height in CSS pixels.
   *
   * Contract: Line count times row height, plus one pixel between each pair of lines, plus vertical padding.
   * When to use: Positioning and the background rectangle.
   * Expected outcome: Positive.
   * Exceptions: None.
   */
  readonly height: number;
}

/**
 * Returns the chips for one roll array, building them on first use.
 *
 * Purpose: Per-frame drawing reuses grouped chips.
 * When to use: Once per phase per frame.
 * Expected outcome: The same chip list for the same array on every frame.
 * Exceptions: None.
 */
function chipsForRolls(rolls: readonly CombatDiceRoll[]): CombatDiceChip[] {
  const cached = chipsByRollArray.get(rolls);
  if (cached) return cached;
  const chips = buildCombatDiceChips(rolls);
  chipsByRollArray.set(rolls, chips);
  return chips;
}

/**
 * Turns one chip row into drawable segments.
 *
 * Purpose: Row format is the tag, a mini token or infrastructure label, the faces or a tally, then the hit number.
 * When to use: `layoutChip` for each row.
 * Expected outcome: Faces in hit or miss colors when the row keeps faces; otherwise the hit count in the hit color
 *   followed by `/rolls`.
 * Exceptions: None.
 */
function rowSegments(row: CombatDiceChipRow): ChipSegment[] {
  const subject: ChipSegment = row.infrastructureType
    ? { type: 'text', text: INFRASTRUCTURE_LABELS[row.infrastructureType], color: CHIP_COLORS.text }
    : { type: 'token', player: row.player, unitType: row.unitType };
  const results: ChipSegment[] =
    row.faces.length > 0
      ? row.faces.map((face) => ({
          type: 'text',
          text: String(face),
          color: isCombatDiceHit({ face, threshold: row.threshold }) ? CHIP_COLORS.hit : CHIP_COLORS.miss,
        }))
      : [
          { type: 'text', text: String(row.hitCount), color: CHIP_COLORS.hit },
          { type: 'text', text: `/${row.rollCount}`, color: CHIP_COLORS.text },
        ];
  return [
    { type: 'text', text: row.tag, color: CHIP_COLORS.tag },
    subject,
    ...results,
    { type: 'text', text: `≤${row.threshold}`, color: CHIP_COLORS.text },
  ];
}

/**
 * Vertical size of a chip for a given line count.
 *
 * Purpose: The panel grows with the one-pixel gaps `lineCenterY` leaves between lines.
 * When to use: `layoutChip`.
 * Expected outcome: Row heights, one `rowGap` between each pair of lines, and vertical padding on both ends.
 * Exceptions: None.
 */
function chipHeight(lineCount: number): number {
  const betweenLines = Math.max(0, lineCount - 1) * CHIP_LAYOUT.rowGap;
  return lineCount * CHIP_LAYOUT.rowHeight + betweenLines + CHIP_LAYOUT.padY * 2;
}

/**
 * Vertical center of one chip line.
 *
 * Purpose: Each line after the first starts one pixel below the line above it.
 * When to use: `paintChip`.
 * Expected outcome: The middle of that line inside the padded panel.
 * Exceptions: None.
 */
function lineCenterY(top: number, lineIndex: number): number {
  const pitch = CHIP_LAYOUT.rowHeight + CHIP_LAYOUT.rowGap;
  return top + CHIP_LAYOUT.padY + lineIndex * pitch + CHIP_LAYOUT.rowHeight / 2;
}

/**
 * Measures one segment with the chip font already set.
 *
 * Purpose: Shared width rule for layout.
 * When to use: `lineWidth`.
 * Expected outcome: Text width from `measureText`, or the mini-token diameter.
 * Exceptions: None.
 */
function segmentWidth(ctx: CanvasRenderingContext2D, segment: ChipSegment): number {
  return segment.type === 'token' ? CHIP_LAYOUT.tokenRadius * 2 : ctx.measureText(segment.text).width;
}

/**
 * Measures one line of segments.
 *
 * Purpose: Chip width follows its widest line.
 * When to use: `layoutChip`.
 * Expected outcome: Sum of segment widths plus one gap between each pair.
 * Exceptions: None.
 */
function lineWidth(ctx: CanvasRenderingContext2D, segments: readonly ChipSegment[]): number {
  const total = segments.reduce((sum, segment) => sum + segmentWidth(ctx, segment), 0);
  return total + CHIP_LAYOUT.gap * Math.max(0, segments.length - 1);
}

/**
 * Resolves a chip into lines and measures it.
 *
 * Purpose: Separates layout from painting so chips can be ordered before drawing.
 * When to use: With the chip font already set on `ctx`.
 * Expected outcome: One line per row plus a `+N more` line when rows were hidden.
 * Exceptions: None.
 */
function layoutChip(ctx: CanvasRenderingContext2D, chip: CombatDiceChip): LaidOutChip {
  const lines: ChipSegment[][] = chip.rows.map(rowSegments);
  if (chip.hiddenRowCount > 0) {
    lines.push([{ type: 'text', text: `+${chip.hiddenRowCount} more`, color: CHIP_COLORS.tag }]);
  }
  const contentWidth = Math.max(...lines.map((line) => lineWidth(ctx, line)));
  return {
    anchorH3Index: chip.anchorH3Index,
    lines,
    width: contentWidth + CHIP_LAYOUT.padX * 2,
    height: chipHeight(lines.length),
  };
}

/**
 * Clamps a chip's top-left coordinate so the chip stays on the canvas.
 *
 * Purpose: Chips under tokens near the map edge stay readable.
 * When to use: Once per axis per chip.
 * Expected outcome: A value in `[inset, extent - size - inset]`, or `inset` when the chip is larger than the canvas.
 * Exceptions: None.
 */
function clampToCanvas(value: number, size: number, extent: number): number {
  const inset = CHIP_LAYOUT.edgeInset;
  return Math.max(inset, Math.min(value, extent - size - inset));
}

/**
 * Draws one row's mini unit token.
 *
 * Purpose: Shows who rolled with the same fill and glyph as the map token, at chip size.
 * When to use: For `token` segments.
 * Expected outcome: A filled, outlined circle with the unit glyph, or the unit's letter while the glyph loads.
 * Exceptions: None.
 */
function paintMiniToken(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  segment: Extract<ChipSegment, { type: 'token' }>
): void {
  const player = segment.player ?? '';
  const palette = paletteForCurrentOwner(player);
  ctx.beginPath();
  ctx.arc(centerX, centerY, CHIP_LAYOUT.tokenRadius, 0, Math.PI * 2);
  ctx.fillStyle = palette?.map ?? '#333';
  ctx.fill();
  ctx.strokeStyle = palette?.text ?? CHIP_COLORS.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  const unitType = segment.unitType ?? '';
  if (drawUnitTypeGlyph(ctx, centerX, centerY, unitType, CHIP_LAYOUT.glyphSize, segment.player ?? undefined)) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = CHIP_COLORS.text;
  ctx.fillText(UNIT_TYPE_LABELS[unitType] ?? '?', centerX, centerY);
  ctx.textAlign = 'left';
}

/**
 * Paints one laid-out chip at a top-left position.
 *
 * Purpose: Draws the panel, then each line's segments left to right.
 * When to use: After `layoutChip` and positioning, with the chip font set and `textBaseline` `middle`.
 * Expected outcome: The chip appears on the canvas; canvas state other than fill, stroke, and line width is unchanged.
 * Exceptions: None.
 */
function paintChip(ctx: CanvasRenderingContext2D, chip: LaidOutChip, left: number, top: number): void {
  ctx.beginPath();
  ctx.roundRect(left, top, chip.width, chip.height, CHIP_LAYOUT.cornerRadius);
  ctx.fillStyle = CHIP_COLORS.background;
  ctx.fill();
  ctx.strokeStyle = CHIP_COLORS.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  chip.lines.forEach((segments, lineIndex) => {
    const centerY = lineCenterY(top, lineIndex);
    let x = left + CHIP_LAYOUT.padX;
    for (const segment of segments) {
      if (segment.type === 'token') {
        paintMiniToken(ctx, x + CHIP_LAYOUT.tokenRadius, centerY, segment);
      } else {
        ctx.fillStyle = segment.color;
        ctx.fillText(segment.text, x, centerY);
      }
      x += segmentWidth(ctx, segment) + CHIP_LAYOUT.gap;
    }
  });
}

/**
 * Returns the phases whose chips are visible at this moment of playback, with their rolls and opacity.
 *
 * Purpose: Drawing and `areResolutionDiceChipsShowing` share one visibility rule.
 * When to use: Once per frame by either caller.
 * Expected outcome: Phases that recorded rolls and whose window gives a positive opacity, in drawing order. Empty
 *   outside every window.
 * Exceptions: None.
 */
function visibleDicePhases(
  anim: NonNullable<ResolutionMoveAnimationState>,
  elapsedMs: number
): { readonly rolls: readonly CombatDiceRoll[]; readonly opacity: number }[] {
  const { phase } = buildResolutionPlaybackState(anim, elapsedMs);
  return DICE_PHASES.flatMap((dicePhase) => {
    const rolls = dicePhase.rolls(anim);
    if (!rolls?.length) return [];
    const { startMs, endMs } = combatDiceWindowForPhase(phase, dicePhase.key);
    const opacity = combatDiceChipOpacity(elapsedMs, startMs, endMs);
    return opacity > 0 ? [{ rolls, opacity }] : [];
  });
}

/**
 * Returns true while resolution playback is painting dice chips.
 *
 * Purpose: Build markers and tactical entry markers are DOM buttons above the canvas and would cover the chips, so
 *   both marker layers hide while this is true.
 * When to use: Each time a marker layer syncs.
 * Expected outcome: True only during playback, inside a phase window that recorded rolls (fade-in and fade-out
 *   included), and when the zoom shows strategic units. False with no playback.
 * Exceptions: None.
 */
export function areResolutionDiceChipsShowing(anim: ResolutionMoveAnimationState): boolean {
  if (!anim || shouldHideStrategicMapUnitsForZoom()) return false;
  return visibleDicePhases(anim, resolutionAnimationElapsedMs(anim)).length > 0;
}

/**
 * Draws the dice chips for whichever resolution phase is showing.
 *
 * Purpose: Shows every die rolled in the air strike, ranged, or melee phase for twice that phase's lightning-through-casualty
 *   beat, hung just below the stack that rolled them. The chips can still be up after later stages have finished.
 * When to use: As the last playback draw of a frame, so chips sit above every other playback layer. The caller skips
 *   it when strategic units are hidden at the tactical zoom.
 * Expected outcome: Nothing outside a phase window or when the phase has no recorded rolls. Otherwise one chip per
 *   anchor, faded in and out at the window edges, drawn top to bottom by anchor screen position so lower chips
 *   cover the ones above them, and clamped inside the canvas. Chips are paint only and never take input. Build and
 *   tactical entry markers hide meanwhile (`areResolutionDiceChipsShowing`).
 * Exceptions: None.
 */
export function drawResolutionDiceChips(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  anim: NonNullable<ResolutionMoveAnimationState>,
  elapsedMs: number
): void {
  for (const { rolls, opacity } of visibleDicePhases(anim, elapsedMs)) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.font = CHIP_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    chipsForRolls(rolls)
      .map((chip) => ({ chip: layoutChip(ctx, chip), center: hexCenterPx(chip.anchorH3Index) }))
      .sort((a, b) => a.center.y - b.center.y)
      .forEach(({ chip, center }) => {
        const left = clampToCanvas(center.x - chip.width / 2, chip.width, width);
        const top = clampToCanvas(center.y + UNIT_RADIUS - 2, chip.height, height);
        paintChip(ctx, chip, left, top);
      });
    ctx.restore();
  }
}
