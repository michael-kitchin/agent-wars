/**
 * Crop, write, and report helpers for the documentation screenshot run.
 *
 * Purpose: Every documentation image is cropped to the controls its caption names, written without ever leaving a
 *   half-written file, and reported the same way.
 * When to use: From the `scripts/doc-shots/` shot modules.
 * Expected outcome: A shot that succeeds replaces its file under `doc/media/`. A shot that fails leaves the old file as it was.
 * Exceptions: Each helper documents its own. `runShot` never throws.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('../ui-smoke/ui-smoke-session.cjs');

/**
 * The folder the guide's images live in.
 *
 * Purpose: Shots are written straight to where `doc/how-to-play.md` links them, so the git diff is the review.
 * When to use: `runShot`.
 * Expected outcome: `<repo>/doc/media`.
 * Exceptions: None.
 */
const MEDIA_DIR = path.join(REPO_ROOT, 'doc', 'media');

/**
 * The window size of every match shot, in CSS pixels.
 *
 * Purpose: Crops stay comparable from run to run, and the layout matches the UI smoke run's first size.
 * When to use: Both match sessions, right after the match is on screen.
 * Expected outcome: 1280 by 720.
 * Exceptions: None.
 */
const MATCH_VIEWPORT = Object.freeze({ w: 1280, h: 720 });

/**
 * How far above the selection panel's top edge the order-line shots center their line, in CSS pixels.
 *
 * Purpose: Far enough that a line four or five hexes long clears the panel, near enough that one crop holds both.
 * When to use: As `pointAbove`'s rise for the `#selection-panel`, before hovering a line's far end.
 * Expected outcome: 170 pixels.
 * Exceptions: None.
 */
const LINE_RISE_PX = 170;

/**
 * The eight bytes every PNG file starts with.
 *
 * Purpose: `pngSize` refuses a buffer that is not a PNG.
 * When to use: Only by `pngSize`.
 * Expected outcome: The standard PNG signature.
 * Exceptions: None.
 */
const PNG_SIGNATURE = Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Pads the union of several boxes and keeps it inside the window.
 *
 * Purpose: A shot frames every control its caption names, with a little room around them.
 * When to use: With boxes in CSS pixels of the window, such as those `clipAround` reads.
 * Expected outcome: `{ x, y, width, height }` in whole pixels, rounded outward and clamped to `0..viewport.w` and `0..viewport.h`.
 * Exceptions: Throws when `boxes` is empty or the clamped area is zero.
 */
function unionClip({ boxes, pad, viewport }) {
  if (!boxes || boxes.length === 0) throw new Error('a crop needs at least one box');
  const left = Math.min(...boxes.map((box) => box.x)) - pad;
  const top = Math.min(...boxes.map((box) => box.y)) - pad;
  const right = Math.max(...boxes.map((box) => box.x + box.width)) + pad;
  const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + pad;
  const x = Math.max(0, Math.floor(left));
  const y = Math.max(0, Math.floor(top));
  const width = Math.min(viewport.w, Math.ceil(right)) - x;
  const height = Math.min(viewport.h, Math.ceil(bottom)) - y;
  if (width <= 0 || height <= 0) throw new Error('the crop is empty once it is kept inside the window');
  return { x, y, width, height };
}

/**
 * Works out the crop around some on-screen elements and window points.
 *
 * Purpose: A shot names what it shows, and the crop follows those things wherever the layout puts them.
 * When to use: After the scene has settled. Points are hex centers or corners from the map helpers.
 * Expected outcome: The `unionClip` of every selector's box and every point, with `pad` around them.
 * Exceptions: Throws, naming the selector, when one is not visible. Throws `point is off screen` when a point lies
 *   outside the window, so a cropped sliver never replaces an existing image.
 */
async function clipAround(page, { selectors = [], points = [], pad = 16, viewport }) {
  const boxes = [];
  for (const selector of selectors) {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`${selector} is not visible`);
    boxes.push(box);
  }
  for (const point of points) {
    if (point.x < 0 || point.x > viewport.w || point.y < 0 || point.y > viewport.h) throw new Error('point is off screen');
    boxes.push({ x: point.x, y: point.y, width: 1, height: 1 });
  }
  return unionClip({ boxes, pad, viewport });
}

