/**
 * Manifest and index shapes for an offline hillshade pack.
 *
 * Purpose: The reader, the tile resolver, and the prefetch share one description of the zip.
 * When to use: When parsing `basemap_pack.json` or a partition index.
 * Expected outcome: TypeScript checks the fields the Python pack writer emits.
 * Exceptions: None. Parsing functions reject documents that do not match these shapes.
 */

/**
 * One partition named by the pack manifest.
 *
 * Purpose: Says whether shaded tiles live in a zip.
 * When to use: When deciding whether to unpack.
 * Expected outcome: `zip` and `sha256` are both null when the partition has only flat tiles.
 * Exceptions: None.
 */
export interface BasemapPartitionEntry {
  /**
   * Zip file name beside the manifest, or null when nothing is shaded.
   *
   * Contract: A file name such as `z0_x0_y0.zip`, never a path.
   * When to use: To find the archive under the pack directory.
   * Expected outcome: Null when every stored tile in the partition is flat land.
   * Exceptions: None.
   */
  readonly zip: string | null;
  /**
   * Lowercase sha256 of the zip file, or null when there is no zip.
   *
   * Contract: 64 hex characters when `zip` is set.
   * When to use: Compared with `partition.ready` before unpacking again.
   * Expected outcome: Null exactly when `zip` is null.
   * Exceptions: None.
   */
  readonly sha256: string | null;
}

/**
 * `basemap_pack.json` after it is read from its zip.
 *
 * Purpose: Names the shared tiles, the index archive, and every partition that is not entirely water.
 * When to use: After inflating the manifest member.
 * Expected outcome: `schema` is 1. `kind` is `global` or `regional`.
 * Exceptions: None.
 */
export interface BasemapPackManifest {
  /**
   * Document version.
   *
   * Contract: 1 for the packs this app reads.
   * When to use: Reject any other value.
   * Expected outcome: 1.
   * Exceptions: None.
   */
  readonly schema: number;
  /**
   * Which pack this directory is.
   *
   * Contract: `global` or `regional`.
   * When to use: Logging and tests.
   * Expected outcome: Matches the directory's role.
   * Exceptions: None.
   */
  readonly kind: string;
  /**
   * `global` or a region id.
   *
   * Contract: Matches `^[a-z0-9_]+$`.
   * When to use: To choose the user-data folder.
   * Expected outcome: The id the pack was built for.
   * Exceptions: None.
   */
  readonly mapId: string;
  /**
   * Lowest zoom stored in this pack.
   *
   * Contract: 0 for global, 8 for a region.
   * When to use: Tests and diagnostics.
   * Expected outcome: An integer.
   * Exceptions: None.
   */
  readonly zoomMin: number;
  /**
   * Highest zoom stored in this pack.
   *
   * Contract: 7 for global, 9 for a region.
   * When to use: Tests and diagnostics.
   * Expected outcome: An integer.
   * Exceptions: None.
   */
  readonly zoomMax: number;
  /**
   * Hash of the hillshade recipe.
   *
   * Contract: 64 lowercase hex characters.
   * When to use: Resume checks in the pack builder. The app does not rebuild from it.
   * Expected outcome: A hex string.
   * Exceptions: None.
   */
  readonly settingsHash: string;
  /**
   * Hash of the elevation files the pack was drawn from.
   *
   * Contract: 64 lowercase hex characters.
   * When to use: Resume checks in the pack builder.
   * Expected outcome: A hex string.
   * Exceptions: None.
   */
  readonly sourcesHash: string;
  /**
   * File name of the shared flat-land image.
   *
   * Contract: `land.webp`.
   * When to use: When a tile is listed as flat.
   * Expected outcome: A file beside the manifest.
   * Exceptions: None.
   */
  readonly landTile: string;
  /**
   * File name of the shared transparent water image.
   *
   * Contract: `water.webp`.
   * When to use: When a tile is unlisted or the partition is missing.
   * Expected outcome: A file beside the manifest.
   * Exceptions: None.
   */
  readonly waterTile: string;
  /**
   * File name of the index archive.
   *
   * Contract: `indexes.json.zip`.
   * When to use: On the first request for the pack.
   * Expected outcome: A file beside the manifest.
   * Exceptions: None.
   */
  readonly indexesZip: string;
  /**
   * Lowercase sha256 of the index archive.
   *
   * Contract: 64 hex characters.
   * When to use: Compared with `indexes.ready`.
   * Expected outcome: The hash of `indexesZip`.
   * Exceptions: None.
   */
  readonly indexesSha256: string;
  /**
   * Partitions that contain flat or shaded tiles.
   *
   * Contract: Keys are `z{zoom}_x{x}_y{y}`. Entirely water partitions are absent.
   * When to use: To find a zip and its hash.
   * Expected outcome: An object. It may be empty.
   * Exceptions: None.
   */
  readonly partitions: Readonly<Record<string, BasemapPartitionEntry>>;
}

/**
 * One partition's tile lists.
 *
 * Purpose: Distinguishes flat land from shaded relief. Anything missing is water.
 * When to use: After reading `<key>.json` from the unpacked indexes.
 * Expected outcome: Sorted `{z}/{x}/{y}` strings. A tile appears in at most one list.
 * Exceptions: None.
 */
export interface BasemapPartitionIndex {
  /**
   * Flat-land tiles served from `land.webp`.
   *
   * Contract: `{z}/{x}/{y}` strings.
   * When to use: Before reading a shaded file.
   * Expected outcome: An array, possibly empty.
   * Exceptions: None.
   */
  readonly flat: readonly string[];
  /**
   * Shaded tiles stored in the partition zip.
   *
   * Contract: `{z}/{x}/{y}` strings.
   * When to use: When the tile needs the unpacked WebP.
   * Expected outcome: An array, possibly empty.
   * Exceptions: None.
   */
  readonly shaded: readonly string[];
}
