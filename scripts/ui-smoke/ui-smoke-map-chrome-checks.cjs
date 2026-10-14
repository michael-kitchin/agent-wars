/**
 * Checks of the chrome on the map for the UI smoke run: the minimap panel and its mode buttons, the terrain legend, and
 * Leaflet's zoom buttons, scale, and attribution.
 *
 * Purpose: Keeps the map chrome checks apart from the frame, console, and scenario checks, so each table stays readable.
 * When to use: Required by `ui-smoke-checks.cjs`, which runs these rows after the scenario checks.
 * Expected outcome: Rows in the same shape as the frame checks: `{ name, scenes, needs, run(p, el) }`.
 * Exceptions: None.
 */
'use strict';

const { SCENES, NEW_GAME_SCENES, near, fmt } = require('./ui-smoke-scenes.cjs');

/**
 * Sizes of the minimap panel, in CSS pixels.
 *
 * Purpose: The panel keeps today's 200 px minimap and adds a 96 px column of five 40 px buttons, 12 px in from the map's
 *   top-left corner. The legend opens 8 px from it.
 * When to use: The panel and legend geometry checks.
 * Expected outcome: Matches `.minimap-panel` and `.map-mode-btn` in `static/shellChrome.css`, and `MAP_CHROME_INSET`
 *   and `MAP_CHROME_GAP` in `src/shared/mapChromePlacement.ts`.
 * Exceptions: None.
 */
const PANEL = Object.freeze({ inset: 12, minimap: 200, column: 96, button: 40, legendGap: 8 });

/**
 * The map-mode buttons, top to bottom.
 *
 * Purpose: The panel's column must hold exactly these, in this order.
 * When to use: The panel geometry check.
 * Expected outcome: Weather, Tech, Control, Production, Legend.
 * Exceptions: None.
 */
const MODE_BUTTONS = Object.freeze(['#map-mode-weather', '#map-mode-tech', '#map-mode-control', '#map-mode-production', '#map-legend-toggle']);

/**
 * Leaflet's zoom buttons, scale, and attribution on the main map.
 *
 * Purpose: One place for the selectors the position checks read.
 * When to use: The zoom, scale, and attribution checks.
 * Expected outcome: Leaflet's own class names inside `#main-map`.
 * Exceptions: None.
 */
const LEAFLET = Object.freeze({
  zoom: '#main-map .leaflet-control-zoom',
  scale: '#main-map .leaflet-control-scale',
  attribution: '#main-map .leaflet-control-attribution',
});

/**
 * Scenes on the world map and in a battle, at each size, where the map chrome must be in its usual place.
 *
 * Purpose: The chrome must hold its place at every size, in a battle, and in a regional match.
 * When to use: The placement checks.
 * Expected outcome: The strategic scene at each size, the reopened match, the battle's first scene, and the regional
 *   match's first scene.
 * Exceptions: None.
 */
const PLACEMENT_SCENES = Object.freeze([SCENES.strategic, SCENES.matchReopened, SCENES.battleStart, SCENES.regionalStart]);

/**
 * The map chrome checks, one row each.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a map chrome rule needs a machine check.
 * Expected outcome: Each row is independent of the others.
 * Exceptions: None.
 */
