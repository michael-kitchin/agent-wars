/**
 * The agreements block of the charts dialog: two dropdowns, the strip, and its legend.
 *
 * Purpose: Keeps the agreements strip's controls, drawing, and text legend in one place, so the dialog only builds and refreshes it.
 * When to use: The charts dialog builds one block directly under the stance strip.
 * Expected outcome: Kind and With dropdowns in the title row, the strip in the plot host, and a legend paragraph after the plot host.
 * Exceptions: None.
 */

import { AGREEMENT_FILTER_ALL, agreementStrip, type AgreementStripFilter } from '../../shared/agreementStrip';
import type { MatchChartsSnapshot } from '../../shared/matchStatistics';
import { isSeatId } from '../../shared/seatIds';
import { SIDE_AGREEMENT_KIND_LABELS, SIDE_AGREEMENT_KINDS, isSideAgreementKind } from '../../shared/sideAgreements';
import { sideCodesToNamesByCode } from '../../shared/sideCodeDisplayText';
import { playerIdCodeFor } from '../../shared/unitIds';
import { createAgreementTimeline } from './agreementTimeline';

/**
 * The legend text under the strip.
 *
 * Purpose: Every mark on the strip has a plain-words explanation.
 * When to use: The legend paragraph.
 * Expected outcome: The exact text of the strip's legend.
 * Exceptions: None.
 */
const AGREEMENT_LEGEND_TEXT =
  'Number: active agreements. +N: proposed agreements. Dashed edge: at least one proposal. Red hatching and !: a breach that turn, an attack on the other side or a decision to break. Amber corner: the other side does not record an active agreement.';

/**
 * The tooltip of the Kind dropdown.
 *
 * Purpose: Says what the dropdown does when the pointer rests on it.
 * When to use: The Kind dropdown's `controlTooltip`.
 * Expected outcome: One sentence.
 * Exceptions: None.
 */
const KIND_CONTROL_TOOLTIP = 'Choose which kind of agreement the agreement strip counts.';

/**
 * The tooltip of the With dropdown.
 *
 * Purpose: Says what the dropdown does when the pointer rests on it.
 * When to use: The With dropdown's `controlTooltip`.
 * Expected outcome: One sentence.
 * Exceptions: None.
 */
const WITH_CONTROL_TOOLTIP = 'Choose the side whose agreements with each commander the strip counts, or all sides.';

/**
 * What a caller controls about the block.
 *
 * Contract: The title row and plot host are in the document, in one block.
 * When to use: `createAgreementStripBlock`.
 * Expected outcome: Enough to build the block.
 * Exceptions: None.
 */
export interface CreateAgreementStripBlockArgs {
  /**
   * The block's title row.
   *
   * Contract: Holds the heading. The dropdowns are appended to it.
   * When to use: Mounting the dropdowns.
   * Expected outcome: An element.
   * Exceptions: None.
   */
  readonly titleRow: HTMLElement;
  /**
   * The block's plot host.
   *
   * Contract: Empty. The legend is appended directly after it.
   * When to use: Mounting the strip and the legend.
   * Expected outcome: An element.
   * Exceptions: None.
   */
  readonly plotHost: HTMLElement;
  /**
   * The strip's total width in CSS pixels.
   *
   * Contract: Positive.
   * When to use: Sizing the strip.
   * Expected outcome: A number.
   * Exceptions: None.
   */
  readonly width: number;
  /**
   * Gives the block's plot height for a title row height.
   *
   * Contract: Keeps the block within a quarter of the dialog.
   * When to use: Sizing the strip once the dropdowns and legend are in place.
   * Expected outcome: A height in pixels.
   * Exceptions: None.
   */
  readonly plotHeightFor: (titleRowHeight: number) => number;
  /**
   * Gives a side's name.
   *
   * Contract: Returns the name shown on screen.
   * When to use: Dropdown options, labels, and tooltips.
   * Expected outcome: Text.
   * Exceptions: None.
   */
  readonly nameOf: (seatId: string) => string;
  /**
   * Gives a side's numbered flag.
   *
   * Contract: Returns a new element, or null.
   * When to use: Row labels.
   * Expected outcome: A flag element or null.
   * Exceptions: None.
   */
  readonly flagOf: (seatId: string) => HTMLElement | null;
  /**
   * The snapshot the block starts with.
   *
   * Contract: Has at least one turn.
   * When to use: The first draw.
   * Expected outcome: The strip shows it.
   * Exceptions: None.
   */
  readonly snapshot: MatchChartsSnapshot;
}

