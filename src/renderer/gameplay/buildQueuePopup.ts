import type { BuildUnitType, HexBuildQueueSnapshot } from '../../shared/ipcTypes';
import { TOOLTIP_OFFSET_PX, UNIT_SELECT_GLYPH } from '../core/constants';
import { rendererSharedState as S } from '../core/state';

/**
 * Defines the `sanitizeBuildCountInputText` function shape (export function sanitizeBuildCountInputText(raw: string): string).

 * Purpose: Supports maintainability by documenting why `sanitizeBuildCountInputText` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function sanitizeBuildCountInputText(raw: string): string {
  const digitsOnly = raw.replaceAll(/\D/g, '').slice(0, 2);
  if (digitsOnly.length === 0) return '1';
  const parsed = parseInt(digitsOnly, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return '1';
  if (parsed > 99) return '99';
  return String(parsed);
}

/**
 * Defines the `isBuildQueueSelectInPopupFocused` function shape (export function isBuildQueueSelectInPopupFocused(): boolean).

 * Purpose: Supports maintainability by documenting why `isBuildQueueSelectInPopupFocused` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isBuildQueueSelectInPopupFocused(): boolean {
  const popup = document.getElementById('build-popup');
  const active = document.activeElement;
  return !!popup && active instanceof HTMLSelectElement && popup.contains(active);
}

/**
 * Defines the `isBuildPopupOrEntryTarget` function shape (export function isBuildPopupOrEntryTarget(target: EventTarget | null): boolean).

 * Purpose: Supports maintainability by documenting why `isBuildPopupOrEntryTarget` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isBuildPopupOrEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const popup = document.getElementById('build-popup');
  const layer = document.getElementById('build-entry-layer');
  return !!(popup?.contains(target) || layer?.contains(target));
}

/**
 * Documents the `BuildQueuePopupDeps` interface as a named contract surface (interface BuildQueuePopupDeps).

 * Purpose: Supports maintainability by documenting why `BuildQueuePopupDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface BuildQueuePopupDeps {
    /**
   * Specifies the contract for the `shouldRenderRes4Hexes` member (shouldRenderRes4Hexes: () => boolean;).

   * Contract: Describes stable behavior for callers of `shouldRenderRes4Hexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
shouldRenderRes4Hexes: () => boolean;
    /**
   * Specifies the contract for the `hideStackCallout` member (hideStackCallout: () => void;).

   * Contract: Describes stable behavior for callers of `hideStackCallout` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hideStackCallout: () => void;
    /**
   * Specifies the contract for the `clearTerrainTooltipTimer` member (clearTerrainTooltipTimer: () => void;).

   * Contract: Describes stable behavior for callers of `clearTerrainTooltipTimer` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
clearTerrainTooltipTimer: () => void;
    /**
   * Specifies the contract for the `hideTerrainTooltipVisual` member (hideTerrainTooltipVisual: () => void;).

   * Contract: Describes stable behavior for callers of `hideTerrainTooltipVisual` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hideTerrainTooltipVisual: () => void;
    /**
   * Specifies the contract for the `requestRedraw` member (requestRedraw: () => void;).

   * Contract: Describes stable behavior for callers of `requestRedraw` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
requestRedraw: () => void;
    /**
   * Specifies the contract for the `scheduleTerrainTooltipRestoreAfterPopoverClose` member (scheduleTerrainTooltipRestoreAfterPopoverClose: () => void;).

   * Contract: Describes stable behavior for callers of `scheduleTerrainTooltipRestoreAfterPopoverClose` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
scheduleTerrainTooltipRestoreAfterPopoverClose: () => void;
    /**
   * Specifies the contract for the `refreshGameStateAfterBuildQueueChange` member (refreshGameStateAfterBuildQueueChange: () => Promise<void>;).

   * Contract: Describes stable behavior for callers of `refreshGameStateAfterBuildQueueChange` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshGameStateAfterBuildQueueChange: () => Promise<void>;
    /**
   * Specifies the contract for the `showMapToast` member (showMapToast: (message: string, options?: { isError?: boolean }) => void;).

   * Contract: Describes stable behavior for callers of `showMapToast` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
showMapToast: (message: string, options?: { isError?: boolean }) => void;
}

/**
 * Defines the `escapeHtml` function shape (function escapeHtml(text: string): string).

 * Purpose: Supports maintainability by documenting why `escapeHtml` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Defines the `formatGroupedNamingLineHtml` function shape (function formatGroupedNamingLineHtml(namingLine: string): string).

 * Purpose: Supports maintainability by documenting why `formatGroupedNamingLineHtml` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatGroupedNamingLineHtml(namingLine: string): string {
  const groups = namingLine
    .split(';')
    .map((g) => g.trim())
    .filter((g) => g.length > 0);
  if (groups.length === 0) return escapeHtml(namingLine);
  const formattedGroups = groups.map((group) => {
    const colonIdx = group.indexOf(':');
    if (colonIdx < 0) return escapeHtml(group);
    const heading = group.slice(0, colonIdx).trim();
    const remainder = group.slice(colonIdx + 1).trim();
    if (!heading) return escapeHtml(group);
    if (!remainder) return `<strong>${escapeHtml(heading)}:</strong>`;
    return `<strong>${escapeHtml(heading)}:</strong> ${escapeHtml(remainder)}`;
  });
  return formattedGroups.join('; ');
}

/**
 * Defines the `createBuildQueuePopupController` function shape (export function createBuildQueuePopupController(deps: BuildQueuePopupDeps) { async function runBuildQueueMutation(args: { mutate: () => Promise<{ succes).

 * Purpose: Supports maintainability by documenting why `createBuildQueuePopupController` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function createBuildQueuePopupController(deps: BuildQueuePopupDeps) {
  async function runBuildQueueMutation(args: {
    mutate: () => Promise<{ success: boolean; reason?: string }>;
    failureMessage: string;
    refreshState: boolean;
  }): Promise<boolean> {
    try {
      const result = await args.mutate();
      if (!result.success) {
        deps.showMapToast(result.reason ?? args.failureMessage, { isError: true });
        return false;
      }
      if (args.refreshState) await deps.refreshGameStateAfterBuildQueueChange();
      return true;
    } catch (err) {
      console.error('runBuildQueueMutation failed:', err);
      deps.showMapToast(args.failureMessage, { isError: true });
      return false;
    }
  }

  async function renderBuildQueueIntoMount(mount: HTMLElement, h3Index: string): Promise<void> {
    if (!window.gameApi?.getHexBuildQueue) return;
    const requestSeq = ++S.buildPopupRequestSeq;
    let snapshot: HexBuildQueueSnapshot | null = null;
    let namingLine: string | null = null;
    try {
      snapshot = await window.gameApi.getHexBuildQueue({ h3Index });
      if (window.gameApi.getHexNamingTooltipLine) {
        namingLine = await window.gameApi.getHexNamingTooltipLine({ h3Index, resolution: 1 });
      }
    } catch (err) {
      console.error('getHexBuildQueue failed:', err);
    }
    if (requestSeq !== S.buildPopupRequestSeq || !snapshot || S.buildPopupHexH3 !== h3Index) return;

    mount.innerHTML = '';
    const closeRow = document.createElement('div');
    closeRow.className = 'build-popup-close-row';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'unit-select build-close-btn';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => hideBuildPopup());
    closeRow.appendChild(closeBtn);
    mount.appendChild(closeRow);

    const section = document.createElement('div');
    section.className = 'build-queue-section';
    const trimmedNamingLine = namingLine?.trim() ?? '';
    if (trimmedNamingLine.length > 0) {
      const descriptionLine = document.createElement('div');
      descriptionLine.innerHTML = formatGroupedNamingLineHtml(trimmedNamingLine);
      section.appendChild(descriptionLine);
      const descriptionSpacer = document.createElement('div');
      descriptionSpacer.style.height = '0.5em';
      section.appendChild(descriptionSpacer);
    }
    const pointsLine = document.createElement('div');
    pointsLine.innerHTML = `<strong>Production:</strong> ${snapshot.urbanHexCount.toLocaleString()} / turn`;
    section.appendChild(pointsLine);
    const productionSpacer = document.createElement('div');
    productionSpacer.style.height = '0.5em';
    section.appendChild(productionSpacer);

    if (!snapshot.controlledByRequester) {
      mount.appendChild(section);
      return;
    }
    if (!snapshot.buildSectionVisible) {
      const noUrban = document.createElement('div');
      noUrban.className = 'build-no-urban';
      noUrban.textContent = snapshot.noBuildReason ?? 'This hex cannot build units.';
      section.appendChild(noUrban);
      mount.appendChild(section);
      return;
    }

    const head = document.createElement('div');
    head.className = 'build-queue-head';
    const title = document.createElement('span');
    title.className = 'build-queue-title';
    title.textContent = 'Build Queue';
    const buildBtn = document.createElement('button');
    buildBtn.type = 'button';
    buildBtn.className = 'unit-select stack-unit-toggle';
    buildBtn.textContent = UNIT_SELECT_GLYPH;
    buildBtn.addEventListener('click', async () => {
      if (!window.gameApi?.addHexBuildQueueEntry) return;
      const success = await runBuildQueueMutation({
        mutate: () => window.gameApi!.addHexBuildQueueEntry({ h3Index }),
        failureMessage: 'Failed to add build queue entry.',
        refreshState: true,
      });
      if (!success) return;
      const body = document.getElementById('build-popup-body');
      if (body) void renderBuildQueueIntoMount(body, h3Index);
    });
    head.appendChild(title);
    head.appendChild(buildBtn);
    section.appendChild(head);

    const list = document.createElement('div');
    list.className = 'build-queue-list';
    const options = snapshot.availableUnitTypes;
    for (const entry of snapshot.entries) {
      const row = document.createElement('div');
      row.className = 'build-queue-row';
      const typeSelect = document.createElement('select');
      for (const unitType of options) {
        const opt = document.createElement('option');
        opt.value = unitType;
        opt.textContent = unitType.charAt(0).toUpperCase() + unitType.slice(1);
        typeSelect.appendChild(opt);
      }
      typeSelect.value = entry.unitType;
      const countInput = document.createElement('input');
      countInput.type = 'text';
      countInput.className = 'build-count-input';
      countInput.maxLength = 2;
      countInput.inputMode = 'numeric';
      countInput.value = String(entry.count);
      const readCurrentCount = (): number => {
        const raw = sanitizeBuildCountInputText(countInput.value);
        if (countInput.value !== raw) countInput.value = raw;
        return parseInt(raw, 10);
      };
      typeSelect.addEventListener('change', async () => {
        if (!window.gameApi?.updateHexBuildQueueEntry) return;
        await runBuildQueueMutation({
          mutate: () =>
            window.gameApi!.updateHexBuildQueueEntry({
              h3Index,
              entryId: entry.id,
              unitType: typeSelect.value as BuildUnitType,
              count: readCurrentCount(),
            }),
          failureMessage: 'Failed to update build queue entry.',
          refreshState: true,
        });
        void renderBuildQueueIntoMount(mount, h3Index);
      });
      row.appendChild(typeSelect);

      countInput.addEventListener('keydown', (event) => {
        const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab'];
        if (allowed.includes(event.key)) return;
        if (/^\d$/.test(event.key)) return;
        event.preventDefault();
      });
      countInput.addEventListener('input', async () => {
        if (!window.gameApi?.updateHexBuildQueueEntry) return;
        const count = readCurrentCount();
        await runBuildQueueMutation({
          mutate: () =>
            window.gameApi!.updateHexBuildQueueEntry({
              h3Index,
              entryId: entry.id,
              unitType: typeSelect.value as BuildUnitType,
              count,
            }),
          failureMessage: 'Failed to update build count.',
          refreshState: true,
        });
      });
      row.appendChild(countInput);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'unit-select';
      removeBtn.textContent = 'x';
      removeBtn.addEventListener('click', async () => {
        if (!window.gameApi?.removeHexBuildQueueEntry) return;
        await runBuildQueueMutation({
          mutate: () => window.gameApi!.removeHexBuildQueueEntry({ h3Index, entryId: entry.id }),
          failureMessage: 'Failed to remove build queue entry.',
          refreshState: true,
        });
        void renderBuildQueueIntoMount(mount, h3Index);
      });
      row.appendChild(removeBtn);
      list.appendChild(row);
    }
    section.appendChild(list);
    mount.appendChild(section);
  }

  function hideBuildPopup(): void {
    S.buildPopupHexH3 = null;
    S.buildPopupRequestSeq++;
    const el = document.getElementById('build-popup');
    const body = document.getElementById('build-popup-body');
    if (el) {
      el.classList.add('hidden');
      el.removeAttribute('data-open');
      el.removeAttribute('data-x');
      el.removeAttribute('data-y');
      el.setAttribute('aria-hidden', 'true');
    }
    if (body) body.innerHTML = '';
    deps.requestRedraw();
    deps.scheduleTerrainTooltipRestoreAfterPopoverClose();
  }

  function showBuildPopup(h3Index: string, clientX: number, clientY: number): void {
    if (deps.shouldRenderRes4Hexes()) return;
    deps.hideStackCallout();
    deps.clearTerrainTooltipTimer();
    deps.hideTerrainTooltipVisual();
    const el = document.getElementById('build-popup');
    const body = document.getElementById('build-popup-body');
    if (!el || !body) return;
    S.buildPopupHexH3 = h3Index;
    el.setAttribute('data-open', 'true');
    el.setAttribute('data-x', String(clientX));
    el.setAttribute('data-y', String(clientY));
    el.style.left = `${clientX + TOOLTIP_OFFSET_PX}px`;
    el.style.top = `${clientY + TOOLTIP_OFFSET_PX}px`;
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
    void renderBuildQueueIntoMount(body, h3Index);
    deps.requestRedraw();
  }

  function refreshBuildPopupIfOpen(): void {
    if (deps.shouldRenderRes4Hexes()) {
      hideBuildPopup();
      return;
    }
    const el = document.getElementById('build-popup');
    const body = document.getElementById('build-popup-body');
    if (!el || el.classList.contains('hidden') || !S.buildPopupHexH3 || !body) return;
    void renderBuildQueueIntoMount(body, S.buildPopupHexH3);
  }

  return { hideBuildPopup, showBuildPopup, refreshBuildPopupIfOpen };
}