/**
 * Returns the window point a set distance above the middle of an element's top edge.
 *
 * Purpose: Order-line pictures pan the line to just above the panel they are cropped with.
 * When to use: With the panel's selector and how far above it the line's midpoint should sit, in CSS pixels.
 * Expected outcome: `{ x, y }` in CSS pixels of the window.
 * Exceptions: Throws, naming the selector, when the element is not visible.
 */
async function pointAbove(page, selector, rise) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${selector} is not visible`);
  return { x: box.x + box.width / 2, y: box.y - rise };
}

/**
 * Reads a PNG's width and height.
 *
 * Purpose: The run reports each written image's real size, so a wrong crop is easy to spot.
 * When to use: With a buffer from `page.screenshot` or a decoded canvas.
 * Expected outcome: `{ width, height }` from the IHDR chunk, which every PNG stores first.
 * Exceptions: Throws when the buffer does not start with the PNG signature.
 */
function pngSize(buffer) {
  const isPng = buffer.length >= 24 && PNG_SIGNATURE.every((byte, index) => buffer[index] === byte);
  if (!isPng) throw new Error('the buffer is not a PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * Replaces a file only once the new content is fully on disk.
 *
 * Purpose: An interrupted write must never leave a truncated image in `doc/media/`.
 * When to use: For every image the run writes.
 * Expected outcome: Writes `<finalPath>.tmp`, copies it onto `finalPath`, then deletes the temporary file. The copy
 *   replaces an existing file on Windows, where a rename over it can fail. `finalPath` is never deleted first.
 * Exceptions: Deletes the temporary file and rethrows when a step fails.
 */
function writeFileAtomic(finalPath, buffer) {
  const tempPath = `${finalPath}.tmp`;
  try {
    fs.writeFileSync(tempPath, buffer);
    fs.copyFileSync(tempPath, finalPath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

/**
 * Takes one documentation image and records the result.
 *
 * Purpose: A failed or skipped shot must keep the old image, and the run's summary must say which ones failed.
 * When to use: Once per image. `captureFn` returns the PNG `Buffer` and does all page work for that image.
 * Expected outcome: On success, writes `doc/media/<fileName>`, pushes `{ fileName, width, height }` to `report.written`,
 *   and prints `WROTE`. On a throw, pushes `{ fileName, reason }` to `report.skipped`, prints `SKIP`, and leaves the
 *   file alone. Returns true only when the file was written.
 * Exceptions: None.
 */
async function runShot(report, fileName, captureFn) {
  try {
    const buffer = await captureFn();
    const { width, height } = pngSize(buffer);
    writeFileAtomic(path.join(MEDIA_DIR, fileName), buffer);
    report.written.push({ fileName, width, height });
    console.log(`WROTE doc/media/${fileName} ${width}x${height}`);
    return true;
  } catch (err) {
    return skipShot(report, fileName, err && err.message ? err.message : String(err));
  }
}

/**
 * Records a shot that was not taken.
 *
 * Purpose: A shot whose setup failed is reported the same way as one whose capture failed.
 * When to use: From `runShot`, and for each shot of a group that could not start.
 * Expected outcome: Pushes `{ fileName, reason }` to `report.skipped` and prints `SKIP <file> :: <reason>`. Returns false.
 * Exceptions: None.
 */
function skipShot(report, fileName, reason) {
  const firstLine = String(reason).split('\n')[0];
  report.skipped.push({ fileName, reason: firstLine });
  console.log(`SKIP ${fileName} :: ${firstLine}`);
  return false;
}

/**
 * Waits until the map's background tiles have drawn.
 *
 * Purpose: A map shot taken before any tile loads shows an empty map, which is worse than the old image.
 * When to use: Before the first map shot of a session, and after a large pan or zoom.
 * Expected outcome: Resolves once Leaflet has marked a tile loaded, or a tile image has pixels.
 * Exceptions: Throws `map tiles did not load` after `timeoutMs`.
 */
async function waitForMapTiles(page, timeoutMs = 20000) {
  await page.waitForFunction(() => document.querySelector('.leaflet-tile-loaded') != null
    || [...document.querySelectorAll('img.leaflet-tile')].some((img) => img.naturalWidth > 0), null, { timeout: timeoutMs })
    .catch(() => {
      throw new Error('map tiles did not load');
    });
}

module.exports = {
  LINE_RISE_PX,
  MATCH_VIEWPORT,
  MEDIA_DIR,
  clipAround,
  pngSize,
  pointAbove,
  runShot,
  skipShot,
  unionClip,
  waitForMapTiles,
  writeFileAtomic,
};