/**
 * What a caller can do with the block.
 *
 * Contract: Calls after `destroy` do nothing.
 * When to use: Refreshing, resizing, measuring, and closing.
 * Expected outcome: Four members.
 * Exceptions: None.
 */
export interface AgreementStripBlockHandle {
  /**
   * The block's title row.
   *
   * Contract: In the document while the dialog is open.
   * When to use: Measuring its height on resize.
   * Expected outcome: An element.
   * Exceptions: None.
   */
  readonly titleRow: HTMLElement;
  /**
   * Redraws the strip from a fresh snapshot.
   *
   * Contract: Keeps the filters and the zoom. A With seat that left the snapshot goes back to All sides.
   * When to use: A refresh.
   * Expected outcome: The strip and the With options match the snapshot.
   * Exceptions: None.
   */
  update(snapshot: MatchChartsSnapshot): void;
  /**
   * Resizes the block's strip.
   *
   * Contract: The height is the block's plot height, which includes the legend.
   * When to use: A window resize while the dialog is open.
   * Expected outcome: The strip fits the height less the legend.
   * Exceptions: None.
   */
  resize(width: number, height: number): void;
  /**
   * Removes the strip and the dropdown listeners.
   *
   * Contract: Safe to call once.
   * When to use: Closing the dialog.
   * Expected outcome: The strip is destroyed.
   * Exceptions: None.
   */
  destroy(): void;
}

/**
 * Builds one labelled dropdown.
 *
 * Purpose: Both dropdowns look like the stance strip's dropdown.
 * When to use: Building the Kind and With dropdowns.
 * Expected outcome: A `label.charts-select-label` holding the text and a `select.charts-select` with its aria label and control tooltip.
 * Exceptions: None.
 */
function buildDropdown(caption: string, ariaLabel: string, tooltip: string): { readonly label: HTMLElement; readonly select: HTMLSelectElement } {
  const select = document.createElement('select');
  select.className = 'charts-select';
  select.setAttribute('aria-label', ariaLabel);
  select.dataset.controlTooltip = tooltip;
  const label = document.createElement('label');
  label.className = 'charts-select-label';
  label.append(caption, select);
  return { label, select };
}

/**
 * Builds one dropdown option.
 *
 * Purpose: Options are text nodes only.
 * When to use: Filling the dropdowns.
 * Expected outcome: An `option` with the value and text.
 * Exceptions: None.
 */
function buildOption(value: string, text: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  return option;
}

/**
 * Creates the agreements block.
 *
 * Purpose: Draws the dropdowns, the strip, and the legend, and redraws the strip when a dropdown changes.
 * When to use: The charts dialog, once, directly after the stance strip.
 * Expected outcome: A handle. The strip already shows the starting snapshot.
 * Exceptions: None.
 */
