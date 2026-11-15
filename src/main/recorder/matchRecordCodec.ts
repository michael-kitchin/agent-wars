/**
 * Compresses and restores a history payload.
 *
 * Purpose: Every record uses the same JSON-then-deflate encoding.
 * When to use: Inserting a row and reading one back.
 * Expected outcome: A buffer the `payload` column can store, or the original JSON value.
 * Exceptions: Throws when the payload cannot be expressed as JSON, or when the bytes are not a compressed JSON value.
 */

import { deflateSync, inflateSync } from 'node:zlib';

/**
 * Encodes a payload for the `payload` column.
 *
 * Purpose: The column stores compressed UTF-8 JSON, not the object.
 * When to use: Immediately before an insert.
 * Expected outcome: A deflated buffer of the JSON text.
 * Exceptions: Throws `Error` when `JSON.stringify` returns undefined, which happens for a function or `undefined`.
 */
export function encodeRecordPayload(payload: unknown): Buffer {
  const text = JSON.stringify(payload);
  if (text === undefined) throw new Error('Record payload cannot be encoded as JSON.');
  return deflateSync(Buffer.from(text, 'utf8'));
}

/**
 * Restores a payload from the `payload` column.
 *
 * Purpose: Readers work with the JSON value, not the compressed bytes.
 * When to use: Listing records and writing a recording file.
 * Expected outcome: The value that was encoded.
 * Exceptions: Throws when the bytes are not deflated JSON.
 */
export function decodeRecordPayload(blob: Buffer | Uint8Array): unknown {
  const text = inflateSync(Buffer.from(blob)).toString('utf8');
  return JSON.parse(text) as unknown;
}
