/**
 * Unit-token images for the guide's Units at a Glance table.
 *
 * Purpose: The table shows each unit as the player's own token looks on the map, without cropping a live map.
 * When to use: From `doc-shots.cjs`, in the `tokens` group, while the app's window is open on any screen.
 * Expected outcome: Seven 48 by 48 PNG files with transparent backgrounds under `doc/media/`.
 * Exceptions: A token that cannot be drawn is skipped by `runShot`; the old file stays.
 */
'use strict';

const path = require('path');
const { REPO_ROOT } = require('../ui-smoke/ui-smoke-session.cjs');
const { runShot } = require('./doc-shots-capture.cjs');

const { SEAT_PALETTES } = require(path.join(REPO_ROOT, 'dist', 'shared', 'seatPalette.js'));
const { CREDITS_SYMBOL } = require(path.join(REPO_ROOT, 'dist', 'shared', 'economySymbols.js'));
const { FORTIFICATION_TICKS_PER_EDGE, fortificationTickSegments } = require(path.join(REPO_ROOT, 'dist', 'shared', 'fortificationTickGeometry.js'));

/**
 * Renderer drawing values that are not compiled to `dist/`, copied here with their sources.
 *
 * Purpose: The token images must match the map, and these values live only in renderer code.
 * When to use: Only by this file's drawing code.
 * Expected outcome: `size` is the image edge. `radius` is `UNIT_RADIUS` in `src/renderer/core/constants.ts`.
 *   `strokePx` and `stroke` are the white 2 px border from `drawOneUnitMarker`. `iconFitRatio` is
 *   `TOKEN_ICON_FIT_RATIO` in `src/renderer/rendering/unitDrawing.ts`. `badgeFont`, `badgeStrokePx`, `badgeStroke`, and
 *   `badgeFill` come from `drawMercenaryBadge` in `src/renderer/rendering/mercenaryBadgeDrawing.ts`, which draws at the
 *   token center. `borderAlpha` is `OWNERSHIP_BORDER_ALPHA`. `hexRadius` frames the fortification image, and the tick
 *   ratios and minimum width are the `STRATEGIC_FORTIFICATION_*` values in `fortificationTickDrawing.ts`.
 * Exceptions: None.
 */
const TOKEN_STYLE = Object.freeze({
  size: 48,
  radius: 18,
  strokePx: 2,
  stroke: '#fff',
  iconFitRatio: 0.9,
  badgeFont: 'bold 14px system-ui, sans-serif',
  badgeStrokePx: 2,
  badgeStroke: '#fff',
  badgeFill: '#000',
  borderAlpha: 0.75,
  hexRadius: 20,
  tickLengthRatio: 0.16,
  tickWidthRatio: 0.04,
  tickMinWidthPx: 1.5,
});

/**
 * The token images, in the order the table lists them.
 *
 * Purpose: One entry per image: its file name, the glyph it draws, and whether it carries the mercenary badge.
 * When to use: Only by `writeTokenImages`. An entry with `glyph: null` is the fortified hex.
 * Expected outcome: Infantry, armor, naval, air, missile, mercenary, then fortification.
 * Exceptions: None.
 */
const TOKENS = Object.freeze([
  { fileName: 'token-infantry.png', glyph: 'infantry', badge: false },
  { fileName: 'token-armor.png', glyph: 'armor', badge: false },
  { fileName: 'token-naval.png', glyph: 'naval', badge: false },
  { fileName: 'token-air.png', glyph: 'air', badge: false },
  { fileName: 'token-missile.png', glyph: 'missile', badge: false },
  { fileName: 'token-mercenary.png', glyph: 'infantry', badge: true },
  { fileName: 'token-fortification.png', glyph: null, badge: false },
]);

/**
 * Works out the fortified hex outline and its ticks for the fortification image.
 *
 * Purpose: The ticks come from the same shared geometry the map uses, so the image shows the real pattern.
 * When to use: Once per run, before drawing the fortification image.
 * Expected outcome: `{ points, segments, lineWidth }` for a pointy-top hex centered in the image, with four ticks per
 *   edge, the way the map key draws its Fortified swatch.
 * Exceptions: None.
 */
