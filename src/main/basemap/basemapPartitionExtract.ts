/**
 * Unpacks one basemap partition into the user-data directory.
 *
 * Purpose: Shaded tiles are read from disk after the zip that holds them is unpacked. Startup does not unpack.
 * When to use: The first time a shaded tile or a battle prefetch needs a partition, and when the index archive is first needed.
 * Expected outcome: A directory whose ready file holds the zip's sha256. Concurrent callers share one unpack.
 * Exceptions: Throws when user data is missing, the zip is unreadable, or a member path is unsafe.
 */

import * as fs from 'fs';
import * as path from 'path';
import { unzipSync } from 'fflate';
import { logDebug, logError, logTrace } from '../logger';

const IN_FLIGHT = new Map<string, Promise<string>>();

let userDataRootOverride: string | null = null;

/**
 * Counts an unpack for a test without a production branch on a global.
 *
 * Purpose: A concurrency test needs to see that two callers wrote once.
 * When to use: Tests pass `{ unpacks: { count: 0 } }`. Production passes nothing.
 * Expected outcome: `count` increments once per unpack that writes.
 * Exceptions: None.
 */
export interface BasemapUnpackCounter {
  /**
   * How many unpacks have written so far.
   *
   * Contract: Starts at whatever the caller set, usually 0.
   * When to use: Read it after the unpack promises settle.
   * Expected outcome: One increment per write, not per caller.
   * Exceptions: None.
   */
  count: number;
}

/**
 * Points unpacks at a temp directory.
 *
 * Purpose: Tests cannot use Electron's user-data path.
 * When to use: At the start of an unpack test. Pass null to clear it.
 * Expected outcome: Later unpacks read this path instead of Electron.
 * Exceptions: None.
 */
export function setBasemapUserDataRootForTests(root: string | null): void {
  logDebug('basemapPartitionExtract setBasemapUserDataRootForTests', { overridden: root !== null });
  userDataRootOverride = root;
}

/**
 * The user-data directory as of this call.
 *
 * Purpose: A test or the startup override can change the directory after the protocol is registered.
 * When to use: At the start of every unpack. Do not cache the result at registration time.
 * Expected outcome: The override, otherwise Electron's user-data path, otherwise null.
 * Exceptions: None. A missing Electron install returns null.
 */
export function basemapUserDataRoot(): string | null {
  if (userDataRootOverride) {
    logTrace('basemapPartitionExtract basemapUserDataRoot', { source: 'override' });
    return userDataRootOverride;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as Record<string, unknown> | string | undefined;
    if (!electron || typeof electron !== 'object') {
      logTrace('basemapPartitionExtract basemapUserDataRoot', { source: 'no-electron' });
      return null;
    }
    const app = electron.app as { getPath?: (name: string) => string } | undefined;
    if (!app || typeof app.getPath !== 'function') {
      logTrace('basemapPartitionExtract basemapUserDataRoot', { source: 'no-app-path' });
      return null;
    }
    logTrace('basemapPartitionExtract basemapUserDataRoot', { source: 'electron' });
    return app.getPath('userData');
  } catch (err) {
    logError('basemapPartitionExtract basemapUserDataRoot: failed', err);
    return null;
  }
}

/**
 * Unpacks one partition zip if its ready file does not already hold `sha256`.
 *
 * Purpose: Shaded tile bytes live beside each other under the partition key.
 * When to use: When an index lists the tile as shaded, and from battle prefetch.
 * Expected outcome: `<userData>/generated-basemap/<mapId>/<partitionKey>/` including `partition.ready`.
 *   A second call with the same hash does not write. Two overlapping calls write once.
 * Exceptions: Throws when the key or a zip member contains `..`, or when user data or the zip is missing.
 */
export function unpackBasemapPartition(
  mapId: string,
  partitionKey: string,
  zipPath: string,
  sha256: string,
  counter?: BasemapUnpackCounter,
): Promise<string> {
  try {
    refusePathPart(partitionKey, 'partition');
    refusePathPart(mapId, 'map');
  } catch (err) {
    return Promise.reject(err);
  }
  const lock = `${mapId}/${partitionKey}`;
  const existing = IN_FLIGHT.get(lock);
  if (existing) return existing;
  const job = unpackPartitionNow(mapId, partitionKey, zipPath, sha256, 'partition.ready', counter);
  IN_FLIGHT.set(lock, job);
  return job.finally(() => {
    if (IN_FLIGHT.get(lock) === job) IN_FLIGHT.delete(lock);
  });
}

/**
 * Unpacks the index archive for one pack.
 *
 * Purpose: The index says which tiles are flat or shaded. It is small and is unpacked on the first request.
 * When to use: Before reading `<key>.json`.
 * Expected outcome: `<userData>/generated-basemap/<mapId>/indexes/` with `indexes.ready` holding `sha256`.
 * Exceptions: Throws when the archive is unreadable or a member path is unsafe.
 */
