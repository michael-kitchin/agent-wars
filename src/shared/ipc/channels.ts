/**
 * Single source of truth for Electron IPC channel strings between the main process,
 * preload bridge, and tests. Prevents drift and typos across process boundaries.
 *
 * When renaming a channel, perform a hard cutover in one batch: update every reference
 * (main `ipcMain.handle`, preload `invoke`/`on`, and any listeners) with no compatibility aliases.
 */

/** Main ↔ renderer game API (`ipcMain.handle` / `ipcRenderer.invoke`). */
export const IPC_GAME = {
  getState: 'game:getState',
  getTacticalTerrainOverrides: 'game:getRes4TerrainOverrides',
  getTacticalCityOverlays: 'game:getRes4CityOverlays',
  getTacticalRoadRailOverlays: 'game:getRes4RoadRailOverlays',
  getTacticalTransportVectorOverlays: 'game:getRes4TransportVectorOverlays',
  getStrategicBaselineUrbanHexCounts: 'game:getRes1BaselineUrbanHexCounts',
  getHexNamingTooltipLine: 'game:getHexNamingTooltipLine',
  getHexContinentNames: 'game:getHexContinentNames',
  listScenarioHomeRegions: 'game:listScenarioHomeRegions',
  newGame: 'game:newGame',
  submitOrders: 'game:submitOrders',
  listHumanStandingOrders: 'game:listHumanStandingOrders',
  previewHumanMarchOrder: 'game:previewHumanMarchOrder',
  previewHumanMarchOrders: 'game:previewHumanMarchOrders',
  assignHumanMarchOrder: 'game:assignHumanMarchOrder',
  assignHumanMarchOrders: 'game:assignHumanMarchOrders',
  commitHumanTacticalDraftOrders: 'game:commitHumanTacticalDraftOrders',
  validateGroupRangedTarget: 'game:validateGroupRangedTarget',
  validateGroupAirStrikeTarget: 'game:validateGroupAirStrikeTarget',
  validateGroupFerryTarget: 'game:validateGroupFerryTarget',
  cancelHumanStandingOrder: 'game:cancelHumanStandingOrder',
  getHexBuildQueue: 'game:getHexBuildQueue',
  addHexBuildQueueEntry: 'game:addHexBuildQueueEntry',
  updateHexBuildQueueEntry: 'game:updateHexBuildQueueEntry',
  removeHexBuildQueueEntry: 'game:removeHexBuildQueueEntry',
  applyBuildQueueTemplateToHexes: 'game:applyBuildQueueTemplateToHexes',
  setHexesKeepBuilding: 'game:setHexesKeepBuilding',
  getSealiftStackState: 'game:getSealiftStackState',
  getTacticalSealiftStackState: 'game:getTacticalSealiftStackState',
  updateTacticalSealiftSlot: 'game:updateTacticalSealiftSlot',
  updateSealiftSlot: 'game:updateSealiftSlot',
  startTacticalBattle: 'game:startTacticalBattle',
  endTacticalBattle: 'game:endTacticalBattle',
  ready: 'game:ready',
  resolveMeleeIntercept: 'game:resolveMeleeIntercept',
  /**
   * Renderer signals resolution canvas playback finished so main can run deferred event-driven post-resolution LLM work.
   */
  notifyResolutionPlaybackComplete: 'game:notifyResolutionPlaybackComplete',
  /**
   * Main pushes strategic post-resolution consult results after deferred `runEventDrivenAfterResolutionConsultation`.
   */
  postResolutionConsultation: 'game:postResolutionConsultation',
  /**
   * Main pushes tactical post-beat consult after deferred `runEventDrivenAfterTacticalBeatConsultation`.
   */
  postTacticalBeatConsultation: 'game:postTacticalBeatConsultation',
  requestAiOrders: 'game:requestAiOrders',
  cancelRequestAiOrders: 'game:cancelRequestAiOrders',
} as const;

/** OpenRouter settings and logging (`ipcMain.handle` / `ipcRenderer.invoke` / `webContents.send`). */
export const IPC_OPENROUTER = {
  log: 'openRouter:log',
  getToolGroupList: 'openRouter:getToolGroupList',
  getKey: 'openRouter:getKey',
  getSelectedModel: 'openRouter:getSelectedModel',
  setKey: 'openRouter:setKey',
  listModels: 'openRouter:listModels',
  setSelectedModel: 'openRouter:setSelectedModel',
  getSelectedReasoningEffort: 'openRouter:getSelectedReasoningEffort',
  setSelectedReasoningEffort: 'openRouter:setSelectedReasoningEffort',
} as const;
