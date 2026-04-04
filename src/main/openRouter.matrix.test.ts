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
import type { AirStrikeOrder, FerryOrder } from '../shared/ipcTypes';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../shared/tacticalRanges';

type ChatResponse = {
  id?: string;
  choices: Array<{ message?: { content?: string; tool_calls?: unknown[] } }>;
  usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
};

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

function buildFixtureState(hexes: string[]): {
  hexes: { h3Index: string; terrain: string; terrainKind: string }[];
  units: { id: string; player: string; unitType: string; h3Index: string }[];
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
    phase: 'planning',
    turnNumber: 7,
    pendingOrders: [],
  };
}

type CapturedPayload = {
  model?: string;
  messages?: Array<{ role: string; content?: string }>;
  tools?: Array<{
    type: string;
    function: { name: string; description: string; parameters: { type?: string; properties?: Record<string, unknown> } };
  }>;
};

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

async function run(): Promise<void> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-openrouter-test-'));
  const restoreElectron = installElectronMock(userDataDir);
  const originalFetch = (globalThis as unknown as { fetch?: unknown }).fetch;
  try {
    const openRouter = require('./openRouter') as {
      saveKey: (key: string) => void;
      setSelectedModel: (modelId: string) => void;
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
    const mapData = require('./mapData') as {
      getOrderedHexList: () => string[];
      H3_RESOLUTION: number;
      LATLNG_DECIMAL_PLACES: number;
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
      (globalThis as unknown as { fetch: unknown }).fetch = (async (_url: unknown, init?: unknown) => {
        const body = (init as { body?: string } | undefined)?.body ?? '{}';
        capturedRef.value = JSON.parse(body) as CapturedPayload;
        return {
          ok: true,
          status: 200,
          json: async () => fakeResponse,
          text: async () => JSON.stringify(fakeResponse),
        };
      }) as unknown;

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
      assert.ok(systemPrompt.includes('=== AIR OPERATIONS STATUS ==='), `air-ops status guidance missing for mask=${mask}`);
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
        systemPrompt.includes('ferryOrders[] entries use { "unitId": "...", "destination": [lat,lng] }'),
        `ferry JSON contract guidance missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes(`Map context: global Earth map (H3 resolution ${mapData.H3_RESOLUTION}), not a local/contrived arena.`),
        `global-map context guidance missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes(`rounded to ${mapData.LATLNG_DECIMAL_PLACES} decimal places`),
        `lat/lng precision guidance missing for mask=${mask}`
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
    (globalThis as unknown as { fetch: unknown }).fetch = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => strictSchemaErrorResponse,
        text: async () => JSON.stringify(strictSchemaErrorResponse),
      };
    }) as unknown;
    const strictResult = await openRouter.requestOrders(state, 'test-model', {
      enabledToolNames: openRouter.getToolNamesForEnabledGroups(apiToggleIds),
      usePrecomputation: false,
    });
    assert.strictEqual(strictResult.success, false, 'strict schema should reject top-level array responses');

    const airOrdersResponse: ChatResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              strategy: 'air pressure',
              orders: [],
              airStrikes: [
                { unitId: 'opponent-air-1', targetHex: [83.66, -7.32], targetType: 'units' },
              ],
              ferryOrders: [
                { unitId: 'opponent-air-2', destination: [79.24, 38.02] },
              ],
            }),
          },
        },
      ],
    };
    (globalThis as unknown as { fetch: unknown }).fetch = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => airOrdersResponse,
        text: async () => JSON.stringify(airOrdersResponse),
      };
    }) as unknown;
    const airResult = await openRouter.requestOrders(state, 'test-model', {
      enabledToolNames: openRouter.getToolNamesForEnabledGroups(apiToggleIds),
      usePrecomputation: false,
    });
    assert.strictEqual(airResult.success, true, 'valid air action JSON should parse successfully');
    assert.strictEqual(airResult.airStrikes?.length ?? 0, 1, 'air strike entries should carry through model JSON parsing');
    assert.strictEqual(airResult.ferryOrders?.length ?? 0, 1, 'ferry entries should carry through model JSON parsing');

    console.log(`openRouter.matrix.test.ts passed (${combosChecked} combinations)`);
  } finally {
    if (originalFetch === undefined) {
      delete (globalThis as unknown as { fetch?: unknown }).fetch;
    } else {
      (globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
    }
    restoreElectron();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

