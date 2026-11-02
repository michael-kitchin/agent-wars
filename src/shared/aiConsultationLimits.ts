/**
 * How long one OpenRouter chat completion may run before the transport aborts it.
 *
 * Purpose: Non-streaming completions on these prompts often need more than a minute, and a slow host was being cut off at 90s.
 * When to use: The chat-transport abort timer and socket timeout. A timeout is not sent again.
 * Expected outcome: A single model call is destroyed after 180s if the body has not arrived.
 * Exceptions: None.
 */
export const AI_MODEL_REQUEST_TIMEOUT_MS = 180_000;

/**
 * Extra attempts after the first send of one chat completion.
 *
 * Purpose: The consultation wait budget has to include this retry or an outer timer will cancel a call the transport is still allowed to finish.
 * When to use: `openRouterChatTransport` retry loop and `AI_CONSULTATION_WAIT_TIMEOUT_MS`.
 * Expected outcome: A thrown network error, or HTTP 408, 429, 502, 503, or 504, is sent once more.
 * Exceptions: A timeout, HTTP 500, HTTP 401, and a response-stream stall are not retried.
 */
export const AI_MODEL_REQUEST_RETRY_COUNT = 1;

/**
 * Hard stop for time spent inside one orders consultation's tool loop.
 *
 * Purpose: Bounds a consultation that keeps calling tools. Checked at the start of each round, so the round already in flight can still finish.
 * When to use: `runRequestOrdersToolLoop` compares elapsed time against this value.
 * Expected outcome: The loop returns a timeout-shaped failure once 10 minutes have already elapsed.
 * Exceptions: The in-flight model call and the later parse-repair call are not cut off by this check.
 */
export const AI_CONSULTATION_WALL_CLOCK_MS = 600_000;

/**
 * How long callers may wait for one full `requestOrders` before treating it as hung.
 *
 * Purpose: Shorter outer races cancelled consultations the loop was still allowed to finish.
 * When to use: The outer wait around one `requestOrders` call, including post-resolution.
 * Expected outcome: Covers the 10-minute loop plus the in-flight round and the parse-repair call. Each of those two calls can be sent twice when the failure is a network error or a retryable HTTP status (1320s). A timeout is not sent twice, and the budget still covers the longer case.
 * Exceptions: The waiter aborts the in-flight model call when it fires. The transport's own 180s abort still applies to each attempt.
 */
export const AI_CONSULTATION_WAIT_TIMEOUT_MS =
  AI_CONSULTATION_WALL_CLOCK_MS + 2 * (1 + AI_MODEL_REQUEST_RETRY_COUNT) * AI_MODEL_REQUEST_TIMEOUT_MS;