export function createAgreementStripBlock(args: CreateAgreementStripBlockArgs): AgreementStripBlockHandle {
  const { titleRow, plotHost, nameOf } = args;
  let snapshot = args.snapshot;
  const kindDropdown = buildDropdown('Kind ', 'Kind', KIND_CONTROL_TOOLTIP);
  kindDropdown.select.append(
    buildOption(AGREEMENT_FILTER_ALL, 'All'),
    ...SIDE_AGREEMENT_KINDS.map((kind) => buildOption(kind, SIDE_AGREEMENT_KIND_LABELS[kind])),
  );
  const withDropdown = buildDropdown('With ', 'With', WITH_CONTROL_TOOLTIP);
  const controls = document.createElement('span');
  controls.className = 'charts-block-controls';
  controls.append(kindDropdown.label, withDropdown.label);
  titleRow.appendChild(controls);
  const legend = document.createElement('p');
  legend.className = 'charts-agreement-legend';
  legend.textContent = AGREEMENT_LEGEND_TEXT;
  plotHost.after(legend);

  /**
   * Fills the With options from the snapshot.
   *
   * Purpose: Every seat in the match can be chosen, and the choice survives a refresh while that seat exists.
   * When to use: Building the block and each refresh.
   * Expected outcome: `All sides`, then each seat in side order. A missing chosen seat returns to All sides.
   * Exceptions: None.
   */
  const fillWithOptions = (): void => {
    const chosen = withDropdown.select.value;
    const seats = [...snapshot.seats].sort((a, b) => a.seatOrder - b.seatOrder);
    withDropdown.select.replaceChildren(
      buildOption(AGREEMENT_FILTER_ALL, 'All sides'),
      ...seats.map((seat) => buildOption(seat.seatId, nameOf(seat.seatId))),
    );
    withDropdown.select.value = seats.some((seat) => seat.seatId === chosen) ? chosen : AGREEMENT_FILTER_ALL;
  };

  /**
   * Reads the two dropdowns as a filter.
   *
   * Purpose: One filter value feeds `agreementStrip`.
   * When to use: Each redraw.
   * Expected outcome: The chosen kind, or All for anything else, and the chosen seat id.
   * Exceptions: None.
   */
  const currentFilter = (): AgreementStripFilter => {
    const kind = kindDropdown.select.value;
    return { kind: isSideAgreementKind(kind) ? kind : AGREEMENT_FILTER_ALL, withSeatId: withDropdown.select.value };
  };

  /**
   * Turns side codes in commander text into names.
   *
   * Purpose: Terms and reasons read as names in the tooltip.
   * When to use: Each redraw, with the latest seats.
   * Expected outcome: A text function over the snapshot's seats.
   * Exceptions: None.
   */
  const displayText = (text: string): string => {
    const nameByCode = new Map(
      snapshot.seats.flatMap((seat) =>
        isSeatId(seat.seatId) ? [[playerIdCodeFor(seat.seatId), nameOf(seat.seatId)] as const] : []),
    );
    return sideCodesToNamesByCode(text, nameByCode);
  };

  /**
   * Measures the room the legend takes under the plot.
   *
   * Purpose: The block counts its legend toward the quarter-height rule, and the legend's top margin is part of that room.
   * When to use: Sizing or resizing the plot.
   * Expected outcome: The legend's height plus its top margin, in pixels.
   * Exceptions: None. A margin that does not parse counts as 0.
   */
  const legendSpace = (): number => legend.offsetHeight + (Number.parseFloat(getComputedStyle(legend).marginTop) || 0);

  fillWithOptions();
  const strip = createAgreementTimeline({
    host: plotHost,
    width: args.width,
    height: Math.max(0, args.plotHeightFor(titleRow.offsetHeight) - legendSpace()),
    nameOf,
    flagOf: args.flagOf,
  });

  /**
   * Redraws the strip from the latest snapshot and filters.
   *
   * Purpose: A dropdown change and a refresh share one path.
   * When to use: After a dropdown change and after `update`.
   * Expected outcome: The strip shows the filtered rows and keeps its zoom.
   * Exceptions: None.
   */
  const redraw = (): void => strip.update(agreementStrip(snapshot, currentFilter()), displayText);
  redraw();
  kindDropdown.select.addEventListener('change', redraw);
  withDropdown.select.addEventListener('change', redraw);

  return {
    titleRow,
    update(next: MatchChartsSnapshot): void {
      snapshot = next;
      fillWithOptions();
      redraw();
    },
    resize(width: number, height: number): void {
      strip.resize(width, Math.max(0, height - legendSpace()));
    },
    destroy(): void {
      kindDropdown.select.removeEventListener('change', redraw);
      withDropdown.select.removeEventListener('change', redraw);
      strip.destroy();
    },
  };
}
