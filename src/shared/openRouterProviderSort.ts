/**
 * The OpenRouter host preference stored for one commander.
 *
 * Purpose: The popover, the seat row, and the remembered snapshot share one set of ids.
 * When to use: Commander settings and any read of a stored provider choice.
 * Expected outcome: `throughput`, `price`, `latency`, or `nitro`. A missing or unknown value reads as `throughput`.
 * Exceptions: None. This module does not import the main-process logger. The renderer uses it.
 */

/**
 * Stored id for how OpenRouter picks a host.
 *
 * Purpose: One union for the seat column, the remembered snapshot, and the request profile.
 * When to use: Commander types and the provider control.
 * Expected outcome: `throughput`, `price`, `latency`, or `nitro`.
 * Exceptions: None.
 */
export type ProviderSortChoice = 'throughput' | 'price' | 'latency' | 'nitro';

/**
 * The four provider choices, in display order.
 *
 * Purpose: The provider list and the stored-value check share one list.
 * When to use: Building the provider options, and `isProviderSortChoice`.
 * Expected outcome: Throughput, then price, then latency, then nitro.
 * Exceptions: None.
 */
export const PROVIDER_SORT_CHOICES: readonly ProviderSortChoice[] = Object.freeze([
  'throughput',
  'price',
  'latency',
  'nitro',
]);

/**
 * The words shown for each provider choice.
 *
 * Purpose: The popover and the how-to-play text name the same four hosts.
 * When to use: A provider option's label.
 * Expected outcome: Highest Throughput, Lowest Price, Lowest Latency, and Priority Service (Nitro).
 * Exceptions: None.
 */
export const PROVIDER_SORT_LABELS: Record<ProviderSortChoice, string> = Object.freeze({
  throughput: 'Highest Throughput',
  price: 'Lowest Price',
  latency: 'Lowest Latency',
  nitro: 'Priority Service (Nitro)',
});

/**
 * The provider choice a new commander and an old save use.
 *
 * Purpose: A missing stored value stays Highest Throughput.
 * When to use: A new row, a null column, and an unknown snapshot field.
 * Expected outcome: `throughput`.
 * Exceptions: None.
 */
export const DEFAULT_PROVIDER_SORT: ProviderSortChoice = 'throughput';

/**
 * Returns whether a stored value is one of the four provider choices.
 *
 * Purpose: An IPC payload and a snapshot row are untrusted until this passes.
 * When to use: Before writing a provider choice, and inside `providerSortOrDefault`.
 * Expected outcome: True only for `throughput`, `price`, `latency`, and `nitro`.
 * Exceptions: None.
 */
export function isProviderSortChoice(value: unknown): value is ProviderSortChoice {
  return typeof value === 'string' && (PROVIDER_SORT_CHOICES as readonly string[]).includes(value);
}

/**
 * Returns a stored provider choice, or Highest Throughput when the value is missing or unknown.
 *
 * Purpose: An older seat row and an older remembered snapshot have no provider field.
 * When to use: While reading `seats.provider_sort` and a remembered commander.
 * Expected outcome: `value` when it is a `ProviderSortChoice`. Otherwise `DEFAULT_PROVIDER_SORT`.
 * Exceptions: None.
 */
export function providerSortOrDefault(value: unknown): ProviderSortChoice {
  return isProviderSortChoice(value) ? value : DEFAULT_PROVIDER_SORT;
}
