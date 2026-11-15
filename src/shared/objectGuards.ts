/**
 * Whether a value is a non-null object, including arrays.
 *
 * Purpose: The terrain loaders rely on this check. An array still passes, so a bad array fails later with the loader's own message.
 * When to use: When a JSON value must be an object and an array should still pass this check.
 * Expected outcome: True for objects and arrays. Arrays pass. False for null and for every non-object.
 * Exceptions: None. Switching a terrain loader to `isNonArrayObject` would change its error message for an array.
 */
export function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Whether a value is a non-null object that is not an array.
 *
 * Purpose: Pack decoders read named fields, which an array does not have.
 * When to use: When a JSON value must be a field object.
 * Expected outcome: True for objects. Arrays fail. False for null and for every non-object.
 * Exceptions: None.
 */
export function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
