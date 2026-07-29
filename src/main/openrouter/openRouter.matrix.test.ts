/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-function-type -- dynamic require + Module._load typing for Electron mock */
/**
 * Matrix tests for requestOrders prompt/tool payload construction across all 8 UI toggles:
 * precomputation, events, planning, assessment, estimation, memory, orders, production.
 *
 * Verifies for all 256 combinations:
 * - The system prompt contains enabled tool names and omits disabled ones.
 * - The OpenRouter API payload tools[] includes only enabled API tools.
 * - Each included tool has an object-typed parameters schema (tool argument contract sent to API).
 * - The "events" toggle does not affect API tool list or prompt tool section.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Module = require('module');
import type { AirStrikeOrder, FerryOrder } from '../../shared/ipcTypes';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import {
  REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET,
  REGION_VS_REGION_SCENARIO_WIN_URBAN_SNIPPET,
  WIN_CONDITION_REMINDER_FIRST_SENTENCE,
} from './scenarioGoals';

/**
 * Documents the `ChatResponse` type alias (type ChatResponse).

 * Purpose: Supports maintainability by documenting why `ChatResponse` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type ChatResponse = {
    /**
   * Specifies the contract for the `id` member (id?: string;).

   * Contract: Describes stable behavior for callers of `id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
id?: string;
    /**
   * Specifies the contract for the `choices` member (choices: Array<{ message?: { content?: string; tool_calls?: unknown[] } }>;).

   * Contract: Describes stable behavior for callers of `choices` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
choices: Array<{ message?: { content?: string; tool_calls?: unknown[] } }>;
    /**
   * Specifies the contract for the `usage` member (usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };).

   * Contract: Describes stable behavior for callers of `usage` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
};

/**
 * Defines the `installElectronMock` function shape (function installElectronMock(userDataDir: string): () => void).

 * Purpose: Supports maintainability by documenting why `installElectronMock` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function installElectronMock(userDataDir: string): () => void {
  const originalLoad = (Module as unknown as { _load: Function })._load;
  (Module as unknown as { _load: Function })._load = function patchedLoad(
    request: string,
    parent: unknown,
    isMain: boolean
  ) {
    if (request === 'electron') {
      return {
        app: {
          getPath: (name: string) => (name === 'userData' ? userDataDir : userDataDir),
        },
        safeStorage: {
          isEncryptionAvailable: () => false,
          encryptString: (s: string) => Buffer.from(s, 'utf8'),
          decryptString: (b: Buffer) => b.toString('utf8'),
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  return () => {
    (Module as unknown as { _load: Function })._load = originalLoad;
  };
}

/**
 * Defines the `buildFixtureState` function shape (function buildFixtureState(hexes: string[]): { hexes: { h3Index: string; terrain: string; terrainKind: string }[]; units: { id: string; player: string; un).

 * Purpose: Supports maintainability by documenting why `buildFixtureState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildFixtureState(hexes: string[]): {
  hexes: { h3Index: string; terrain: string; terrainKind: string }[];
  units: { id: string; player: string; unitType: string; h3Index: string }[];
  exploredHexes: string[];
  res1Control: { h3Index: string; controllerPlayerId: string | null }[];
  scenarioId: 'region_vs_region';
  humanHomeRegion: string;
  aiHomeRegion: string;
  humanHomeRegionHexes: string[];
  aiHomeRegionHexes: string[];
  intersectingHomeRegionHexes: string[];
  phase: 'planning';
  turnNumber: number;
  pendingOrders: { unitId: string; toH3Index: string }[];
} {
  return {
    hexes: hexes.map((h3Index) => ({ h3Index, terrain: 'land', terrainKind: 'plains' })),
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: hexes[0]! },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: hexes[1]! },
    ],
    exploredHexes: [hexes[0]!, hexes[1]!, hexes[2]!],
    res1Control: [
      { h3Index: hexes[0]!, controllerPlayerId: 'opponent' },
      { h3Index: hexes[1]!, controllerPlayerId: 'opponent' },
      { h3Index: hexes[2]!, controllerPlayerId: 'human' },
    ],
    scenarioId: 'region_vs_region',
    humanHomeRegion: 'Northern America',
    aiHomeRegion: 'Eastern Europe',
    humanHomeRegionHexes: [hexes[1]!, hexes[2]!],
    aiHomeRegionHexes: [hexes[0]!, hexes[1]!],
    intersectingHomeRegionHexes: [hexes[1]!],
    phase: 'planning',
    turnNumber: 7,
    pendingOrders: [],
  };
}

/**
 * Documents the `CapturedPayload` type alias (type CapturedPayload).

 * Purpose: Supports maintainability by documenting why `CapturedPayload` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type CapturedPayload = {
    /**
   * Specifies the contract for the `model` member (model?: string;).

   * Contract: Describes stable behavior for callers of `model` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
model?: string;
    /**
   * Specifies the contract for the `messages` member (messages?: Array<{ role: string; content?: string }>;).

   * Contract: Describes stable behavior for callers of `messages` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
messages?: Array<{ role: string; content?: string }>;
    /**
   * Specifies the contract for the `tools` member (tools?: Array<{ type: string; function: { name: string; description: string; parameters: { type?: string; properties?: Record<string, unknown> } };).

   * Contract: Describes stable behavior for callers of `tools` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
tools?: Array<{
    type: string;
    function: { name: string; description: string; parameters: { type?: string; properties?: Record<string, unknown> } };
  }>;
};

/**
 * Defines the `assertPromptAvoidsPlayerFacingUnitLabels` function shape (function assertPromptAvoidsPlayerFacingUnitLabels(systemPrompt: string, mask: number): void).

 * Purpose: Supports maintainability by documenting why `assertPromptAvoidsPlayerFacingUnitLabels` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function assertPromptAvoidsPlayerFacingUnitLabels(systemPrompt: string, mask: number): void {
  assert.ok(
    !systemPrompt.includes('(AI)') && !systemPrompt.includes('(human)'),
    `system prompt should avoid player-facing AI/human suffixes, mask=${mask}`
  );
  assert.ok(
    !systemPrompt.includes('I Infantry') && !systemPrompt.includes('II Infantry') && !systemPrompt.includes('1st Infantry'),
    `system prompt should avoid player-facing unit display labels, mask=${mask}`
  );
}

/**
 * Defines the `run` function shape (async function run(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function run(): Promise<void> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-openrouter-test-'));
  const restoreElectron = installElectronMock(userDataDir);
  try {
    const openRouter = require('./openRouter') as {
      saveKey: (key: string) => void;
      setSelectedModel: (modelId: string) => void;
      setChatTransportOverrideForTests: (override: (payload: {
        key: string;
        body: Record<string, unknown>;
        signal?: AbortSignal;
        onLog?: (line: string, isError?: boolean) => void;
        requestLabel: string;
      }) => Promise<{ ok: true; status: number; headers: Record<string, string>; bodyText: string } | { ok: false; error: string }> | null) => void;
      requestOrders: (
        state: unknown,
        modelId: string,
        options: { enabledToolNames: string[]; usePrecomputation: boolean }
      ) => Promise<{
        success: boolean;
        airStrikes?: AirStrikeOrder[];
        ferryOrders?: FerryOrder[];
      }>;
      getToolNamesForEnabledGroups: (ids: string[]) => string[];
    };
    const mapData = require('../mapData') as {
      getOrderedHexList: () => string[];
      H3_RESOLUTION: number;
    };

    openRouter.saveKey('test-key');
    openRouter.setSelectedModel('test-model');

    const allHexes = mapData.getOrderedHexList().slice(0, 8);
    const state = buildFixtureState(allHexes);

    const uiToggleIds = ['precomputation', 'events', 'planning', 'assessment', 'estimation', 'memory', 'orders', 'production'] as const;
    const apiToggleIds = ['precomputation', 'planning', 'assessment', 'estimation', 'memory', 'orders', 'production'];
    const allApiToolNames = new Set(openRouter.getToolNamesForEnabledGroups(apiToggleIds));

    let combosChecked = 0;
    for (let mask = 0; mask < 1 << uiToggleIds.length; mask++) {
      const enabledUiIds = uiToggleIds.filter((_, idx) => (mask & (1 << idx)) !== 0);
      const enabledToolNames = openRouter.getToolNamesForEnabledGroups(enabledUiIds as unknown as string[]);
      const usePrecomputation = enabledUiIds.includes('precomputation');
      const precomputationExcluded = new Set(['assess_unit', 'assess_hex', 'estimate_combat']);
      const effectiveToolSet = new Set(
        usePrecomputation ? enabledToolNames.filter((n) => !precomputationExcluded.has(n)) : enabledToolNames
      );

      const capturedRef: { value: CapturedPayload | null } = { value: null };
      const fakeResponse: ChatResponse = {
        choices: [{ message: { content: '{"strategy":"hold","orders":[]}' } }],
      };
      openRouter.setChatTransportOverrideForTests(async (payload) => {
        capturedRef.value = payload.body as CapturedPayload;
        return {
          ok: true,
          status: 200,
          headers: {},
          bodyText: JSON.stringify(fakeResponse),
        };
      });

      const result = await openRouter.requestOrders(state, 'test-model', {
        enabledToolNames,
        usePrecomputation,
      });
      assert.strictEqual(result.success, true, `requestOrders failed for mask=${mask}`);
      if (!capturedRef.value) throw new Error(`no API payload captured for mask=${mask}`);
      const captured = capturedRef.value;

      const systemPrompt = captured.messages?.find((m: { role: string; content?: string }) => m.role === 'system')?.content ?? '';
      const payloadTools = captured.tools ?? [];
      const payloadToolNames = new Set(payloadTools.map((t: { function: { name: string } }) => t.function.name));

      assert.ok(
        systemPrompt.includes('Strict schema: top-level must be a JSON object with "strategy" (string) and "orders" (array); do not return a top-level array.'),
        `strict-schema prompt guidance missing for mask=${mask}`
      );
      assert.ok(systemPrompt.includes('# Air Operations Status'), `air-ops status guidance missing for mask=${mask}`);
      assert.ok(
        systemPrompt.includes(
          `Air rules: strike range ${AIR_STRIKE_RANGE_HEXES} from base, ferry range ${AIR_FERRY_RANGE_HEXES} airport-to-airport, one air action per unit per turn.`
        ),
        `air-ops rules guidance missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('Optional top-level air actions: airStrikes[] entries use'),
        `air-strike JSON contract guidance missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('ferryOrders[] entries use { "unitId": "...", "destination": "<hex code>" }'),
        `ferry JSON contract guidance missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes(`Global Earth map, H3 resolution ${mapData.H3_RESOLUTION}`),
        `global-map context guidance missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes(
          'At least one enemy unit remains in play, and the human player is actively searching for your forces with intent to destroy them.'
        ),
        `enemy-intent strategic context missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('You are the enemy commander in a WEGO'),
        `enemy-commander role opening missing for mask=${mask}`
      );
      assert.ok(
        !systemPrompt.includes('Move toward observed enemy forces to bring them into ranged'),
        `removed passive-movement coaching should not appear for mask=${mask}`
      );
      assert.ok(systemPrompt.includes(WIN_CONDITION_REMINDER_FIRST_SENTENCE), `win-condition reminder paragraph missing for mask=${mask}`);
      assert.ok(systemPrompt.includes('- Your goals are:'), `goals coaching header missing for mask=${mask}`);
      assert.ok(
        systemPrompt.includes('(1) Engage enemy forces to reduce their combat effectiveness'),
        `goal (1) coaching missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('(2) Disperse your units to maximize visibility'),
        `goal (2) coaching missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('(3) Maximize your own unit production'),
        `goal (3) coaching missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes("(4) Protect your home region's production capacity"),
        `goal (4) coaching missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes("(5) Degrade or eliminate the enemy home region's urban production capacity"),
        `goal (5) coaching missing for mask=${mask}`
      );
      assert.ok(systemPrompt.includes('- Your strategy is:'), `strategy coaching header missing for mask=${mask}`);
      assert.ok(
        systemPrompt.includes('(1) Use speed, surprise, and initiative to break the enemy\'s cohesion and morale'),
        `strategy (1) coaching missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('(2) Attack the enemy\'s weaknesses (gaps) and avoid their strengths (surfaces)'),
        `strategy (2) coaching missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('(3) Create maximum disruption with minimum force'),
        `strategy (3) coaching missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('- Explored: 3 of 8 land hexes (38%)'),
        `explored-land progress metric missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('- Controlled: 2 of 8 land hexes (25%)'),
        `controlled-land progress metric missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('- Your home region control: 2 of 2 hexes (100%)'),
        `own-home-region ownership summary missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes("- Your control of the enemy's home region: 1 of 2 hexes (50%)"),
        `enemy-home-region ownership summary missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('Your home region hexes are:'),
        `AI-exclusive home region hex list missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes("Your enemy's home region hexes are:"),
        `human-exclusive home region hex list missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('These hexes are in both home regions:'),
        `overlapping home region hex list missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('# Scenario Objective (Required)'),
        `required scenario objective section missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('Scenario: region_vs_region'),
        `scenario id guidance missing for mask=${mask}`
      );
      assert.ok(systemPrompt.includes(REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET), `region-vs-region win condition (enemy home) missing for mask=${mask}`);
      assert.ok(systemPrompt.includes(REGION_VS_REGION_SCENARIO_WIN_URBAN_SNIPPET), `region-vs-region win condition (urban elimination) missing for mask=${mask}`);
      assert.ok(
        systemPrompt.includes('Your home region: Eastern Europe'),
        `AI home-region guidance missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('Enemy home region: Northern America'),
        `human home-region guidance missing for mask=${mask}`
      );
      assert.ok(
        !systemPrompt.includes('Opponent home region:'),
        `legacy Opponent home region label should not appear for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('Never emit raw H3 strings or latitude/longitude pairs'),
        `hex-code exclusivity guidance missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('Example (illustrative only'),
        `final JSON example block missing for mask=${mask}`
      );
      assertPromptAvoidsPlayerFacingUnitLabels(systemPrompt, mask);

      for (const toolName of allApiToolNames) {
        const shouldBeEnabled = effectiveToolSet.has(toolName);
        const promptHasToolName = systemPrompt.includes(`${toolName}(`);
        assert.strictEqual(
          promptHasToolName,
          shouldBeEnabled,
          `prompt tool-name mismatch for ${toolName}, mask=${mask}, enabledUi=${enabledUiIds.join(',')}`
        );
        assert.strictEqual(
          payloadToolNames.has(toolName),
          shouldBeEnabled,
          `API tools[] mismatch for ${toolName}, mask=${mask}, enabledUi=${enabledUiIds.join(',')}`
        );
      }

      for (const t of payloadTools) {
        assert.strictEqual(t.type, 'function', `tool type mismatch for ${t.function.name}, mask=${mask}`);
        assert.strictEqual(
          t.function.parameters?.type,
          'object',
          `tool parameters.type mismatch for ${t.function.name}, mask=${mask}`
        );
        assert.ok(
          typeof t.function.parameters?.properties === 'object',
          `tool parameters.properties missing for ${t.function.name}, mask=${mask}`
        );
      }

      // Events toggle is UI-only: it must not appear as an API tool and must not affect enabled API tool names.
      assert.strictEqual(payloadToolNames.has('events'), false, `events appeared in API tools[], mask=${mask}`);
      assert.strictEqual(systemPrompt.includes('events('), false, `events appeared as API tool in prompt, mask=${mask}`);

      combosChecked += 1;
    }

    const strictSchemaErrorResponse: ChatResponse = {
      choices: [{ message: { content: '[{"unitId":"opponent-armor-1","action":"explicit_move","destination":[0,0]}]' } }],
    };
    openRouter.setChatTransportOverrideForTests(async () => {
      return {
        ok: true,
        status: 200,
        headers: {},
        bodyText: JSON.stringify(strictSchemaErrorResponse),
      };
    });
    const strictResult = await openRouter.requestOrders(state, 'test-model', {
      enabledToolNames: openRouter.getToolNamesForEnabledGroups(apiToggleIds),
      usePrecomputation: false,
    });
    assert.strictEqual(strictResult.success, false, 'strict schema should reject top-level array responses');

    const hexCoordsMod = require('../briefing/map/hex-coordinates') as { ensureStrategicCoordinateRegistryInitialized: () => void };
    const hexCodeTranslator = require('../briefing/map/hex-code-translator') as {
      h3ToCode: (h3Index: string, context: { mode: 'strategic' }) => string;
    };
    hexCoordsMod.ensureStrategicCoordinateRegistryInitialized();
    const strategicCtx = { mode: 'strategic' as const };
    const ferryDestCode = hexCodeTranslator.h3ToCode(allHexes[2]!, strategicCtx);

    const airOrdersResponse: ChatResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              strategy: 'air pressure',
              orders: [],
              airStrikes: [
                { unitId: 'opponent-air-1', targetUnitId: 'human-infantry-1', targetType: 'units' },
              ],
              ferryOrders: [{ unitId: 'opponent-air-2', destination: ferryDestCode }],
            }),
          },
        },
      ],
    };
    openRouter.setChatTransportOverrideForTests(async () => {
      return {
        ok: true,
        status: 200,
        headers: {},
        bodyText: JSON.stringify(airOrdersResponse),
      };
    });
    const airResult = await openRouter.requestOrders(state, 'test-model', {
      enabledToolNames: openRouter.getToolNamesForEnabledGroups(apiToggleIds),
      usePrecomputation: false,
    });
    assert.strictEqual(airResult.success, true, 'valid air action JSON should parse successfully');
    assert.strictEqual(airResult.airStrikes?.length ?? 0, 1, 'air strike entries should carry through model JSON parsing');
    assert.strictEqual(airResult.ferryOrders?.length ?? 0, 1, 'ferry entries should carry through model JSON parsing');

    const buildSystemPromptModule = require('./openRouterBuildSystemPrompt') as {
      buildSystemPromptForTools: (
        st: typeof state,
        cm: {
          latLngByH3: Map<string, [number, number]>;
          format: (h: string) => string;
          resolveToH3: (lat: number, lng: number) => string | undefined;
        },
        tools?: string[],
        briefing?: string,
        ctx?: { mode: 'strategic' | 'tactical'; battleId?: string }
      ) => string;
    };
    const mapDataForTactical = require('../mapData') as {
      buildLatLngCoordinateMap: (hexes: string[]) => {
        latLngByH3: Map<string, [number, number]>;
        resolveToH3: (lat: number, lng: number) => string | undefined;
      };
    };
    const { latLngByH3: llTac, resolveToH3: rTac } = mapDataForTactical.buildLatLngCoordinateMap(allHexes);
    const tacticalCoordMap = {
      latLngByH3: llTac,
      resolveToH3: rTac,
      format: (h3: string) => hexCodeTranslator.h3ToCode(h3, strategicCtx),
    };
    const tacticalSystemPrompt = buildSystemPromptModule.buildSystemPromptForTools(
      state,
      tacticalCoordMap,
      openRouter.getToolNamesForEnabledGroups(apiToggleIds),
      '# Brief\n\n## Operational Map\n\n```\nx\n```\n',
      { mode: 'tactical', battleId: 'matrix-tactical-contract' }
    );
    assert.ok(
      !tacticalSystemPrompt.includes(
        'At least one enemy unit remains in play, and the human player is actively searching for your forces with intent to destroy them.'
      ),
      'tactical prompt omits strategic-only enemy-search opening line'
    );
    assert.ok(!tacticalSystemPrompt.includes('- Explored:'), 'tactical system prompt omits explored land bullet');
    assert.ok(!tacticalSystemPrompt.includes('- Controlled:'), 'tactical system prompt omits controlled land bullet');
    assert.ok(!tacticalSystemPrompt.includes('Your home region control'), 'tactical prompt omits home region control progress');
    assert.ok(
      !tacticalSystemPrompt.includes("Your control of the enemy's home region"),
      'tactical prompt omits enemy-home control progress'
    );
    assert.ok(
      !tacticalSystemPrompt.includes('Move toward observed enemy forces to bring them into ranged'),
      'tactical prompt omits removed passive-movement coaching'
    );
    assert.ok(tacticalSystemPrompt.includes(WIN_CONDITION_REMINDER_FIRST_SENTENCE), 'tactical prompt includes win-condition reminder');
    assert.ok(
      tacticalSystemPrompt.includes('- Your priority is to engage enemy forces and inflict losses when advantageous'),
      'tactical prompt includes single engage priority'
    );
    assert.ok(tacticalSystemPrompt.includes('- Your strategy is:'), 'tactical prompt includes strategy coaching');
    assert.ok(
      !tacticalSystemPrompt.includes('(4) Protect your home region'),
      'tactical prompt omits strategic five-goal list'
    );
    assert.ok(
      !tacticalSystemPrompt.includes('# Scenario Objective (Required)'),
      'tactical prompt omits Scenario Objective section'
    );
    assert.ok(
      tacticalSystemPrompt.includes('tactical sub-unit ids'),
      'tactical prompt JSON contract mentions sub-unit callback ids'
    );
    assert.ok(
      !tacticalSystemPrompt.includes('prioritize scouting this turn'),
      'tactical prompt omits strategic scouting directive'
    );

    console.log(`openRouter.matrix.test.ts passed (${combosChecked} combinations)`);
  } finally {
    const openRouter = require('./openRouter') as { setChatTransportOverrideForTests: (override: null) => void };
    openRouter.setChatTransportOverrideForTests(null);
    restoreElectron();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

