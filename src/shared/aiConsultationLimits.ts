/**
 * How long one OpenRouter chat completion may run before the transport aborts it.
 *
 * Purpose: Non-streaming Muse completions on these prompts often need most of a minute; 45s was aborting live calls.
 * When to use: The chat-transport abort timer and socket timeout. One retry follows a timeout.
 * Expected outcome: A single model call is destroyed after 90s if the body has not arrived.
 * Exceptions: None.
 */
export const AI_MODEL_REQUEST_TIMEOUT_MS = 90_000;

/**
 * Extra attempts after the first send of one chat completion.
 *
 * Purpose: The consultation wait budget has to include this retry or an outer timer will cancel a call the transport is still allowed to finish.
 * When to use: `openRouterChatTransport` retry loop and `AI_CONSULTATION_WAIT_TIMEOUT_MS`.
 * Expected outcome: A timed-out or thrown completion is sent once more.
 * Exceptions: HTTP 401 and response-stream stalls are not retried.
 */
export const AI_MODEL_REQUEST_RETRY_COUNT = 1;

/**
 * Hard stop for time spent inside one orders consultation's tool loop.
 *
 * Purpose: Bounds a consultation that keeps calling tools. Checked at the start of each round, so the round already in flight can still finish.
 * When to use: `runRequestOrdersToolLoop` compares elapsed time against this value.
 * Expected outcome: The loop returns a timeout-shaped failure once 5 minutes have already elapsed.
 * Exceptions: The in-flight model call and the later parse-repair call are not cut off by this check.
 */
export const AI_CONSULTATION_WALL_CLOCK_MS = 300_000;

/**
 * How long callers may wait for one full `requestOrders` before treating it as hung.
 *
 * Purpose: Shorter outer races (the old 75s background timer and 120s post-resolution race) cancelled consultations the loop was still allowed to finish.
 * When to use: Post-resolution `Promise.race` and the renderer's background `requestAiOrders` timer.
 * Expected outcome: Covers the 5-minute loop plus the in-flight round and the parse-repair call, each including its one retry (660s).
 * Exceptions: The waiter aborts the in-flight model call when it fires. The transport's own 90s abort still applies to each attempt.
 */
export const AI_CONSULTATION_WAIT_TIMEOUT_MS =
  AI_CONSULTATION_WALL_CLOCK_MS + 2 * (1 + AI_MODEL_REQUEST_RETRY_COUNT) * AI_MODEL_REQUEST_TIMEOUT_MS;
