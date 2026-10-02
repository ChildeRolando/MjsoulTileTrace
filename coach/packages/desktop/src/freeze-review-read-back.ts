import type { ReviewReadBackContext } from "@riichi-coach/reasoning";

/** Freeze only the repository-owned read, never a save caller's input. */
export function freezeReviewReadBack(context: ReviewReadBackContext): ReviewReadBackContext {
  // Only the current recursion path must be retained for cycle protection.
  // Remember a bounded number of completed objects to avoid repeatedly walking
  // shared provenance lists; eviction merely repeats work, never skips a child.
  const active = new WeakSet<object>();
  let completed = new WeakSet<object>();
  let completedCount = 0;
  const freeze = (value: unknown): void => {
    if (value === null || typeof value !== "object" || active.has(value) || completed.has(value)) return;
    active.add(value);
    // These arrays come from validated plain JSON. Iteration avoids allocating
    // another array with millions of graph edges as Object.values would do.
    if (Array.isArray(value)) {
      for (const child of value) freeze(child);
    } else {
      for (const child of Object.values(value)) freeze(child);
    }
    Object.freeze(value);
    active.delete(value);
    if (completedCount === 65_536) {
      completed = new WeakSet<object>();
      completedCount = 0;
    }
    completed.add(value);
    completedCount++;
  };
  freeze(context);
  return context;
}
