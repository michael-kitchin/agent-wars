/**
 * Tiny binary min-heap keyed by numeric priority (`d`), payload opaque for Dijkstra-style queues.
 *
 * Purpose: Avoid duplicating identical sift-up/sift-down logic across tactical march planners while staying allocation-light.
 * When to use: Priority queues ordered by accumulated movement cost or distance label.
 * Expected outcome: Min `d` pops first; structural identical behavior to prior inlined heaps.
 * Exceptions: None.
 */

/**
 * One heap element: arbitrary payload plus ascending-sort priority `d`.
 *
 * Contract: `d` is the sort key only; callers attach meaning (hex id, land state key, …).
 */
export type NumericPriorityHeapEntry<TPayload> = {
  payload: TPayload;
  d: number;
};

/**
 * Inserts `(payload, d)` and restores the min-heap invariant by `d`.
 *
 * Purpose: Push step for cost-based frontier expansion.
 * When to use: After discovering a cheaper distance label with smaller `d` tie-breaking implicit by insertion order only where intended by caller.
 * Expected outcome: Heap ready for `popNumericPriorityMinHeap`.
 */
export function pushNumericPriorityMinHeap<TPayload>(
  heap: NumericPriorityHeapEntry<TPayload>[],
  payload: TPayload,
  d: number
): void {
  heap.push({ payload, d });
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p]!.d <= heap[i]!.d) break;
    const t = heap[p]!;
    heap[p] = heap[i]!;
    heap[i] = t;
    i = p;
  }
}

/**
 * Removes and returns the smallest-`d` entry, or undefined when empty.
 *
 * Purpose: Pop step matching push twin for tactical march search loops.
 * Expected outcome: Root has minimum `d` among entries currently in the heap.
 */
export function popNumericPriorityMinHeap<TPayload>(
  heap: NumericPriorityHeapEntry<TPayload>[]
): NumericPriorityHeapEntry<TPayload> | undefined {
  if (heap.length === 0) return undefined;
  const top = heap[0]!;
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let smallest = i;
      if (l < heap.length && heap[l]!.d < heap[smallest]!.d) smallest = l;
      if (r < heap.length && heap[r]!.d < heap[smallest]!.d) smallest = r;
      if (smallest === i) break;
      const t = heap[i]!;
      heap[i] = heap[smallest]!;
      heap[smallest] = t;
      i = smallest;
    }
  }
  return top;
}
