/**
 * SVG path `d` strings from standard icon sets for canvas `Path2D` rendering.
 *
 * Airplane: Bootstrap Icons v1.11.3 `bi-airplane-fill` — MIT License
 *   https://github.com/twbs/icons/blob/main/LICENSE.md
 *   https://icons.getbootstrap.com/icons/airplane-fill/
 *
 * Anchor: Material Symbols Outlined `anchor` 24px — Apache License 2.0
 *   https://fonts.google.com/icons (Material Symbols / anchor)
 */

/** viewBox="0 0 16 16" */
export const AIRPLANE_VIEWBOX_SIZE = 16;
export const AIRPLANE_VIEWBOX_CENTER = { x: 8, y: 8 };

/** viewBox="0 -960 960 960" (Material’s 24dp artboard) */
export const ANCHOR_VIEWBOX = { x: 0, y: -960, w: 960, h: 960 };
export const ANCHOR_VIEWBOX_CENTER = { x: 480, y: -480 };

export const BOOTSTRAP_AIRPLANE_FILL_PATH =
  'M6.428 1.151C6.708.591 7.213 0 8 0s1.292.592 1.572 1.151C9.861 1.73 10 2.431 10 3v3.691l5.17 2.585a1.5 1.5 0 0 1 .83 1.342V12a.5.5 0 0 1-.582.493l-5.507-.918-.375 2.253 1.318 1.318A.5.5 0 0 1 10.5 16h-5a.5.5 0 0 1-.354-.854l1.319-1.318-.376-2.253-5.507.918A.5.5 0 0 1 0 12v-1.382a1.5 1.5 0 0 1 .83-1.342L6 6.691V3c0-.568.14-1.271.428-1.849';

export const MATERIAL_SYMBOLS_ANCHOR_PATH =
  'M355-102q-64-22-116-60t-85.5-89Q120-302 120-360v-120l160 120-62 62q29 51 92 88t130 47v-357H320v-80h120v-47q-35-13-57.5-43.5T360-760q0-50 35-85t85-35q50 0 85 35t35 85q0 39-22.5 69.5T520-647v47h120v80H520v357q67-10 130-47t92-88l-62-62 160-120v120q0 58-33.5 109T721-162q-52 38-116 60T480-80q-61 0-125-22Zm125-618q17 0 28.5-11.5T520-760q0-17-11.5-28.5T480-800q-17 0-28.5 11.5T440-760q0 17 11.5 28.5T480-720Z';

let cachedAirplanePath: Path2D | null = null;
let cachedAnchorPath: Path2D | null = null;

export function getAirplanePath2D(): Path2D {
  if (!cachedAirplanePath) cachedAirplanePath = new Path2D(BOOTSTRAP_AIRPLANE_FILL_PATH);
  return cachedAirplanePath;
}

export function getAnchorPath2D(): Path2D {
  if (!cachedAnchorPath) cachedAnchorPath = new Path2D(MATERIAL_SYMBOLS_ANCHOR_PATH);
  return cachedAnchorPath;
}
