/* eslint-disable @typescript-eslint/no-require-imports -- dynamic require of the order-flow module */
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
import type { AirStrikeOrder, FerryOrder } from '../../shared/ipcTypes';
import {
  REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET,
  REGION_VS_REGION_SCENARIO_WIN_URBAN_SNIPPET,
  WIN_CONDITION_REMINDER_FIRST_SENTENCE,
} from './scenarioGoals';
import {
  SECTION_TITLE_PRODUCTION_STATUS,
  SECTION_TITLE_STANDING_ORDER_STATUS,
  SECTION_TITLE_STRATEGIC_MEMORY,
} from './promptSpec/sectionHeadings';
import { PRODUCTION_CAP_QUEUE_GUIDANCE } from '../productionCaps';
import { CONSULT_SITUATION_LEAD_IN } from './consultPromptMessages';
import { buildFixtureState, installElectronMock } from './openRouterTestHelpers';

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
        options: { seatId: 'opponent'; enabledToolNames: string[]; usePrecomputation: boolean }
      ) => Promise<{
        success: boolean;
        airStrikes?: AirStrikeOrder[];
        ferryOrders?: FerryOrder[];
        dropReasons?: string[];
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
      const afterPrecomputation = usePrecomputation
        ? enabledToolNames.filter((name) => !precomputationExcluded.has(name))
        : enabledToolNames;
      const effectiveToolSet = new Set(afterPrecomputation);

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
        seatId: 'opponent',
        enabledToolNames,
        usePrecomputation,
      });
      assert.strictEqual(result.success, true, `requestOrders failed for mask=${mask}`);
      if (!capturedRef.value) throw new Error(`no API payload captured for mask=${mask}`);
      const captured = capturedRef.value;

      const systemMessage = captured.messages?.find((m: { role: string; content?: string }) => m.role === 'system')?.content ?? '';
      const userMessages = (captured.messages ?? []).filter((m: { role: string }) => m.role === 'user');
      const situationMessage = userMessages[1]?.content ?? userMessages[0]?.content ?? '';
      assert.equal(userMessages[0]?.content, CONSULT_SITUATION_LEAD_IN, `lead-in missing for mask=${mask}`);
      const systemPrompt = `${systemMessage}\n\n${situationMessage}`;
      const userPrompt = situationMessage;
      const payloadTools = captured.tools ?? [];
      const payloadToolNames = new Set(payloadTools.map((t: { function: { name: string } }) => t.function.name));
      const memoryOn = enabledUiIds.includes('memory');
      const productionOn = enabledUiIds.includes('production');
      const ordersOn = enabledUiIds.includes('orders');
      if (!memoryOn) {
        assert.ok(
          !systemPrompt.includes(`# ${SECTION_TITLE_STRATEGIC_MEMORY}`),
          `memory section must vanish when the group is off, mask=${mask}`
        );
        assert.ok(
          !systemPrompt.includes('Do not persist enemy positions'),
          `memory coaching must vanish when the group is off, mask=${mask}`
        );
      } else {
        assert.ok(
          systemPrompt.includes(`# ${SECTION_TITLE_STRATEGIC_MEMORY}`),
          `memory section must appear when the group is on, mask=${mask}`
        );
      }
      if (!productionOn) {
        assert.ok(
          !systemPrompt.includes(`# ${SECTION_TITLE_PRODUCTION_STATUS}`),
          `production section must vanish when the group is off, mask=${mask}`
        );
        assert.ok(
          !systemPrompt.includes('productionOrders'),
          `production envelope tail must vanish when the group is off, mask=${mask}`
        );
        assert.ok(
          !systemPrompt.includes('queue is empty, queue something'),
          `production coaching must vanish when the group is off, mask=${mask}`
        );
      } else {
        assert.ok(
          systemPrompt.includes(`# ${SECTION_TITLE_PRODUCTION_STATUS}`),
          `production section must appear when the group is on, mask=${mask}`
        );
      }
      if (!ordersOn) {
        assert.ok(
          !systemPrompt.includes(`# ${SECTION_TITLE_STANDING_ORDER_STATUS}`),
          `standing-order section must vanish when the group is off, mask=${mask}`
        );
        assert.ok(
          !systemPrompt.includes('Units Without Standing Orders'),
          `orderless coaching must vanish when the group is off, mask=${mask}`
        );
      } else {
        assert.ok(
          systemPrompt.includes(`# ${SECTION_TITLE_STANDING_ORDER_STATUS}`),
          `standing-order section must appear when the group is on, mask=${mask}`
        );
      }
      assert.ok(
        !userPrompt.includes(PRODUCTION_CAP_QUEUE_GUIDANCE),
        `opening user message must not restate production cap rules, mask=${mask}`
      );

      assert.ok(
        systemPrompt.includes('Strict schema: top-level must be a JSON object with "message" (string), "strategy" (string) and "orders" (array); do not return a top-level array.'),
        `strict-schema prompt guidance missing for mask=${mask}`
      );
      const hasAir = state.units.some((u) => u.player === 'opponent' && u.unitType === 'air');
      const hasNaval = state.units.some((u) => u.player === 'opponent' && u.unitType === 'naval');
      if (hasAir) {
        assert.ok(systemPrompt.includes('# Air Operations Status'), `air-ops status guidance missing for mask=${mask}`);
        assert.ok(
          systemPrompt.includes('hopping controlled intact airports') &&
            systemPrompt.includes('plan_route confirms the chain'),
          `air-ops rules guidance missing for mask=${mask}`
        );
        assert.ok(
          systemPrompt.includes('Optional top-level air actions: airStrikes[] entries use'),
          `air-strike JSON contract guidance missing for mask=${mask}`
        );
        assert.ok(
          systemPrompt.includes('ferryOrders[] entries use { "unitId" or "unitIds", "destination": "<hex code>" }'),
          `ferry JSON contract guidance missing for mask=${mask}`
        );
      } else {
        assert.ok(!systemPrompt.includes('# Air Operations Status'), `air-ops section must be omitted when roster has no air, mask=${mask}`);
        assert.ok(!systemPrompt.includes('airStrikes'), `airStrikes must be omitted when roster has no air, mask=${mask}`);
      }
      if (hasNaval || hasAir) {
        assert.ok(systemPrompt.includes('# Naval Transport Status'), `naval transport missing for mask=${mask}`);
      } else {
        assert.ok(!systemPrompt.includes('# Naval Transport Status'), `naval section must be omitted when roster has no naval and no air, mask=${mask}`);
      }
      if (hasNaval) {
        assert.ok(systemPrompt.includes('transport_move'), `sealift actions missing for mask=${mask}`);
      } else {
        assert.ok(!systemPrompt.includes('transport_move'), `transport_move must be omitted when roster has no naval, mask=${mask}`);
      }
      assert.ok(
        systemPrompt.includes(`Global Earth map, H3 resolution ${mapData.H3_RESOLUTION}`),
        `global-map context guidance missing for mask=${mask}`
      );
      assert.ok(
        !systemPrompt.includes(
          'At least one enemy unit remains in play, and the human player is actively searching for your forces with intent to destroy them.'
        ),
        `unconditional enemy-intent claim must not appear for mask=${mask}`
      );
      assert.ok(
        !systemPrompt.includes('damage given up for free'),
        `unfired-shot free-damage claim must not appear for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('You command Eastern Europe in a WEGO'),
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
        systemPrompt.includes("(5) Degrade or eliminate enemy home regions' urban production capacity"),
        `goal (5) coaching missing for mask=${mask}`
      );
      assert.ok(systemPrompt.includes('- Your strategy is:'), `strategy coaching header missing for mask=${mask}`);
      assert.ok(systemPrompt.includes('- Your message is:'), `message coaching header missing for mask=${mask}`);
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
        systemPrompt.includes("- Your control of Northern America's home region: 1 of 2 hexes (50%)"),
        `enemy-home-region ownership summary missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('Your home region hexes are:'),
        `AI-exclusive home region hex list missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('Northern America home region hexes are:'),
        `human-exclusive home region hex list missing for mask=${mask}`
      );
      assert.ok(
        systemPrompt.includes('These hexes are in more than one home region:'),
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
        systemPrompt.includes('Enemy home regions: Northern America'),
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
      seatId: 'opponent',
      enabledToolNames: openRouter.getToolNamesForEnabledGroups(apiToggleIds),
      usePrecomputation: false,
    });
    assert.strictEqual(strictResult.success, false, 'strict schema should reject top-level array responses');

    const hexCoordsMod = require('../briefing/map/hexCoordinates') as { ensureStrategicCoordinateRegistryInitialized: () => void };
    const hexCodeTranslator = require('../briefing/map/hexCodeTranslator') as {
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
      seatId: 'opponent',
      enabledToolNames: openRouter.getToolNamesForEnabledGroups(apiToggleIds),
      usePrecomputation: false,
    });
    assert.strictEqual(airResult.success, true, 'valid air action JSON should parse successfully');
    assert.strictEqual(airResult.airStrikes?.length ?? 0, 1, 'air strike entries should carry through model JSON parsing');
    assert.strictEqual(
      airResult.ferryOrders?.length ?? 0,
      0,
      'a strategic ferry naming an unknown unit and an enemy-held destination must not reach resolution'
    );
    assert.ok(
      (airResult.dropReasons ?? []).some((reason) => reason.startsWith('Ferry ')),
      'the rejected strategic ferry must be reported as a drop reason'
    );

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
    assert.ok(
      !tacticalSystemPrompt.includes(WIN_CONDITION_REMINDER_FIRST_SENTENCE),
      'tactical prompt omits strategic win-condition reminder'
    );
    assert.ok(
      tacticalSystemPrompt.includes('engage and defeat enemy forces in this battle'),
      'tactical prompt includes battle-local engage goal'
    );
    assert.ok(
      tacticalSystemPrompt.includes('- Your priority is to engage enemy forces and inflict losses when advantageous'),
      'tactical prompt includes single engage priority'
    );
    assert.ok(tacticalSystemPrompt.includes('- Your strategy is:'), 'tactical prompt includes strategy coaching');
    assert.ok(tacticalSystemPrompt.includes('- Your message is:'), 'tactical prompt includes message coaching');
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

    const noScenarioState = { ...state };
    delete (noScenarioState as { scenarioId?: string }).scenarioId;
    const noScenarioPrompt = buildSystemPromptModule.buildSystemPromptForTools(
      noScenarioState as typeof state,
      tacticalCoordMap,
      openRouter.getToolNamesForEnabledGroups(apiToggleIds),
      '# Brief\n\n## Operational Map\n\n```\nx\n```\n',
      strategicCtx
    );
    assert.ok(
      !noScenarioPrompt.includes(WIN_CONDITION_REMINDER_FIRST_SENTENCE),
      'absent scenarioId must not reuse region-vs-region win wording'
    );
    assert.ok(
      noScenarioPrompt.includes('destroy the enemy force or take enemy territory'),
      'absent scenarioId uses the generic objective'
    );
    assert.ok(
      !noScenarioPrompt.includes('Win by being the last side standing'),
      'absent scenarioId must not teach region-versus-region win-path coaching'
    );
    assert.ok(
      !noScenarioPrompt.includes("Protect your home region's production capacity"),
      'absent scenarioId must not reuse home-region goals'
    );
    const recognisedPrompt = buildSystemPromptModule.buildSystemPromptForTools(
      state,
      tacticalCoordMap,
      openRouter.getToolNamesForEnabledGroups(apiToggleIds),
      '# Brief\n\n## Operational Map\n\n```\nx\n```\n',
      strategicCtx
    );
    assert.ok(
      recognisedPrompt.includes(WIN_CONDITION_REMINDER_FIRST_SENTENCE),
      'region_vs_region still uses the home-region win reminder'
    );

    console.log(`openRouterMatrix.test.ts passed (${combosChecked} combinations)`);
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

