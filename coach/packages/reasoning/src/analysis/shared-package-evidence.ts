/** Own a JSON package while interning repeated evidence lists and immutable
 * native event descriptors. Logical JSON, ordering and identity stay unchanged.
 * Never mutate/freeze a caller's arrays; sharing is scoped to this one package. */
export function cloneWithSharedPackageEvidence<T>(input: T): T {
  const lists = new Map<string, string[]>();
  const events = new Map<string, object>();
  const copied = new WeakMap<object, unknown>();
  const visit = (value: unknown, key = ""): unknown => {
    if (value === null || typeof value !== "object") return value;
    const previous = copied.get(value);
    if (previous !== undefined) return previous;
    if (Array.isArray(value) && (key === "evidenceIds" || key === "sourceRefs") && value.every(item => typeof item === "string")) {
      const identity = JSON.stringify(value);
      let shared = lists.get(identity);
      if (shared === undefined) { shared = [...value]; lists.set(identity, shared); }
      copied.set(value, shared);
      return shared;
    }
    if (key === "event" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      if (Object.keys(record).length === 2 && typeof record.eventRef === "string" && typeof record.json === "string") {
        const identity = JSON.stringify([record.eventRef, record.json]);
        let shared = events.get(identity);
        if (shared === undefined) { shared = { eventRef: record.eventRef, json: record.json }; events.set(identity, shared); }
        copied.set(value, shared);
        return shared;
      }
    }
    const result: unknown[] | Record<string, unknown> = Array.isArray(value) ? [] : {};
    copied.set(value, result);
    if (Array.isArray(value)) for (const child of value) (result as unknown[]).push(visit(child, key === "events" ? "event" : ""));
    else for (const [name, child] of Object.entries(value)) Object.defineProperty(result, name, {
      value: visit(child, name), enumerable: true, writable: true, configurable: true,
    });
    return result;
  };
  return visit(input) as T;
}
