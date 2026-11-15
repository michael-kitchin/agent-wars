/**
 * Which match tables a frame includes, and which config rows it never includes.
 *
 * Purpose: A new table has to be classified here in the same change that adds it, or the policy test fails.
 * When to use: Building a frame, and reviewing a new table.
 * Expected outcome: Every match table is either copied into a frame or excluded with a reason.
 * Exceptions: None.
 */

import { MACHINE_LOCAL_CONFIG_KEYS } from '../gameDb/machineLocalConfigKeys';
import { SAVE_APP_VERSION_CONFIG_KEY, SAVE_WRITTEN_AT_CONFIG_KEY } from '../saveGame/saveFileFormat';

/**
 * How one table is treated in a frame.
 *
 * Contract: `frame` copies the table. `excluded` leaves it out and says why.
 * When to use: `MATCH_TABLE_RECORDING_POLICY`.
 * Expected outcome: One of the two modes.
 * Exceptions: None.
 */
export type TableRecordingPolicy =
  | { readonly mode: 'frame' }
  | { readonly mode: 'excluded'; readonly reason: string };

/**
 * The classification of every match table.
 *
 * Purpose: Frame capture iterates this object, and the policy test compares it with `sqlite_master`.
 * When to use: Adding a table, and building a frame. Key order is the order of tables in a frame.
 * Expected outcome: `hexes` and the two logs are excluded. Every other table is a frame table.
 * Exceptions: None.
 */
export const MATCH_TABLE_RECORDING_POLICY: Readonly<Record<string, TableRecordingPolicy>> = {
  hexes: { mode: 'excluded', reason: 'Terrain never changes during a match. The export writes it once.' },
  units: { mode: 'frame' },
  turn_state: { mode: 'frame' },
  pending_orders: { mode: 'frame' },
  pending_ranged_orders: { mode: 'frame' },
  pending_air_orders: { mode: 'frame' },
  pending_missile_launches: { mode: 'frame' },
  pending_ferry_orders: { mode: 'frame' },
  pending_air_drop_orders: { mode: 'frame' },
  unit_transport_assignments: { mode: 'frame' },
  game_config: { mode: 'frame' },
  ai_memory: { mode: 'frame' },
  standing_orders: { mode: 'frame' },
  ai_callback_subscriptions: { mode: 'frame' },
  ai_pending_orders: { mode: 'frame' },
  ai_combat_since_consultation: { mode: 'frame' },
  ai_loss_events_since_consultation: { mode: 'frame' },
  player_hex_intel: { mode: 'frame' },
  player_unit_intel: { mode: 'frame' },
  res_s_control: { mode: 'frame' },
  res_s_build_queue: { mode: 'frame' },
  res_s_build_progress: { mode: 'frame' },
  res_s_treasury: { mode: 'frame' },
  res_s_hire_orders: { mode: 'frame' },
  res_s_infrastructure: { mode: 'frame' },
  res_t_feature_overrides: { mode: 'frame' },
  seats: { mode: 'frame' },
  turn_notes_history: {
    mode: 'excluded',
    reason: 'A growing log. Strategies are commander_strategy events, and losses are found by comparing frames.',
  },
  match_records: { mode: 'excluded', reason: 'The recording itself.' },
};

/**
 * `game_config` keys that a frame and a recording must not contain.
 *
 * Purpose: Machine-local rows include API keys. The save-file stamps are not part of the match.
 * When to use: Filtering the `game_config` table while building a frame.
 * Expected outcome: Every `MACHINE_LOCAL_CONFIG_KEYS` entry, plus the two save stamps.
 * Exceptions: None.
 */
export const FRAME_EXCLUDED_CONFIG_KEYS: readonly string[] = [
  ...MACHINE_LOCAL_CONFIG_KEYS,
  SAVE_APP_VERSION_CONFIG_KEY,
  SAVE_WRITTEN_AT_CONFIG_KEY,
];
