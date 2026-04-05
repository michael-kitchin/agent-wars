import type { HumanOrderGroupPreviewResult } from '../../shared/ipcTypes';

/** One executed move (human or AI) for resolution-phase fade animation. */
export interface ResolutionMove {
  unitId: string;
  fromH3Index: string;
  toH3Index: string;
}

export interface ResolutionPlaybackMove {
  unitId: string;
  player: string;
  unitType: string;
  fromH3Index: string;
  toH3Index: string;
}

export interface HoverRoutePreviewState {
  hoveredH3Index: string;
  data: HumanOrderGroupPreviewResult;
}

export type PanDirection = 'north' | 'south' | 'west' | 'east';
