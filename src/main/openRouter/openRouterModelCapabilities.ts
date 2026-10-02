import { logDebug, logTrace } from '../logger';
import type { OpenRouterModel } from '../../shared/ipc/openRouterTypes';
import { isEnvFlagEnabled } from './requestOrdersFlowSupport';

/**
 * Last OpenRouter models list, keyed by model id.
 *
 * Purpose: Consultations receive only a model id; request tuning needs that model's capabilities.
 * When to use: Filled by `rememberOpenRouterModels`; read by `getOpenRouterModelCapabilities`.
 * Expected outcome: Empty until the first successful models list in this session.
 * Exceptions: None.
 */
const modelsById = new Map<string, OpenRouterModel>();

/**
 * Model ids whose providers rejected a structured-output request during this session.
 *
 * Purpose: After one rejection, later requests skip the schema instead of failing and retrying every time.
 * When to use: Written by `markStructuredOutputsRejectedForModel`; read before attaching `response_format`.
 * Expected outcome: Cleared only on app restart (or by the test reset).
 * Exceptions: None.
 */
const structuredOutputsRejectedModelIds = new Set<string>();

/**
 * Model ids whose provider rejected `tool_choice: required` during this session.
 *
 * Purpose: Forcing a tool call is not supported by every endpoint. Amazon Bedrock's Claude endpoint rejects
 * OpenRouter's translation of `required` (`tool_choice` type `any`).
 * When to use: Written after a retry with `auto` succeeds; read before choosing `tool_choice`.
 * Expected outcome: Cleared only on app restart (or by the test reset).
 * Exceptions: None.
 */
const requiredToolChoiceRejectedModelIds = new Set<string>();

/**
 * Replaces the cached capabilities with a freshly fetched models list.
 *
 * Purpose: Keeps main-process request tuning in step with the list the player chose from.
 * When to use: Right after `listModels` maps the OpenRouter response.
 * Expected outcome: The cache holds exactly the given models.
 * Exceptions: None.
 */
export function rememberOpenRouterModels(models: readonly OpenRouterModel[]): void {
  logDebug('openRouterModelCapabilities rememberOpenRouterModels', { count: models.length });
  modelsById.clear();
  models.forEach((model) => modelsById.set(model.id, model));
}

/**
 * Looks up a model's cached capabilities.
 *
 * Purpose: Lets request builders decide on `reasoning` and `response_format` for a model id.
 * When to use: When resolving the request profile for a consultation.
 * Expected outcome: The model, or `undefined` when the models list has not been fetched or lacks the id.
 * Exceptions: None.
 */
export function getOpenRouterModelCapabilities(modelId: string): OpenRouterModel | undefined {
  logTrace('openRouterModelCapabilities getOpenRouterModelCapabilities', { modelId });
  return modelsById.get(modelId);
}

/**
 * Developer environment flag that stops every model from receiving the envelope schema.
 *
 * Purpose: Lets a developer run the same model with and without the envelope schema, for example to compare tool use.
 * When to use: `isStructuredOutputsDisabledByEnvironment` only.
 * Expected outcome: Set to 1/true/yes/on before launching the app to disable the schema for that run.
 * Exceptions: None.
 */
const DISABLE_STRUCTURED_OUTPUTS_ENV_FLAG = 'AGENT_WARS_DISABLE_STRUCTURED_OUTPUTS';

/**
 * Reports whether the developer environment flag has turned structured outputs off.
 *
 * Purpose: Lets the schema decision and its diagnostic log agree on why the schema was withheld.
 * When to use: Inside `supportsStructuredOutputs`, and when logging a consultation's request profile.
 * Expected outcome: True when `AGENT_WARS_DISABLE_STRUCTURED_OUTPUTS` is 1/true/yes/on; read on every call.
 * Exceptions: None.
 */
export function isStructuredOutputsDisabledByEnvironment(): boolean {
  const disabled = isEnvFlagEnabled(DISABLE_STRUCTURED_OUTPUTS_ENV_FLAG);
  logTrace('openRouterModelCapabilities isStructuredOutputsDisabledByEnvironment', { disabled });
  return disabled;
}

