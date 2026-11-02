/**
 * Terrain, seaport, and control facts for embarking at one strategic hex.
 *
 * Purpose: Strategic sealift and tactical embark validation ask the same three questions.
 * When to use: Before deciding whether a player may embark at a hex.
 * Expected outcome: One read, or null when the hex is not in `hexes`.
 * Exceptions: Propagates SQLite errors. This module must stay free of `sealift` imports so tactical validation can use it without a cycle.
 */

import { dbGetOne } from './gameDb';
import { logTrace } from './logger';

/**
 * What embark eligibility needs from one strategic hex.
 *
 * Purpose: Callers apply their own embark rule to these facts.
 * When to use: The return of `readHexEmbarkFacts`.
 * Expected outcome: Present only when the hex row exists.
 * Exceptions: None.
 */
export interface HexEmbarkFacts {
  /**
   * Terrain stored on the hex, before movement normalization.
   *
   * Contract: The `hexes.terrain` value.
   * When to use: Embark eligibility, together with `terrainKind`.
   * Expected outcome: A non-empty terrain name for a stored hex.
   * Exceptions: None.
   */
  readonly nativeTerrain: string;
  /**
   * Pipeline terrain kind, when the hex has one.
   *
   * Contract: `coastal` marks native coastal embark terrain. Missing becomes undefined.
   * When to use: With `nativeTerrain`.
   * Expected outcome: The stored kind, or undefined.
   * Exceptions: None.
   */
  readonly terrainKind: string | undefined;
  /**
   * Seaports on the hex.
   *
   * Contract: Zero when the infrastructure row is missing.
   * When to use: A positive count is a seaport.
   * Expected outcome: A non-negative count.
   * Exceptions: None.
   */
  readonly seaportCount: number;
  /**
   * The player who controls the hex, or null when nobody does.
   *
   * Contract: Null when the control row is missing.
   * When to use: A seaport embark requires this to be the acting player.
   * Expected outcome: A player id or null.
   * Exceptions: None.
   */
  readonly controllerPlayerId: string | null;
}

/**
 * Reads embark facts for one strategic hex.
 *
 * Purpose: One place runs the terrain, seaport, and control queries.
 * When to use: `getHexEmbarkContext` and tactical embark validation.
 * Expected outcome: Null when `hexes` has no row. Otherwise the three facts, with a missing seaport or control row treated as none.
 * Exceptions: Propagates SQLite errors.
 */
export function readHexEmbarkFacts(h3Index: string): HexEmbarkFacts | null {
  const terrainRow = dbGetOne<{ terrain: string; terrainKind: string | null }>(
    'SELECT terrain, terrain_kind AS terrainKind FROM hexes WHERE h3_index = ?',
    [h3Index]
  );
  const found = terrainRow !== undefined;
  logTrace('readHexEmbarkFacts', { h3Index, found });
  if (!terrainRow) return null;
  const infra = dbGetOne<{ seaportCount: number }>(
    'SELECT seaport_count AS seaportCount FROM res_s_infrastructure WHERE h3_index = ?',
    [h3Index]
  );
  const control = dbGetOne<{ controllerPlayerId: string | null }>(
    'SELECT controller_player_id AS controllerPlayerId FROM res_s_control WHERE h3_index = ?',
    [h3Index]
  );
  return {
    nativeTerrain: terrainRow.terrain,
    terrainKind: terrainRow.terrainKind ?? undefined,
    seaportCount: infra?.seaportCount ?? 0,
    controllerPlayerId: control?.controllerPlayerId ?? null,
  };
}
