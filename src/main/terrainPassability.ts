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
 * Defines the `pipelineTerrainToPassability` function shape (export function pipelineTerrainToPassability(kind: PipelineTerrainKind): PassabilityTerrain).

 * Purpose: Supports maintainability by documenting why `pipelineTerrainToPassability` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function pipelineTerrainToPassability(kind: PipelineTerrainKind): PassabilityTerrain {
  logTrace('terrainPassability pipelineTerrainToPassability', { kind });
  return passabilityFromKind(kind);
}
