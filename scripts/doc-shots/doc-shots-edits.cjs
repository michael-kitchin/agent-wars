/**
 * The saved-match edit that sets up the second documentation session.
 *
 * Purpose: The economy and missile pictures need a queued missile, a fortified city, credits in the treasury, a lone
 *   missile, and an enemy beside the armor. Play cannot reach that state on cue, so the run edits the saved match
 *   between sessions.
 * When to use: From `doc-shots.cjs`, with the game state the first session returned. Pass the statements to
 *   `editSavedMatch` while the app is closed.
 * Expected outcome: Pure functions; nothing here touches a file or the page.
 * Exceptions: `economyEdit` throws when the scenario lacks a hex the pictures need.
 */
'use strict';

const path = require('path');
const h3 = require('h3-js');
const { REPO_ROOT } = require('../ui-smoke/ui-smoke-session.cjs');

const { MERCENARY_RAISE_CAPACITY_MULTIPLIER } = require(path.join(REPO_ROOT, 'dist', 'shared', 'mercenaryRules.js'));

/**
 * The id of the missile the edit inserts.
 *
 * Purpose: The missile shot selects this unit by id. No match the run starts has a unit with it.
 * When to use: The insert statement and the missile shot.
 * Expected outcome: `h1-m90`.
 * Exceptions: None.
 */
const INSERTED_MISSILE_ID = 'h1-m90';

/**
 * The treasury balance the edit stores.
 *
 * Purpose: A round figure reads clearly in the top bar, and it is well above any infantry fee, which the hire shot pays
 *   from it when the order is placed.
 * When to use: The treasury statement.
 * Expected outcome: 100 credits.
 * Exceptions: None.
 */
const TREASURY_CREDITS = 100;

/**
 * Finds the active human seat's id.
 *
 * Purpose: Home hexes and the treasury are keyed by seat id.
 * When to use: Before reading the human seat's home or writing its treasury.
 * Expected outcome: The `seatId` of the first human seat that is not out. This is the rule `marchDestinations` in
 *   `ui-smoke-map.cjs` uses.
 * Exceptions: Throws when there is no such seat.
 */
function humanSeatId(state) {
  const seatId = (state.seats || []).find((seat) => seat.kind === 'human' && seat.outTurn == null)?.seatId;
  if (!seatId) throw new Error('the match has no active human seat');
  return seatId;
}

/**
 * Builds the lookups `economyEdit` uses to judge hexes.
 *
 * Purpose: Each hex choice asks the same questions: is it home, is it land, is it empty, is a march headed there.
 * When to use: Once per `economyEdit` call.
 * Expected outcome: Sets and maps over the state's hexes, units, and pending orders. Coastal counts as land.
 * Exceptions: None.
 */
function hexFacts(state, seatId) {
  const countByHex = new Map();
  for (const unit of state.units) countByHex.set(unit.h3Index, (countByHex.get(unit.h3Index) || 0) + 1);
  const kindByHex = new Map(state.hexes.map((hex) => [hex.h3Index, hex.terrainKind]));
  return {
    home: (state.homeRegionHexesBySeat || {})[seatId] || [],
    homeSet: new Set((state.homeRegionHexesBySeat || {})[seatId] || []),
    countByHex,
    isLand: (hex) => kindByHex.has(hex) && kindByHex.get(hex) !== 'water',
    explored: new Set(Array.isArray(state.exploredHexes) ? state.exploredHexes : state.hexes.map((hex) => hex.h3Index)),
    pendingDestinations: new Set((state.pendingOrders || []).map((order) => order.toH3Index)),
  };
}

/**
 * Reports whether the straight grid path between two hexes crosses only open hexes.
 *
 * Purpose: An order line drawn over unit tokens or city labels is hidden in a picture. A line over open hexes shows.
 * When to use: Choosing the far end of an order line for a picture.
 * Expected outcome: True when no hex strictly between the two ends is `blocked`. False when the grid has no path
 *   between them, which `h3.gridPathCells` reports by throwing for some pairs on the coarse global grid.
 * Exceptions: None.
 */
function lineIsClear(fromHex, toHex, blocked) {
  let cells;
  try {
    cells = h3.gridPathCells(fromHex, toHex);
  } catch {
    return false;
  }
  return cells.slice(1, -1).every((cell) => !blocked(cell));
}

/**
 * Finds the farthest hex an order line can reach across open hexes.
 *
 * Purpose: A long line over open hexes makes the intended order plain in a picture.
 * When to use: With the line's start, the distances to try in order (longest first), which hexes may end the line,
 *   and which hexes hide a line drawn over them.
 * Expected outcome: The first hex, at the first distance that has one, that `accept` allows and that `lineIsClear`
 *   reaches. Null when none does.
 * Exceptions: Throws when `fromHex` is not valid.
 */