const MAP_CHROME_CHECKS = Object.freeze([
  {
    name: 'minimap-panel-layout',
    scenes: PLACEMENT_SCENES,
    needs: ['#canvas-container', '#minimap-panel', '#minimap', '#map-mode-column', ...MODE_BUTTONS],
    run: (p, el) => {
      const c = el('#canvas-container');
      const panel = el('#minimap-panel');
      const mini = el('#minimap');
      const column = el('#map-mode-column');
      if (!panel.shown) return 'the minimap panel is not shown';
      if (!near(panel.x, c.x + PANEL.inset) || !near(panel.y, c.y + PANEL.inset)) {
        return `the minimap panel is at ${fmt(panel)}, expected its corner ${PANEL.inset} px in from the map's top-left`;
      }
      if (!near(mini.w, PANEL.minimap) || !near(mini.h, PANEL.minimap)) return `the minimap is ${fmt(mini)}, expected ${PANEL.minimap}x${PANEL.minimap}`;
      if (!near(column.w, PANEL.column) || column.x < mini.x + mini.w - 1) return `the mode column is ${fmt(column)}, expected ${PANEL.column} px wide right of the minimap`;
      for (const [i, selector] of MODE_BUTTONS.entries()) {
        const button = el(selector);
        if (!near(button.h, PANEL.button) || !near(button.y, column.y + i * PANEL.button)) {
          return `${selector} is at ${fmt(button)}, expected button ${i + 1} of the column, ${PANEL.button} px tall`;
        }
      }
      return null;
    },
  },
  {
    name: 'map-mode-weather-default',
    scenes: [...PLACEMENT_SCENES, SCENES.ordersQueued],
    needs: [...MODE_BUTTONS, '#terrain-legend'],
    run: (p, el) => {
      const state = MODE_BUTTONS.map((selector) => `${selector} ${el(selector).disabled ? 'disabled' : `pressed=${el(selector).pressed}`}`);
      const expected = [
        '#map-mode-weather pressed=true',
        '#map-mode-tech pressed=false',
        '#map-mode-control disabled',
        '#map-mode-production disabled',
        '#map-legend-toggle pressed=false',
      ];
      if (state.join(', ') !== expected.join(', ')) return `the mode buttons read "${state.join(', ')}"`;
      return el('#terrain-legend').shown ? 'the terrain legend is open' : null;
    },
  },
  {
    name: 'map-mode-tech-chosen',
    scenes: [SCENES.mapTech],
    needs: ['#map-mode-weather', '#map-mode-tech'],
    run: (p, el) => {
      const line = `Weather pressed=${el('#map-mode-weather').pressed}, Tech pressed=${el('#map-mode-tech').pressed}`;
      return line === 'Weather pressed=false, Tech pressed=true' ? null : `the view buttons read "${line}"`;
    },
  },
  {
    name: 'legend-beside-or-under-panel',
    scenes: [SCENES.legendOpen, SCENES.legendSmallWindow],
    needs: ['#canvas-container', '#minimap-panel', '#terrain-legend', '#map-legend-toggle'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const panel = el('#minimap-panel');
      const legend = el('#terrain-legend');
      const toggle = el('#map-legend-toggle');
      if (toggle.pressed !== 'true' || toggle.expanded !== 'true') return `the Legend button reads pressed=${toggle.pressed}, expanded=${toggle.expanded}`;
      if (!legend.shown) return 'the terrain legend is not shown';
      const besideX = panel.x + panel.w + PANEL.legendGap;
      if (besideX + legend.w + PANEL.inset <= c.x + c.w + 1) {
        return near(legend.x, besideX) && near(legend.y, c.y + PANEL.inset)
          ? null
          : `the terrain legend is at ${fmt(legend)}, expected ${PANEL.legendGap} px right of the panel ${fmt(panel)}, level with its top`;
      }
      return near(legend.x, c.x + PANEL.inset) && near(legend.y, panel.y + panel.h + PANEL.legendGap)
        ? null
        : `the terrain legend is at ${fmt(legend)}, expected ${PANEL.legendGap} px under the panel ${fmt(panel)}, which leaves no room beside it`;
    },
  },
  {
    name: 'zoom-buttons-top-right',
    scenes: PLACEMENT_SCENES,
    needs: ['#canvas-container', LEAFLET.zoom],
    run: (p, el) => {
      const c = el('#canvas-container');
      const zoom = el(LEAFLET.zoom);
      if (!zoom.shown) return 'the zoom buttons are not shown';
      const placed = near(zoom.x + zoom.w, c.x + c.w - PANEL.inset) && near(zoom.y, c.y + PANEL.inset);
      return placed ? null : `the zoom buttons are at ${fmt(zoom)}, expected ${PANEL.inset} px in from the map's top-right ${fmt(c)}`;
    },
  },
  {
    name: 'scale-and-attribution-bottom-right',
    scenes: PLACEMENT_SCENES,
    needs: ['#canvas-container', LEAFLET.scale, LEAFLET.attribution],
    run: (p, el) => {
      const c = el('#canvas-container');
      const scale = el(LEAFLET.scale);
      const attribution = el(LEAFLET.attribution);
      if (!scale.shown) return 'the scale is not shown';
      const bottom = c.y + c.h - PANEL.inset;
      if (!near(scale.x + scale.w, c.x + c.w - PANEL.inset) || !near(scale.y + scale.h, bottom)) {
        return `the scale is at ${fmt(scale)}, expected ${PANEL.inset} px in from the map's bottom-right ${fmt(c)}`;
      }
      if (!attribution.shown) return null;
      return attribution.x + attribution.w <= scale.x + 1 && near(attribution.y + attribution.h, bottom)
        ? null
        : `the attribution is at ${fmt(attribution)}, expected left of the scale ${fmt(scale)} on the same bottom line`;
    },
  },
  {
    name: 'map-chrome-hidden-during-new-game',
    scenes: NEW_GAME_SCENES,
    needs: ['#minimap-panel', '#terrain-legend', LEAFLET.zoom],
    run: (p, el) => {
      const shown = ['#minimap-panel', '#terrain-legend', LEAFLET.zoom].filter((selector) => el(selector).shown);
      return shown.length === 0 ? null : `shown on the new-game screen: ${shown.join(', ')}`;
    },
  },
]);

module.exports = { MAP_CHROME_CHECKS };
