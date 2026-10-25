/**
 * Modal UI for choosing a melee intercept hex (Fight) or resolving stock melee (Ignore).
 */

import type { MeleeCandidateRow } from '../../shared/ipcTypes';
import { getStrategicHexCode } from '../../shared/hexLlmCodeAssignment';
import { paletteForOwner } from '../../shared/seatPalette';
import { HUMAN_SEAT_ID, isNeutralOwnerId } from '../../shared/seatIds';
import { shortSideName } from '../../shared/seatRoster';
import { fightTooltipText, ignoreTooltipText } from '../chrome/controlTooltipText';
import { rendererSharedState as S } from '../core/state';
import { attachFrameToVisibleMap } from '../map/visibleMapFrame';
import { paintTerrainSwatches } from '../rendering/terrainVisualStyles';

/**
 * Arguments for opening the melee intercept modal.
 *
 * Purpose: Bundles row data and a formatter so terrain HTML matches the strategic hex tooltip.
 * When to use: Passed from `readyHandler` when `awaitingMeleeDecision` is returned from ready.
 * Expected outcome: User picks Fight+row or Ignore; backdrop/Escape map to Ignore.
 * Exceptions: None.
 */
export interface MeleeInterceptModalOpenArgs {
    /**
   * Specifies the contract for the `candidates` member (candidates: MeleeCandidateRow[];).

   * Contract: Non-empty list of melee hex rows from main.
   * When to use: Populate the table body.
   * Expected outcome: Same order as received from IPC.
   * Exceptions: None.
   */
candidates: MeleeCandidateRow[];
    /**
   * Specifies the contract for the `buildHexPopupHtml` member (buildHexPopupHtml: (h3Index: string) => Promise<string>;).

   * Contract: Returns inner HTML equivalent to the hex tooltip for the given strategic hex.
   * When to use: Per-row terrain/features column.
   * Expected outcome: Safe HTML for insertion into a table cell (already escaped by formatter).
   * Exceptions: IPC failures may yield a short fallback string without throwing.
   */
buildHexPopupHtml: (h3Index: string) => Promise<string>;
}

/**
 * Outcome of the melee intercept modal (Fight requires a selected row).
 *
 * Purpose: Drives `resolveMeleeIntercept` payload construction.
 * When to use: After the modal promise resolves.
 * Expected outcome: `selectedH3Index` set only for Fight.
 * Exceptions: None.
 */
export interface MeleeInterceptModalOutcome {
    /**
   * Specifies the contract for the `decision` member (decision: 'fight' | 'ignore';).

   * Contract: Fight skips melee in the chosen hex for this turn; Ignore runs full melee.
   * When to use: IPC resolve body.
   * Expected outcome: Matches user intent.
   * Exceptions: None.
   */
decision: 'fight' | 'ignore';
    /**
   * Specifies the contract for the `selectedH3Index` member (selectedH3Index?: string;).

   * Contract: Strategic hex id for Fight; omitted for Ignore.
   * When to use: Fight path only.
   * Expected outcome: One of the candidate hex ids.
   * Exceptions: None.
   */
selectedH3Index?: string;
}

/**
 * Presents the melee intercept dialog and resolves when the user commits Fight or Ignore.
 *
 * Purpose: Isolates DOM construction from `readyHandler` to keep that module readable.
 * When to use: After strategic movement is applied and main reports melee candidates.
 * Expected outcome: Exclusive row selection; Fight disabled until a row is chosen. The panel uses the shared navy chrome classes.
 *   The dimmed backdrop covers the window, while the panel is centered on the visible map and follows it on resize.
 * Exceptions: None; rejects only if the modal cannot attach to `document.body`.
 */