export function unpackBasemapIndexes(
  mapId: string,
  zipPath: string,
  sha256: string,
  counter?: BasemapUnpackCounter,
): Promise<string> {
  try {
    refusePathPart(mapId, 'map');
  } catch (err) {
    return Promise.reject(err);
  }
  const lock = `${mapId}/indexes`;
  const existing = IN_FLIGHT.get(lock);
  if (existing) return existing;
  const job = unpackPartitionNow(mapId, 'indexes', zipPath, sha256, 'indexes.ready', counter);
  IN_FLIGHT.set(lock, job);
  return job.finally(() => {
    if (IN_FLIGHT.get(lock) === job) IN_FLIGHT.delete(lock);
  });
}

/**
 * Writes one archive into a temp directory and renames it into place.
 *
 * Purpose: A ready file that already holds `sha256` means this partition is current.
 * When to use: From the partition and index unpackers, after the in-flight lock is held.
 * Expected outcome: A promise for the destination directory. The read, the writes, and the rename finish before that
 *   promise is returned, so other startup reads cannot run between a tile request and its ready file.
 * Exceptions: The promise rejects when user data is missing, a member path is unsafe, or the rename fails. The temp directory is removed on failure.
 */
function unpackPartitionNow(
  mapId: string,
  folderName: string,
  zipPath: string,
  sha256: string,
  readyName: string,
  counter?: BasemapUnpackCounter,
): Promise<string> {
  try {
    return Promise.resolve(writePartition(mapId, folderName, zipPath, sha256, readyName, counter));
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * Writes one archive when its ready file is missing or has a different hash.
 *
 * Purpose: The promise wrapper must not yield while these files are being written.
 * When to use: From `unpackPartitionNow` only.
 * Expected outcome: The live directory. The caller’s counter increments only after the rename succeeds.
 *   A current ready file returns the existing directory and does not increment the counter.
 * Exceptions: Throws when user data or the zip is missing, or a member path is unsafe. The temp directory is removed on failure.
 */
function writePartition(
  mapId: string,
  folderName: string,
  zipPath: string,
  sha256: string,
  readyName: string,
  counter?: BasemapUnpackCounter,
): string {
  logDebug('basemapPartitionExtract unpack', { mapId, folderName, zipPath });
  const root = basemapUserDataRoot();
  if (!root) {
    const err = new Error('basemap unpack needs a user-data directory');
    logError('basemapPartitionExtract unpack: no user data', err);
    throw err;
  }
  const parent = path.join(root, 'generated-basemap', mapId);
  const destination = path.join(parent, folderName);
  const readyPath = path.join(destination, readyName);
  if (fs.existsSync(readyPath) && fs.readFileSync(readyPath, 'utf8') === sha256) {
    logTrace('basemapPartitionExtract unpack: current', { destination });
    return destination;
  }
  fs.mkdirSync(parent, { recursive: true });
  const temp = path.join(parent, `.${folderName}.extracting`);
  fs.rmSync(temp, { recursive: true, force: true });
  fs.mkdirSync(temp);
  try {
    const archive = unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
    const writtenDirectories = new Set<string>();
    for (const memberName of Object.keys(archive).sort()) {
      const memberPath = path.join(temp, memberName);
      const relative = path.relative(temp, memberPath);
      if (memberName.includes('..') || memberName.includes('\\') || path.isAbsolute(memberName) || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`refused member ${memberName}`);
      }
      const memberDirectory = path.dirname(memberPath);
      if (!writtenDirectories.has(memberDirectory)) {
        fs.mkdirSync(memberDirectory, { recursive: true });
        writtenDirectories.add(memberDirectory);
      }
      const bytes = archive[memberName];
      if (!bytes) throw new Error(`${zipPath}: missing ${memberName}`);
      fs.writeFileSync(memberPath, bytes);
    }
    fs.writeFileSync(path.join(temp, readyName), sha256);
    const published = publishExtract(parent, folderName, temp);
    if (counter) counter.count += 1;
    return published;
  } catch (err) {
    fs.rmSync(temp, { recursive: true, force: true });
    logError('basemapPartitionExtract unpack: failed', { mapId, folderName, err });
    throw err;
  }
}

/**
 * Renames a finished extract over the live partition directory.
 *
 * Purpose: Readers see either the previous directory or the complete new one.
 * When to use: After every member and the ready file are in the temp directory.
 * Expected outcome: The live directory path. A failed rename puts the previous directory back.
 * Exceptions: Rethrows the rename error after restoring the previous directory when that restore is possible.
 */
function publishExtract(parent: string, folderName: string, temp: string): string {
  const destination = path.join(parent, folderName);
  const backup = path.join(parent, `.${folderName}.previous`);
  fs.rmSync(backup, { recursive: true, force: true });
  if (fs.existsSync(destination)) fs.renameSync(destination, backup);
  try {
    fs.renameSync(temp, destination);
  } catch (err) {
    if (!fs.existsSync(destination) && fs.existsSync(backup)) fs.renameSync(backup, destination);
    throw err;
  }
  fs.rmSync(backup, { recursive: true, force: true });
  logDebug('basemapPartitionExtract publishExtract', { destination });
  return destination;
}

function refusePathPart(value: string, label: string): void {
  if (value.includes('..') || value.includes('\\') || value.startsWith('/') || value.includes(':')) {
    throw new Error(`refused ${label} path`);
  }
}