function farthestClearHex({ fromHex, distances, accept, blocked }) {
  for (const distance of distances) {
    const hit = hexRing(fromHex, distance).find((hex) => accept(hex) && lineIsClear(fromHex, hex, blocked));
    if (hit) return hit;
  }
  return null;
}

/**
 * Chooses the two home cities: the largest for the build queue and the smallest other one to fortify.
 *
 * Purpose: The build popup needs the biggest city to offer a missile. The fortified hex is the next-largest city,
 *   which is still not the queue city, and is large enough for the tick pattern to read in a picture.
 * When to use: First, inside `economyEdit`.
 * Expected outcome: `{ queueHex, queueCells, fortHex }`. Ties go to the lower hex index, so the choice is stable.
 * Exceptions: Throws when the home has fewer than two cities.
 */
function chooseCities(state, facts) {
  const cities = (state.strategicInfrastructure || [])
    .filter((row) => facts.homeSet.has(row.h3Index) && row.urbanHexCount >= 1)
    .sort((a, b) => b.urbanHexCount - a.urbanHexCount || a.h3Index.localeCompare(b.h3Index));
  if (cities.length < 2) throw new Error('the human home needs two cities, one to queue in and one to fortify');
  return { queueHex: cities[0].h3Index, queueCells: cities[0].urbanHexCount, fortHex: cities[1].h3Index };
}

/**
 * Chooses the armor, the hex the enemy is moved to, and the enemy unit.
 *
 * Purpose: The second ranged shot hovers an enemy beside a lone armor.
 * When to use: After `chooseCities`, inside `economyEdit`.
 * Expected outcome: `{ armorId, armorHex, enemyHex, enemyId }`. The armor is the first lone human armor off both cities.
 *   The enemy hex is an empty land neighbor that is neither city nor a pending march destination, preferring the home.
 *   The enemy is the first non-human armor or infantry that is not aboard a ship.
 * Exceptions: Throws when the armor, its neighbor, or the enemy is missing.
 */
function chooseArmorAndEnemy(state, facts, seatId, taken) {
  const armor = state.units.find((u) => u.player === seatId && u.unitType === 'armor'
    && facts.countByHex.get(u.h3Index) === 1 && !taken.has(u.h3Index));
  if (!armor) throw new Error('no lone human armor stands off the two cities');
  const neighbors = h3.gridDisk(armor.h3Index, 1).filter((hex) => hex !== armor.h3Index && facts.isLand(hex)
    && !facts.countByHex.has(hex) && !taken.has(hex) && !facts.pendingDestinations.has(hex));
  const enemyHex = neighbors.find((hex) => facts.homeSet.has(hex)) ?? neighbors[0];
  if (!enemyHex) throw new Error('the armor has no empty land neighbor for the enemy');
  const enemy = state.units.find((u) => u.player !== seatId && (u.unitType === 'armor' || u.unitType === 'infantry')
    && u.embarkedOnNavalUnitId == null);
  if (!enemy) throw new Error('the opponent has no land unit ashore');
  return { armorId: armor.id, armorHex: armor.h3Index, enemyHex, enemyId: enemy.id };
}

/**
 * Lists the hexes exactly a given number of steps from a hex.
 *
 * Purpose: `h3.gridDistance` throws for many pairs on the coarse global grid, where a few steps can cross an
 *   icosahedron face. `h3.gridDisk` does not, so the ring is one disk minus the next smaller one.
 * When to use: Instead of `h3.gridDistance` when choosing hexes a set distance apart.
 * Expected outcome: The hexes at that distance, in `gridDisk` order. Distance 0 is the hex itself.
 * Exceptions: Throws when the hex index is not valid.
 */
function hexRing(h3Index, distance) {
  if (distance === 0) return [h3Index];
  const inner = new Set(h3.gridDisk(h3Index, distance - 1));
  return h3.gridDisk(h3Index, distance).filter((hex) => !inner.has(hex));
}

/**
 * Chooses where the missile stands and which hex the launch shot hovers.
 *
 * Purpose: The missile must stand alone, so it can be selected with one click, and the hover hex must be in range.
 * When to use: Last, inside `economyEdit`.
 * Expected outcome: `{ missileHex, launchHoverHex }`. The stand is an empty home land hex, not taken and not a march
 *   destination. It prefers a stand with an empty, explored land hex five or four hexes away whose straight line
 *   passes no unit and no taken hex, so the launch line shows in the picture: first with none next to the line, then
 *   with none on it. Otherwise it prefers a home hex three hexes away, and then the nearest one within twelve.
 * Exceptions: Throws when no stand or no hover hex exists.
 */