export function openMeleeInterceptModal(args: MeleeInterceptModalOpenArgs): Promise<MeleeInterceptModalOutcome> {
  return new Promise((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Tactical battles');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:8000;background:rgba(0,0,0,0.35);';

    const frame = document.createElement('div');
    frame.className = 'melee-intercept-frame';

    const panel = document.createElement('div');
    panel.className = 'melee-intercept-panel';

    const eligible = args.candidates.filter((row) => row.tacticalEligible);
    const worldMapRows = args.candidates.filter((row) => !row.tacticalEligible);
    const title = document.createElement('div');
    title.textContent = `Tactical Battles (${eligible.length})`;
    title.style.cssText = 'font-weight:600;margin-bottom:8px;flex-shrink:0;';
    panel.appendChild(title);
    const intro = document.createElement('p');
    intro.className = 'melee-intercept-intro';
    intro.textContent = 'Choose one battle to fight. The others resolve on the world map.';
    panel.appendChild(intro);

    const tableScroll = document.createElement('div');
    tableScroll.className = 'melee-intercept-scroll';

    const table = document.createElement('table');
    table.className = 'melee-intercept-table';
    const colgroup = document.createElement('colgroup');
    // An empty width leaves the Hex column unsized, so `table-layout: fixed` gives it all remaining width.
    // Percentages keep the summaries narrow on a small map; fixed tables ignore `min()` on columns.
    for (const w of ['2.75rem', '', '20%', '20%']) {
      const col = document.createElement('col');
      col.style.width = w;
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const label of ['', 'Hex', 'Yours', 'Enemy']) {
      const th = document.createElement('th');
      th.textContent = label;
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    tableScroll.appendChild(table);
    panel.appendChild(tableScroll);
    if (worldMapRows.length > 0) panel.appendChild(worldMapSection(worldMapRows));

    let selectedH3: string | null = null;
    const radios: HTMLInputElement[] = [];

    const fightBtn = document.createElement('button');
    fightBtn.type = 'button';
    fightBtn.textContent = 'Fight';
    fightBtn.disabled = true;
    fightBtn.style.cssText = 'margin-right:8px;padding:4px 14px;';
    const fightHost = document.createElement('span');
    fightHost.className = 'control-tooltip-host';
    fightHost.setAttribute('data-control-tooltip', fightTooltipText);
    fightHost.appendChild(fightBtn);

    const ignoreBtn = document.createElement('button');
    ignoreBtn.type = 'button';
    ignoreBtn.textContent = 'Ignore';
    ignoreBtn.setAttribute('data-control-tooltip', ignoreTooltipText);
    ignoreBtn.style.cssText = 'padding:4px 14px;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'margin-top:4px;display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-shrink:0;';
    btnRow.appendChild(fightHost);
    btnRow.appendChild(ignoreBtn);
    panel.appendChild(btnRow);

    frame.appendChild(panel);
    overlay.appendChild(frame);

    let detachFrame: (() => void) | null = null;
    const cleanup = (): void => {
      detachFrame?.();
      detachFrame = null;
      overlay.remove();
      window.removeEventListener('keydown', onKey);
    };

    const finishIgnore = (): void => {
      cleanup();
      resolve({ decision: 'ignore' });
    };

    const finishFight = (): void => {
      if (!selectedH3) return;
      cleanup();
      resolve({ decision: 'fight', selectedH3Index: selectedH3 });
    };

    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finishIgnore();
      }
    };

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) finishIgnore();
    });

    fightBtn.addEventListener('click', () => finishFight());
    ignoreBtn.addEventListener('click', () => finishIgnore());

    for (const row of eligible) {
      const tr = document.createElement('tr');
      const tdRadio = document.createElement('td');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'melee-intercept-hex';
      radio.value = row.h3Index;
      radio.addEventListener('change', () => {
        selectedH3 = row.h3Index;
        fightBtn.disabled = false;
      });
      radios.push(radio);
      tdRadio.appendChild(radio);
      tr.appendChild(tdRadio);

      const tdHex = document.createElement('td');
      const hexCode = getStrategicHexCode(row.h3Index);
      tdHex.textContent = hexCode ? `(${hexCode})` : row.h3Index;
      void args.buildHexPopupHtml(row.h3Index).then(
        (html) => {
          if (!tdHex.isConnected) return;
          tdHex.replaceChildren();
          tdHex.innerHTML = html;
          paintTerrainSwatches(tdHex);
        },
        () => {
          /* keep the plain code already shown */
        }
      );
      tr.appendChild(tdHex);

      const human = row.parties.find((party) => party.ownerId === HUMAN_SEAT_ID);
      const enemy = row.parties.find((party) => party.ownerId !== HUMAN_SEAT_ID);
      const tdHuman = document.createElement('td');
      tdHuman.textContent = human?.unitSummary || '—';
      tr.appendChild(tdHuman);

      const tdAi = document.createElement('td');
      tdAi.append(enemy ? enemyCell(enemy.ownerId, enemy.unitSummary) : document.createTextNode('—'));
      tr.appendChild(tdAi);

      tbody.appendChild(tr);
    }

    window.addEventListener('keydown', onKey);

    if (!document.body) {
      reject(new Error('document.body missing'));
      return;
    }
    document.body.appendChild(overlay);
    detachFrame = attachFrameToVisibleMap(frame);
    radios[0]?.focus();
  });
}

