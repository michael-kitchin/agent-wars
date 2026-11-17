/**
 * One side's relationship stack: a spoke graph over a row card.
 *
 * Purpose: Shows how each AI commander regards one side, with trust and threat, how many hexes they took, and how old the report is.
 * When to use: The charts dialog builds one stack per side.
 * Expected outcome: A card element built from elements and `textContent` only.
 * Exceptions: None.
 */

import { spokePositions, type RelationshipRow } from '../../shared/matchChartSeries';
import { HEXES_TAKEN_WINDOW_TURNS, RELATIONSHIP_SCALE_MAX } from '../../shared/matchStatistics';

/**
 * What a stack needs to draw one side.
 *
 * Contract: `rows` come from `relationshipRows` for the same subject.
 * When to use: `buildRelationshipStack`.
 * Expected outcome: The subject, the rows, and the helpers that name and mark a side.
 * Exceptions: None.
 */
export interface RelationshipStackArgs {
  /**
   * The side the commanders report on.
   *
   * Contract: A seat id.
   * When to use: The heading and the center node.
   * Expected outcome: The seat id.
   * Exceptions: None.
   */
  readonly subjectSeatId: string;
  /**
   * One row per reporting commander.
   *
   * Contract: Empty when no AI commander reports on the side.
   * When to use: The spokes and the row card.
   * Expected outcome: The rows in side order.
   * Exceptions: None.
   */
  readonly rows: readonly RelationshipRow[];
  /**
   * Gives a side's name.
   *
   * Contract: Returns the name shown on screen.
   * When to use: The heading, node labels, and the Side column.
   * Expected outcome: Text.
   * Exceptions: None.
   */
  readonly nameOf: (seatId: string) => string;
  /**
   * Gives a side's numbered flag.
   *
   * Contract: Returns a new element, or null.
   * When to use: The heading and the Side column.
   * Expected outcome: A flag element or null.
   * Exceptions: None.
   */
  readonly flagOf: (seatId: string) => HTMLElement | null;
  /**
   * Gives a side's number, starting at 1.
   *
   * Contract: Returns the seat order.
   * When to use: The digit and color of a spoke node.
   * Expected outcome: A whole number.
   * Exceptions: None.
   */
  readonly seatNumberOf: (seatId: string) => number;
  /**
   * Whether the subject is the person playing.
   *
   * Contract: True for the human seat.
   * When to use: The heading reads `How they see you`.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly subjectIsViewer: boolean;
}

/**
 * The SVG namespace.
 *
 * Purpose: `createElementNS` needs it for every graph element.
 * When to use: `svgElement`.
 * Expected outcome: The SVG namespace URI.
 * Exceptions: None.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The graph's drawing size.
 *
 * Purpose: A fixed viewBox lets the graph scale to its card.
 * When to use: Placing nodes.
 * Expected outcome: A 240 by 200 box with the subject at its center.
 * Exceptions: None.
 */
const GRAPH_BOX = { width: 240, height: 200 } as const;

/**
 * The distance from the subject to each reporter, in graph units.
 *
 * Purpose: Keeps the nodes inside the box with room for their labels.
 * When to use: `spokePositions`.
 * Expected outcome: 58.
 * Exceptions: None.
 */
const SPOKE_RADIUS = 58;

/**
 * The longest name drawn beside a node before it ends in an ellipsis.
 *
 * Purpose: Four stacks share one row, so labels must stay short. The node's tooltip has the full name.
 * When to use: `shortLabel`.
 * Expected outcome: 12 characters.
 * Exceptions: None.
 */
const NODE_LABEL_MAX_CHARS = 12;

/**
 * The color of a line or pill for a commander that has not reported.
 *
 * Purpose: A missing report reads as gray, not as any stance.
 * When to use: `stanceColor`.
 * Expected outcome: The neutral stance variable.
 * Exceptions: None.
 */
const NO_REPORT_COLOR = 'var(--stance-neutral)';

/**
 * Builds one SVG element with attributes.
 *
 * Purpose: Every graph element is made with `createElementNS`.
 * When to use: Drawing the spoke graph.
 * Expected outcome: A new element with each attribute set.
 * Exceptions: None.
 */
function svgElement(tag: string, attributes: Readonly<Record<string, string | number>>): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

/**
 * Shortens a name for a graph label.
 *
 * Purpose: Long names would overlap their neighbors.
 * When to use: A spoke node's label.
 * Expected outcome: The name, or its start and an ellipsis.
 * Exceptions: None.
 */
function shortLabel(name: string): string {
  return name.length <= NODE_LABEL_MAX_CHARS ? name : `${name.slice(0, NODE_LABEL_MAX_CHARS - 1)}…`;
}

/**
 * Names a stance color variable.
 *
 * Purpose: A row without a report uses the neutral color.
 * When to use: Lines, pills, and cells.
 * Expected outcome: A `var(--stance-…)` string.
 * Exceptions: None.
 */
function stanceColor(row: RelationshipRow): string {
  const stance = row.age === 'none' ? null : row.stance;
  return stance === null ? NO_REPORT_COLOR : `var(--stance-${stance})`;
}

/**
 * Writes the sentence a node's tooltip and a row's title carry.
 *
 * Purpose: Color and dashes are never the only signal.
 * When to use: Each spoke node's `<title>`.
 * Expected outcome: `{reporter}: {stance}, trust {n}, threat {n}, reported turn {t}`, or `{reporter}: no report yet`.
 * Exceptions: None.
 */
function nodeSentence(name: string, row: RelationshipRow): string {
  if (row.stance === null || row.age === 'none') return `${name}: no report yet`;
  return `${name}: ${row.stance}, trust ${row.trust ?? '–'}, threat ${row.threat ?? '–'}, reported turn ${row.reportedTurn ?? '–'}`;
}

/**
 * Draws the spoke graph: the subject in the center and one line and node per reporter.
 *
 * Purpose: Line color is the stance, width is trust, and dashes mark a report that is old or missing.
 * When to use: Inside a stack, when there is at least one row.
 * Expected outcome: An SVG with a `<title>` on each node.
 * Exceptions: None.
 */
function buildSpokeGraph(args: RelationshipStackArgs): SVGElement {
  const centerX = GRAPH_BOX.width / 2;
  const centerY = 100;
  const svg = svgElement('svg', {
    viewBox: `0 0 ${GRAPH_BOX.width} ${GRAPH_BOX.height}`,
    class: 'charts-spoke-graph',
    role: 'img',
    'aria-label': `How the commanders see ${args.nameOf(args.subjectSeatId)}`,
  });
  const positions = spokePositions(args.rows.length, SPOKE_RADIUS);
  args.rows.forEach((row, index) => {
    const point = { x: centerX + positions[index].x, y: centerY + positions[index].y };
    const dashed = row.age !== 'fresh';
    const line = svgElement('line', {
      x1: point.x,
      y1: point.y,
      x2: centerX,
      y2: centerY,
      'stroke-width': row.trust === null ? 1 : 1 + 1.5 * row.trust,
      'stroke-dasharray': dashed ? '4 3' : '0',
    });
    line.style.stroke = stanceColor(row);
    svg.appendChild(line);
  });
  const hub = svgElement('circle', { cx: centerX, cy: centerY, r: 15, class: 'charts-spoke-hub' });
  hub.style.fill = `var(--seat-${args.seatNumberOf(args.subjectSeatId)}-bar)`;
  svg.append(hub, spokeDigit(centerX, centerY, args.seatNumberOf(args.subjectSeatId)));
  args.rows.forEach((row, index) => {
    const point = { x: centerX + positions[index].x, y: centerY + positions[index].y };
    svg.appendChild(buildSpokeNode(args, row, point));
  });
  return svg;
}

/**
 * Draws a side's number inside a node.
 *
 * Purpose: Matches the numbered flags used elsewhere.
 * When to use: The hub and each reporter node.
 * Expected outcome: A centered white digit.
 * Exceptions: None.
 */
function spokeDigit(x: number, y: number, number: number): SVGElement {
  const digit = svgElement('text', { x, y: y + 4, 'text-anchor': 'middle', class: 'charts-spoke-digit' });
  digit.textContent = String(number);
  return digit;
}

/**
 * Draws one reporter's node: a circle, its digit, its name, and a tooltip.
 *
 * Purpose: A reporter with no report has a dashed outline and the text `no report`.
 * When to use: `buildSpokeGraph`, once per row.
 * Expected outcome: An SVG group with a `<title>`.
 * Exceptions: None.
 */
function buildSpokeNode(args: RelationshipStackArgs, row: RelationshipRow, point: { x: number; y: number }): SVGElement {
  const name = args.nameOf(row.reporterSeatId);
  const group = svgElement('g', { class: 'charts-spoke-node' });
  const title = svgElement('title', {});
  title.textContent = nodeSentence(name, row);
  const circle = svgElement('circle', {
    cx: point.x,
    cy: point.y,
    r: 13,
    class: row.age === 'none' ? 'charts-spoke-circle charts-spoke-circle-missing' : 'charts-spoke-circle',
  });
  circle.style.fill = `var(--seat-${args.seatNumberOf(row.reporterSeatId)}-bar)`;
  const label = svgElement('text', { x: point.x, y: point.y + 26, 'text-anchor': 'middle', class: 'charts-spoke-label' });
  label.textContent = shortLabel(name);
  group.append(title, circle, spokeDigit(point.x, point.y, args.seatNumberOf(row.reporterSeatId)), label);
  if (row.age === 'none') {
    const missing = svgElement('text', { x: point.x, y: point.y + 37, 'text-anchor': 'middle', class: 'charts-spoke-missing' });
    missing.textContent = 'no report';
    group.appendChild(missing);
  }
  return group;
}

/**
 * Draws a bar of steps for a trust or threat score.
 *
 * Purpose: The row card shows a score as a bar and a number, with a dashed empty bar for null.
 * When to use: The Trust and Threat columns.
 * Expected outcome: A cell with `RELATIONSHIP_SCALE_MAX + 1` steps and the number beside them, or `–`.
 * Exceptions: None.
 */
function scoreCell(score: number | null): HTMLTableCellElement {
  const cell = document.createElement('td');
  const bar = document.createElement('span');
  bar.className = score === null ? 'charts-score-bar charts-score-bar-empty' : 'charts-score-bar';
  for (let step = 0; step <= RELATIONSHIP_SCALE_MAX; step += 1) {
    const part = document.createElement('span');
    part.className = score !== null && step <= score ? 'charts-score-step charts-score-step-on' : 'charts-score-step';
    bar.appendChild(part);
  }
  const number = document.createElement('span');
  number.className = 'charts-score-number';
  number.textContent = score === null ? '–' : String(score);
  cell.append(bar, number);
  return cell;
}

/**
 * Builds a table cell holding text.
 *
 * Purpose: Most cells of the row card are plain text.
 * When to use: The Taken and As of columns.
 * Expected outcome: A `td` with `textContent` set.
 * Exceptions: None.
 */
function textCell(text: string): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.textContent = text;
  return cell;
}