function chooseMissileHexes(facts, taken) {
  const open = (hex) => facts.isLand(hex) && !taken.has(hex) && !facts.pendingDestinations.has(hex);
  const stands = facts.home.filter((hex) => open(hex) && !facts.countByHex.has(hex));
  if (stands.length === 0) throw new Error('the human home has no empty land hex for the missile');
  const filled = (hex) => facts.countByHex.has(hex) || taken.has(hex);
  const crowded = (hex) => h3.gridDisk(hex, 1).some(filled);
  for (const blocked of [crowded, filled]) {
    for (const stand of stands) {
      const hover = farthestClearHex({
        fromHex: stand,
        distances: [5, 4],
        accept: (hex) => open(hex) && facts.explored.has(hex) && !facts.countByHex.has(hex),
        blocked,
      });
      if (hover) return { missileHex: stand, launchHoverHex: hover };
    }
  }
  const hoverFor = (stand, distance) => hexRing(stand, distance).find((hex) => facts.homeSet.has(hex) && open(hex));
  for (const stand of stands) {
    const hover = hoverFor(stand, 3);
    if (hover) return { missileHex: stand, launchHoverHex: hover };
  }
  for (const stand of stands) {
    for (let distance = 1; distance <= 12; distance += 1) {
      const hover = hoverFor(stand, distance);
      if (hover) return { missileHex: stand, launchHoverHex: hover };
    }
  }
  throw new Error('no home land hex lies within missile range of the stand');
}

/**
 * Works out the saved-match edit for the economy and missile shots.
 *
 * Purpose: One edit sets up every second-session picture, from the state the first session left.
 * When to use: With the game state read just before the app closes, and `GLOBAL_GAME_MAP.rules`.
 * Expected outcome: `{ queueHex, fortHex, missileHex, launchHoverHex, enemyHex, armorId, armorHex, showMissile,
 *   raiseFits, statements }`. The statements, each `{ sql, params }`, clear the queue city's build queue and queue a
 *   missile (or infantry when the city is below the Advanced size) and a Credits item, mark that city's intact city
 *   cells fortified (opening the save repairs the strategic count from those cells), set the treasury to 100,
 *   insert a lone missile, and move the enemy beside the armor. `showMissile` says whether a
 *   missile was queued. `raiseFits` says whether the queue city can raise one infantry.
 * Exceptions: Throws when the human seat is missing or not `human`, or when a city, the armor, its neighbor, the enemy,
 *   or the missile stand is missing.
 */
function economyEdit(state, rules) {
  const seatId = humanSeatId(state);
  if (seatId !== 'human') throw new Error('human seat id is not human');
  const facts = hexFacts(state, seatId);
  const { queueHex, queueCells, fortHex } = chooseCities(state, facts);
  const taken = new Set([queueHex, fortHex]);
  const { armorId, armorHex, enemyHex, enemyId } = chooseArmorAndEnemy(state, facts, seatId, taken);
  taken.add(armorHex).add(enemyHex);
  const { missileHex, launchHoverHex } = chooseMissileHexes(facts, taken);
  const showMissile = queueCells >= rules.advancedMinUrbanCells;
  const raiseFits = queueCells * MERCENARY_RAISE_CAPACITY_MULTIPLIER >= rules.infantryCost;
  const queueInsert = 'INSERT INTO res_s_build_queue (h3_index, queue_index, unit_type, remaining_count) VALUES (?, ?, ?, 1)';
  const statements = [
    { sql: 'DELETE FROM res_s_build_queue WHERE h3_index = ?', params: [queueHex] },
    { sql: queueInsert, params: [queueHex, 0, showMissile ? 'missile' : 'infantry'] },
    { sql: queueInsert, params: [queueHex, 1, 'credits'] },
    {
      sql: 'UPDATE res_t_feature_overrides SET is_fortified = 1 WHERE parent_h3_index = ? AND is_urban = 1 AND is_rubble = 0',
      params: [fortHex],
    },
    {
      sql: 'INSERT INTO res_s_treasury (player_id, credits) VALUES (?, ?) ON CONFLICT(player_id) DO UPDATE SET credits = excluded.credits',
      params: [seatId, TREASURY_CREDITS],
    },
    {
      sql: "INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES (?, ?, 'missile', ?, 90)",
      params: [INSERTED_MISSILE_ID, seatId, missileHex],
    },
    { sql: 'UPDATE units SET h3_index = ? WHERE id = ?', params: [enemyHex, enemyId] },
  ];
  return { queueHex, fortHex, missileHex, launchHoverHex, enemyHex, armorId, armorHex, showMissile, raiseFits, statements };
}

module.exports = {
  INSERTED_MISSILE_ID,
  economyEdit,
  farthestClearHex,
  hexRing,
  humanSeatId,
};