/**
 * The enemy's dot, short name, and unit summary.
 *
 * Purpose: The Enemy cell names one other party.
 * When to use: An eligible row.
 * Expected outcome: Neutral reads "Neutral" and the summary ends ", defends in place".
 * Exceptions: None.
 */
function enemyCell(ownerId: string, unitSummary: string): HTMLElement {
  const wrap = document.createElement('div');
  const line = document.createElement('div');
  line.className = 'melee-party-line';
  line.append(ownerDot(ownerId), document.createTextNode(partyName(ownerId)));
  const summary = document.createElement('div');
  summary.className = 'melee-intercept-muted';
  const garrison = isNeutralOwnerId(ownerId);
  summary.textContent = garrison ? `${unitSummary}, defends in place` : unitSummary;
  wrap.append(line, summary);
  return wrap;
}

/**
 * The world-map section under the choice rows.
 *
 * Purpose: Contested hexes that cannot be fought still get named.
 * When to use: When any row is not eligible.
 * Expected outcome: A heading and one line per hex, with dots. A human plus two others reads "Three sides: you, …". Two other sides read "{A} vs {B}".
 * Exceptions: None.
 */
function worldMapSection(rows: readonly MeleeCandidateRow[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'melee-world-section';
  const heading = document.createElement('h3');
  heading.textContent = 'Resolve on the world map this turn';
  section.append(heading);
  for (const row of rows) {
    const line = document.createElement('div');
    line.className = 'melee-world-row';
    const hex = document.createElement('span');
    const code = getStrategicHexCode(row.h3Index);
    hex.textContent = code ? `(${code})` : row.h3Index;
    line.append(hex, document.createTextNode(' '), worldMapParties(row));
    section.append(line);
  }
  return section;
}

/**
 * The party phrase for a world-map hex.
 *
 * Purpose: The player sees who meets there without a choice control.
 * When to use: `worldMapSection`.
 * Expected outcome: "Three sides: you, {A}, {B}" when the human seat is one of three. Otherwise "{A} vs {B}".
 * Exceptions: None.
 */
function worldMapParties(row: MeleeCandidateRow): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'melee-party-line';
  const human = row.parties.some((party) => party.ownerId === HUMAN_SEAT_ID);
  if (human && row.parties.length >= 3) {
    wrap.append(document.createTextNode('Three sides: you'));
    for (const party of row.parties.filter((item) => item.ownerId !== HUMAN_SEAT_ID)) {
      wrap.append(document.createTextNode(', '), ownerDot(party.ownerId), document.createTextNode(partyName(party.ownerId)));
    }
    return wrap;
  }
  row.parties.forEach((party, index) => {
    if (index > 0) wrap.append(document.createTextNode(' vs '));
    wrap.append(ownerDot(party.ownerId), document.createTextNode(partyName(party.ownerId)));
  });
  return wrap;
}

/**
 * A short name for a party.
 *
 * Purpose: The dialog uses the same short names as the top bar.
 * When to use: Enemy cells and world-map lines.
 * Expected outcome: "Neutral", or the seat's short home name.
 * Exceptions: None. An unknown id is shown as itself.
 */
function partyName(ownerId: string): string {
  if (isNeutralOwnerId(ownerId)) return 'Neutral';
  const seat = S.gameState?.seats?.find((row) => row.seatId === ownerId);
  return seat ? shortSideName(seat.homeRegion) : ownerId;
}

/**
 * A color dot for one owner.
 *
 * Purpose: The dialog uses the seat palette.
 * When to use: Beside a party name.
 * Expected outcome: An 8px dot in that owner's map color.
 * Exceptions: None.
 */
function ownerDot(ownerId: string): HTMLElement {
  const dot = document.createElement('span');
  dot.className = 'melee-party-dot';
  dot.style.background = paletteForOwner(ownerId, S.gameState?.seats ?? [])?.map ?? '#9D174D';
  return dot;
}