/**
 * Reports whether a model should be sent the JSON-schema `response_format`.
 *
 * Purpose: The schema is sent only to models that advertise structured outputs. A provider that still rejects the
 * envelope schema (Anthropic caps a schema at 24 optional parameters, and the envelope has more) is handled by the
 * retry without the schema in `postOrdersChatRequest`.
 * When to use: When resolving the request profile.
 * Expected outcome: `true` only when `supported_parameters` lists both `response_format` and `structured_outputs`
 * and `AGENT_WARS_DISABLE_STRUCTURED_OUTPUTS` is not set.
 * Exceptions: None.
 */
export function supportsStructuredOutputs(model: OpenRouterModel | undefined): boolean {
  logTrace('openRouterModelCapabilities supportsStructuredOutputs', { modelId: model?.id ?? null });
  if (isStructuredOutputsDisabledByEnvironment()) return false;
  const parameters = model?.supported_parameters ?? [];
  return parameters.includes('response_format') && parameters.includes('structured_outputs');
}

/**
 * Records that a model's provider rejected the structured-output request.
 *
 * Purpose: Stops sending the schema to that model for the rest of the session.
 * When to use: After a retry without the schema succeeded.
 * Expected outcome: `isStructuredOutputsRejectedForModel(modelId)` returns `true` afterward.
 * Exceptions: None.
 */
export function markStructuredOutputsRejectedForModel(modelId: string): void {
  logDebug('openRouterModelCapabilities markStructuredOutputsRejectedForModel', { modelId });
  structuredOutputsRejectedModelIds.add(modelId);
}

/**
 * Reports whether the schema was already rejected for a model this session.
 *
 * Purpose: Lets request builders skip a request that is known to fail.
 * When to use: Before attaching `response_format` to a request body.
 * Expected outcome: `true` after `markStructuredOutputsRejectedForModel(modelId)`.
 * Exceptions: None.
 */
export function isStructuredOutputsRejectedForModel(modelId: string): boolean {
  logTrace('openRouterModelCapabilities isStructuredOutputsRejectedForModel', { modelId });
  return structuredOutputsRejectedModelIds.has(modelId);
}

/**
 * Records that a model's provider rejected `tool_choice: required`.
 *
 * Purpose: Later rounds use `auto` instead of failing the same way on every consultation.
 * When to use: After a retry with `tool_choice: auto` succeeded.
 * Expected outcome: `isRequiredToolChoiceRejectedForModel(modelId)` returns `true` afterward.
 * Exceptions: None.
 */
export function markRequiredToolChoiceRejectedForModel(modelId: string): void {
  logDebug('openRouterModelCapabilities markRequiredToolChoiceRejectedForModel', { modelId });
  requiredToolChoiceRejectedModelIds.add(modelId);
}

/**
 * Reports whether `tool_choice: required` was already rejected for a model this session.
 *
 * Purpose: Lets the tool loop avoid a request that is known to fail.
 * When to use: When choosing `tool_choice` for a round.
 * Expected outcome: `true` after `markRequiredToolChoiceRejectedForModel(modelId)`.
 * Exceptions: None.
 */
export function isRequiredToolChoiceRejectedForModel(modelId: string): boolean {
  logTrace('openRouterModelCapabilities isRequiredToolChoiceRejectedForModel', { modelId });
  return requiredToolChoiceRejectedModelIds.has(modelId);
}

/**
 * Clears the capability cache and the rejection sets.
 *
 * Purpose: Test isolation for modules that read this state.
 * When to use: At the start of each test that depends on capabilities or rejections.
 * Expected outcome: The capability cache and both rejection sets are empty.
 * Exceptions: None.
 */
export function resetOpenRouterModelCapabilitiesForTests(): void {
  logDebug('openRouterModelCapabilities resetOpenRouterModelCapabilitiesForTests');
  modelsById.clear();
  structuredOutputsRejectedModelIds.clear();
  requiredToolChoiceRejectedModelIds.clear();
}
