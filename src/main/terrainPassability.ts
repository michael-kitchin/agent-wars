/**
 * Main-process wrapper for pipeline terrain → passability with trace logging per call.
 * Keeps shared/pipelineTerrain free of Node logging so the renderer bundle stays clean.
 */

import { logTrace } from './logger';
import {
  pipelineTerrainToPassability as passabilityFromKind,
  type PassabilityTerrain,
  type PipelineTerrainKind,
} from '../shared/pipelineTerrain';

/**
 * Maps a pipeline terrain kind to DB/pathfinding passability (`water` → `water`, `coastal/wetlands` keep dual-domain passability, else `land`).
 * Logs at trace with the kind for troubleshooting seeding and tool code paths.
 */
export function pipelineTerrainToPassability(kind: PipelineTerrainKind): PassabilityTerrain {
  logTrace('terrainPassability pipelineTerrainToPassability', { kind });
  return passabilityFromKind(kind);
}
