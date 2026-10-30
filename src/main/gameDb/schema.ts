/**
 * Defines the `getFullDdl` function shape (export function getFullDdl(): string).

 * Purpose: Supports maintainability by documenting why `getFullDdl` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getFullDdl(): string {
  return `
    CREATE TABLE IF NOT EXISTS hexes (
      h3_index TEXT PRIMARY KEY,
      terrain TEXT NOT NULL CHECK (terrain IN ('land', 'water', 'coastal', 'wetlands')),
      terrain_kind TEXT NOT NULL CHECK (terrain_kind IN ('water', 'coastal', 'wetlands', 'plains', 'forest', 'mountain', 'desert', 'arctic')),
      map_role TEXT CHECK (map_role IS NULL OR map_role IN ('member_land', 'sea', 'neutral_border'))
    );

    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY,
      player TEXT NOT NULL,
      unit_type TEXT NOT NULL CHECK (unit_type IN ('infantry', 'armor', 'naval', 'air', 'missile')),
      display_order INTEGER,
      h3_index TEXT NOT NULL,
      birth_h3_index TEXT,
      birth_res_t_h3_index TEXT,
      birth_terrain_kind TEXT,
      birth_is_urban INTEGER,
      birth_country_name TEXT,
      birth_country_code TEXT,
      birth_area_id TEXT,
      birth_area_name TEXT,
      formed_turn INTEGER NOT NULL DEFAULT 1,
      is_mercenary INTEGER NOT NULL DEFAULT 0,
      CHECK (is_mercenary IN (0, 1) AND (is_mercenary = 0 OR (player <> 'neutral' AND unit_type <> 'missile'))),
      FOREIGN KEY (h3_index) REFERENCES hexes(h3_index)
    );

    CREATE TABLE IF NOT EXISTS turn_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      phase TEXT NOT NULL CHECK (phase IN ('planning', 'resolution')),
      turn_number INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pending_orders (
      unit_id TEXT NOT NULL,
      to_h3_index TEXT NOT NULL,
      PRIMARY KEY (unit_id)
    );

    CREATE TABLE IF NOT EXISTS pending_ranged_orders (
      unit_id TEXT PRIMARY KEY,
      target_h3_index TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pending_air_orders (
      unit_id TEXT PRIMARY KEY,
      target_h3_index TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK (target_type IN ('units', 'urban', 'airport', 'seaport'))
    );

    CREATE TABLE IF NOT EXISTS pending_missile_launches (
      unit_id TEXT PRIMARY KEY,
      target_h3_index TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pending_ferry_orders (
      unit_id TEXT PRIMARY KEY,
      destination_h3_index TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS unit_transport_assignments (
      land_unit_id TEXT PRIMARY KEY,
      naval_unit_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_memory (
      player_id TEXT NOT NULL,
      key TEXT NOT NULL,
      content TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'stored',
      created_turn INTEGER NOT NULL,
      expires_turn INTEGER,
      recurring_interval INTEGER,
      next_trigger_turn INTEGER,
      last_triggered_turn INTEGER,
      tags TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (player_id, key)
    );

    CREATE TABLE IF NOT EXISTS standing_orders (
      player_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      order_type TEXT NOT NULL,
      params TEXT NOT NULL,
      computed_route TEXT,
      status TEXT NOT NULL,
      created_turn INTEGER NOT NULL,
      origin_hex TEXT NOT NULL,
      PRIMARY KEY (player_id, unit_id)
    );

    CREATE TABLE IF NOT EXISTS ai_callback_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      params TEXT NOT NULL,
      subscribed_turn INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_pending_orders (
      player_id TEXT PRIMARY KEY,
      movement_orders TEXT NOT NULL,
      ranged_orders TEXT NOT NULL,
      strategy_text TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_combat_since_consultation (
      player_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      PRIMARY KEY (player_id, unit_id)
    );

    CREATE TABLE IF NOT EXISTS ai_loss_events_since_consultation (
      player_id TEXT NOT NULL,
      turn_number INTEGER NOT NULL,
      victim_unit_id TEXT NOT NULL,
      victim_player TEXT NOT NULL,
      cause TEXT NOT NULL,
      killer_ids_json TEXT NOT NULL,
      PRIMARY KEY (player_id, turn_number, victim_unit_id)
    );

    CREATE TABLE IF NOT EXISTS player_hex_intel (
      player_id TEXT NOT NULL,
      h3_index TEXT NOT NULL,
      seen_state TEXT NOT NULL CHECK (seen_state IN ('visible', 'stale', 'unexplored')),
      last_seen_turn INTEGER,
      PRIMARY KEY (player_id, h3_index)
    );

    CREATE TABLE IF NOT EXISTS player_unit_intel (
      player_id TEXT NOT NULL,
      enemy_unit_id TEXT NOT NULL,
      last_known_h3_index TEXT NOT NULL,
      intel_state TEXT NOT NULL CHECK (intel_state IN ('current', 'stale')),
      last_seen_turn INTEGER NOT NULL,
      stale_until_turn INTEGER,
      enemy_player TEXT,
      PRIMARY KEY (player_id, enemy_unit_id)
    );

    CREATE TABLE IF NOT EXISTS res_s_control (
      h3_index TEXT PRIMARY KEY,
      controller_player_id TEXT
    );

    CREATE TABLE IF NOT EXISTS res_s_build_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      h3_index TEXT NOT NULL,
      queue_index INTEGER NOT NULL,
      unit_type TEXT NOT NULL CHECK (unit_type IN ('infantry', 'armor', 'naval', 'air', 'missile', 'fortification', 'credits')),
      remaining_count INTEGER NOT NULL CHECK (remaining_count > 0),
      UNIQUE (h3_index, queue_index)
    );

    CREATE TABLE IF NOT EXISTS res_s_build_progress (
      h3_index TEXT PRIMARY KEY,
      stored_points INTEGER NOT NULL DEFAULT 0,
      keep_building INTEGER NOT NULL DEFAULT 0 CHECK (keep_building IN (0, 1)),
      keep_building_unit_type TEXT CHECK (
        keep_building_unit_type IS NULL
        OR keep_building_unit_type IN ('infantry', 'armor', 'naval', 'air', 'missile', 'fortification', 'credits')
      )
    );

    CREATE TABLE IF NOT EXISTS res_s_treasury (
      player_id TEXT PRIMARY KEY,
      credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0)
    );

    CREATE TABLE IF NOT EXISTS res_s_hire_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('raise', 'rehire')),
      h3_index TEXT NOT NULL,
      unit_type TEXT NOT NULL CHECK (unit_type IN ('infantry', 'armor', 'naval', 'air')),
      unit_count INTEGER NOT NULL CHECK (unit_count BETWEEN 1 AND 99),
      neutral_unit_id TEXT,
      created_turn INTEGER NOT NULL,
      reserved_credits INTEGER NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
      CHECK (
        (kind = 'raise' AND neutral_unit_id IS NULL)
        OR (kind = 'rehire' AND neutral_unit_id IS NOT NULL AND unit_count = 1)
      )
    );

    CREATE TABLE IF NOT EXISTS res_s_infrastructure (
      h3_index TEXT PRIMARY KEY,
      urban_hex_count INTEGER NOT NULL DEFAULT 0,
      airport_count INTEGER NOT NULL DEFAULT 0,
      seaport_count INTEGER NOT NULL DEFAULT 0,
      fortified_count INTEGER NOT NULL DEFAULT 0,
      fortifiable_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS res_t_feature_overrides (
      h3_index TEXT PRIMARY KEY,
      parent_h3_index TEXT NOT NULL,
      terrain_kind TEXT NOT NULL,
      is_urban INTEGER NOT NULL DEFAULT 0,
      is_airport INTEGER NOT NULL DEFAULT 0,
      is_seaport INTEGER NOT NULL DEFAULT 0,
      is_rubble INTEGER NOT NULL DEFAULT 0,
      is_fortified INTEGER NOT NULL DEFAULT 0,
      CHECK (is_fortified IN (0, 1) AND (is_fortified = 0 OR (is_urban = 1 AND is_rubble = 0)))
    );

    CREATE TABLE IF NOT EXISTS seats (
      seat_id TEXT PRIMARY KEY,
      seat_order INTEGER NOT NULL UNIQUE CHECK (seat_order BETWEEN 1 AND 4),
      kind TEXT NOT NULL CHECK (kind IN ('human', 'ai')),
      home_region TEXT NOT NULL,
      model_id TEXT,
      reasoning_effort TEXT,
      doctrine_choice TEXT CHECK (doctrine_choice IN ('aggressive', 'balanced', 'cautious', 'random')),
      doctrine TEXT CHECK (doctrine IN ('aggressive', 'balanced', 'cautious')),
      out_turn INTEGER,
      out_by TEXT,
      out_reasons TEXT NOT NULL DEFAULT '[]',
      place INTEGER,
      consultation_count INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS turn_notes_history (
      seat_id TEXT NOT NULL,
      scope TEXT NOT NULL CHECK(scope IN ('strategic', 'tactical')),
      battle_id TEXT NOT NULL DEFAULT '',
      turn_number INTEGER NOT NULL,
      strategy_text TEXT,
      message_text TEXT,
      own_loss_json TEXT,
      enemy_loss_json TEXT,
      PRIMARY KEY (seat_id, scope, battle_id, turn_number)
    );
  `;
}
