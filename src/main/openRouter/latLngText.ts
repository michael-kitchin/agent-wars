/**
 * Formats a latitude and longitude pair as prompt text.
 *
 * Purpose: A leaf module with no imports, so tool and prompt modules can both format coordinates without importing each other.
 * When to use: Any prompt or tool text that prints a `[lat, lng]` pair.
 * Expected outcome: `formatLatLng` returns `[lat, lng]` with each number fixed to the requested decimals.
 * Exceptions: None.
 */

/**
 * Formats a `[lat, lng]` pair to `decimalPlaces` decimals.
 *
 * Purpose: Prompt text prints every coordinate with the same precision.
 * When to use: Building prompt or tool text that shows a coordinate.
 * Expected outcome: A string such as `[12.34, -56.78]` with each number fixed to `decimalPlaces` decimals.
 * Exceptions: None.
 *
 * @param ll The `[lat, lng]` pair.
 * @param decimalPlaces How many decimals to print for each number.
 */
export function formatLatLng(ll: [number, number], decimalPlaces: number): string {
  return `[${ll[0].toFixed(decimalPlaces)}, ${ll[1].toFixed(decimalPlaces)}]`;
}
