/**
 * Shared HTML assembly for melee-intercept modal rows so res1 hex previews match map tooltip content.
 */

import type { HexNamingCaption } from '../../shared/hexNamingCaption';
import type { NamingLookupTarget, TerrainTooltipState } from '../map/terrainTooltipTypes';

/**
 * Naming and terrain tooltip helpers required to render a res1 hex cell like the hover tooltip.
 *
 * Contract: Callers supply renderer-owned caching and state readers; this module performs no IPC.
 * When to use: Wiring `ReadyHandlerDeps.buildMeleeInterceptHexPopupHtml` from the renderer bootstrap.
 * Expected outcome: Async HTML string suitable for table cells in the intercept modal.
 * Exceptions: None; naming lookup failures still yield terrain-only bodies via `getCachedTerrainTooltipHtml`.
 */
export type MeleeInterceptRes1HexTooltipDeps = {
  getCachedNamingLineForTarget: (target: NamingLookupTarget | null) => Promise<HexNamingCaption | null>;
  terrainTooltipStateForRes1Hex: (h3Index: string) => TerrainTooltipState;
  getCachedTerrainTooltipHtml: (
    state: TerrainTooltipState,
    namingCaption: HexNamingCaption | null,
    namingTarget: NamingLookupTarget | null
  ) => string;
};

/**
 * Builds tooltip-equivalent HTML for a res1 hex for melee intercept modal rows (naming + terrain block).
 *
 * Contract: Mirrors strategic hex tooltip assembly without duplicating template strings in `renderer.ts`.
 * When to use: Passed into `ReadyHandlerDeps.buildMeleeInterceptHexPopupHtml` via a thin renderer wrapper.
 * Expected outcome: HTML matches hover tooltip content for the same res1 cell at the same game state.
 * Exceptions: None; failures in naming lookup degrade to terrain-only presentation per helper contracts.
 */
export async function buildMeleeInterceptHexPopupHtmlForRes1(
  h3Index: string,
  deps: MeleeInterceptRes1HexTooltipDeps
): Promise<string> {
  const namingTarget: NamingLookupTarget = { h3Index, resolution: 1 };
  const namingCaption = await deps.getCachedNamingLineForTarget(namingTarget);
  const state = deps.terrainTooltipStateForRes1Hex(h3Index);
  return deps.getCachedTerrainTooltipHtml(state, namingCaption, namingTarget);
}