/**
 * Builds the stance pill.
 *
 * Purpose: The stance word sits on a pill in the stance's color, so the color is never the only signal.
 * When to use: The Stance column.
 * Expected outcome: A cell with the stance word, or `no report`.
 * Exceptions: None.
 */
function stanceCell(row: RelationshipRow): HTMLTableCellElement {
  const cell = document.createElement('td');
  const pill = document.createElement('span');
  pill.className = 'charts-stance-pill';
  pill.style.background = stanceColor(row);
  pill.textContent = row.age === 'none' || row.stance === null ? 'no report' : row.stance;
  cell.appendChild(pill);
  return cell;
}

/**
 * Builds the row card: Side, Stance, Trust, Threat, Taken, and As of.
 *
 * Purpose: States every figure the spoke graph encodes, as words and numbers.
 * When to use: Inside a stack, when there is at least one row.
 * Expected outcome: A table with one body row per reporter.
 * Exceptions: None.
 */
function buildRowCard(args: RelationshipStackArgs): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'charts-row-card';
  const head = document.createElement('tr');
  for (const heading of ['Side', 'Stance', 'Trust', 'Threat', 'Taken', 'As of']) {
    const cell = document.createElement('th');
    cell.textContent = heading;
    head.appendChild(cell);
  }
  table.appendChild(head);
  for (const row of args.rows) {
    const line = document.createElement('tr');
    const side = document.createElement('td');
    side.className = 'charts-row-side';
    const flag = args.flagOf(row.reporterSeatId);
    const name = document.createElement('span');
    name.className = 'charts-row-side-name';
    name.textContent = args.nameOf(row.reporterSeatId);
    side.append(...(flag === null ? [name] : [flag, name]));
    const asOf =
      row.reportedTurn === null ? '–' : `turn ${row.reportedTurn}${row.age === 'old' ? ' (old)' : ''}`;
    const taken = row.hexesTaken === null ? '–' : `${row.hexesTaken} hexes`;
    const takenCell = textCell(taken);
    takenCell.title = `Hexes taken from this side in the last ${HEXES_TAKEN_WINDOW_TURNS} turns`;
    line.append(side, stanceCell(row), scoreCell(row.trust), scoreCell(row.threat), takenCell, textCell(asOf));
    table.appendChild(line);
  }
  return table;
}

/**
 * Builds one relationship stack.
 *
 * Purpose: One card per side shows how the AI commanders regard it.
 * When to use: The charts dialog, once per side that at least one commander reports on.
 * Expected outcome: A heading, then the spoke graph and the row card, or one sentence when no AI commander reports on the side.
 * Exceptions: None.
 */
export function buildRelationshipStack(args: RelationshipStackArgs): HTMLElement {
  const card = document.createElement('section');
  card.className = 'charts-stack';
  const heading = document.createElement('h4');
  heading.className = 'charts-stack-heading';
  if (args.subjectIsViewer) {
    heading.textContent = 'How they see you';
  } else {
    const flag = args.flagOf(args.subjectSeatId);
    const name = document.createElement('span');
    name.textContent = args.nameOf(args.subjectSeatId);
    heading.append('How they see ', ...(flag === null ? [name] : [flag, name]));
  }
  card.appendChild(heading);
  if (args.rows.length === 0) {
    const none = document.createElement('p');
    none.className = 'charts-empty';
    none.textContent = 'No AI commander reports on this side.';
    card.appendChild(none);
    return card;
  }
  card.append(buildSpokeGraph(args), buildRowCard(args));
  return card;
}
