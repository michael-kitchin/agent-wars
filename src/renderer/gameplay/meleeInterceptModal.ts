/**
 * Modal UI for choosing a melee intercept hex (Fight) or resolving stock melee (Ignore).
 */

import type { MeleeCandidateRow } from '../../shared/ipcTypes';

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

   * Contract: Returns inner HTML equivalent to the hex tooltip for the given res1 hex.
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

   * Contract: Res1 hex id for Fight; omitted for Ignore.
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
 * Expected outcome: Exclusive row selection; Fight disabled until a row is chosen.
 * Exceptions: None; rejects only if the modal cannot attach to `document.body`.
 */
export function openMeleeInterceptModal(args: MeleeInterceptModalOpenArgs): Promise<MeleeInterceptModalOutcome> {
  return new Promise((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Tactical battles');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:8000;background:rgba(0,0,0,0.35);display:flex;align-items:flex-start;justify-content:center;padding:12px;overflow-y:auto;';

    const panel = document.createElement('div');
    panel.style.cssText =
      'max-width:min(520px,92vw);width:100%;max-height:calc(100vh - 28px);display:flex;flex-direction:column;min-height:0;overflow:hidden;background:#f4f2ee;border:1px solid #555;border-radius:4px;padding:10px 12px;font:13px/1.35 system-ui,sans-serif;color:#222;box-shadow:0 4px 18px rgba(0,0,0,0.25);margin:12px auto 24px;';

    const title = document.createElement('div');
    const n = args.candidates.length;
    title.textContent = `Tactical Battles (${n})`;
    title.style.cssText = 'font-weight:600;margin-bottom:8px;flex-shrink:0;';
    panel.appendChild(title);

    const tableScroll = document.createElement('div');
    tableScroll.style.cssText = 'flex:1;min-height:0;overflow-y:auto;overflow-x:auto;margin-bottom:8px;border:1px solid #ccc;border-radius:2px;background:#faf9f7;';

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;';
    const colgroup = document.createElement('colgroup');
    for (const w of ['2.75rem', '50%', '25%', '25%']) {
      const col = document.createElement('col');
      col.style.width = w;
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const label of ['', 'Hex', 'Human', 'AI']) {
      const th = document.createElement('th');
      th.textContent = label;
      th.style.cssText = 'text-align:left;border-bottom:1px solid #aaa;padding:4px 6px;vertical-align:bottom;';
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    tableScroll.appendChild(table);
    panel.appendChild(tableScroll);

    let selectedH3: string | null = null;
    const radios: HTMLInputElement[] = [];

    const fightBtn = document.createElement('button');
    fightBtn.type = 'button';
    fightBtn.textContent = 'Fight';
    fightBtn.disabled = true;
    fightBtn.style.cssText = 'margin-right:8px;padding:4px 14px;';

    const ignoreBtn = document.createElement('button');
    ignoreBtn.type = 'button';
    ignoreBtn.textContent = 'Ignore';
    ignoreBtn.style.cssText = 'padding:4px 14px;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'margin-top:4px;display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-shrink:0;';
    btnRow.appendChild(fightBtn);
    btnRow.appendChild(ignoreBtn);
    panel.appendChild(btnRow);

    overlay.appendChild(panel);

    const cleanup = (): void => {
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

    for (const row of args.candidates) {
      const tr = document.createElement('tr');
      tr.style.cssText = 'border-bottom:1px solid #ddd;vertical-align:top;';
      const tdRadio = document.createElement('td');
      tdRadio.style.padding = '6px';
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
      tdHex.style.padding = '6px';
      tdHex.style.overflowWrap = 'anywhere';
      tr.appendChild(tdHex);
      void args.buildHexPopupHtml(row.h3Index).then(
        (html) => {
          tdHex.innerHTML = html;
        },
        () => {
          tdHex.textContent = row.h3Index;
        }
      );

      const tdHuman = document.createElement('td');
      tdHuman.style.padding = '6px';
      tdHuman.style.overflowWrap = 'anywhere';
      tdHuman.textContent = row.humanUnitSummary || '—';
      tr.appendChild(tdHuman);

      const tdAi = document.createElement('td');
      tdAi.style.padding = '6px';
      tdAi.style.overflowWrap = 'anywhere';
      tdAi.textContent = row.aiUnitSummary || '—';
      tr.appendChild(tdAi);

      tbody.appendChild(tr);
    }

    window.addEventListener('keydown', onKey);

    if (!document.body) {
      reject(new Error('document.body missing'));
      return;
    }
    document.body.appendChild(overlay);
    radios[0]?.focus();
  });
}