function fortificationGeometry() {
  const center = TOKEN_STYLE.size / 2;
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = (index * Math.PI) / 3;
    return { x: center + Math.sin(angle) * TOKEN_STYLE.hexRadius, y: center - Math.cos(angle) * TOKEN_STYLE.hexRadius };
  });
  const segments = fortificationTickSegments({
    points,
    cornerCount: 6,
    ticksPerEdge: FORTIFICATION_TICKS_PER_EDGE,
    tickLengthPx: TOKEN_STYLE.tickLengthRatio * TOKEN_STYLE.hexRadius,
  });
  const lineWidth = Math.max(TOKEN_STYLE.tickMinWidthPx, TOKEN_STYLE.tickWidthRatio * TOKEN_STYLE.hexRadius);
  return { points, segments, lineWidth };
}

/**
 * Draws one token on a page canvas and returns it as a PNG data URL.
 *
 * Purpose: Runs inside the app page, so the glyph files and system font are the ones the map uses.
 * When to use: Only through `page.evaluate` from `drawTokenPng`.
 * Expected outcome: A data URL of a transparent square image. A unit token is a filled circle, a white border, then the
 *   glyph, with the credits symbol on top for a mercenary. The fortified hex is its ticks only.
 * Exceptions: Rejects when the glyph image cannot be decoded.
 */
async function drawTokenInPage({ style, fill, glyph, badge, badgeText, fort }) {
  const canvas = document.createElement('canvas');
  canvas.width = style.size;
  canvas.height = style.size;
  const ctx = canvas.getContext('2d');
  const center = style.size / 2;
  if (fort) {
    ctx.globalAlpha = style.borderAlpha;
    ctx.strokeStyle = fill;
    ctx.lineWidth = fort.lineWidth;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    for (const segment of fort.segments) {
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
    }
    ctx.stroke();
    return canvas.toDataURL('image/png');
  }
  ctx.beginPath();
  ctx.arc(center, center, style.radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = style.strokePx;
  ctx.stroke();
  const img = new Image();
  img.src = new URL(`units/${glyph}.svg`, window.location.href).href;
  await img.decode();
  const scale = (style.radius * 2 * style.iconFitRatio) / Math.max(img.naturalWidth, img.naturalHeight);
  const width = img.naturalWidth * scale;
  const height = img.naturalHeight * scale;
  ctx.drawImage(img, center - width / 2, center - height / 2, width, height);
  if (badge) {
    ctx.font = style.badgeFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = style.badgeStroke;
    ctx.lineWidth = style.badgeStrokePx;
    ctx.strokeText(badgeText, center, center);
    ctx.fillStyle = style.badgeFill;
    ctx.fillText(badgeText, center, center);
  }
  return canvas.toDataURL('image/png');
}

/**
 * Draws one token in the page and decodes it to a PNG buffer.
 *
 * Purpose: `runShot` takes a buffer, and the page can only hand back a data URL.
 * When to use: Inside a `runShot` capture function.
 * Expected outcome: The PNG bytes of the token image.
 * Exceptions: Rejects when the page cannot draw the token.
 */
async function drawTokenPng(page, token, fort) {
  const dataUrl = await page.evaluate(drawTokenInPage, {
    style: TOKEN_STYLE,
    fill: SEAT_PALETTES[0].map,
    glyph: token.glyph,
    badge: token.badge,
    badgeText: CREDITS_SYMBOL,
    fort: token.glyph ? null : fort,
  });
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
}

/**
 * Writes every token image.
 *
 * Purpose: The `tokens` group of the screenshot run.
 * When to use: While the app's window is open. It needs no match.
 * Expected outcome: One `WROTE` or `SKIP` line per image in `TOKENS`.
 * Exceptions: None; each failed image is a `SKIP`.
 */
async function writeTokenImages(page, report) {
  const fort = fortificationGeometry();
  for (const token of TOKENS) {
    await runShot(report, token.fileName, () => drawTokenPng(page, token, fort));
  }
}

module.exports = {
  writeTokenImages,
};
