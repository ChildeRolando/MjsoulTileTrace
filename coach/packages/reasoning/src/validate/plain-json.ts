/** Inspect descriptors before consumers can invoke getters or toJSON. Shared
 * acyclic values are valid; hidden properties, custom prototypes and sparse
 * arrays are not. No whole-document string or cloned document is allocated. */
export function isPlainJson(value: unknown, allowNegativeZero = false): boolean {
  const active = new WeakSet<object>();
  const visit = (value: unknown): boolean => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value) && (allowNegativeZero || !Object.is(value, -0));
    if (typeof value !== "object" || active.has(value)) return false;
    active.add(value);
    const array = Array.isArray(value);
    let valid = Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype);
    let entries = 0;
    for (const key of Reflect.ownKeys(value)) {
      if (!valid) break;
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (array && key === "length") continue;
      if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor)) {
        valid = false;
        break;
      }
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) {
        valid = false;
        break;
      }
      entries++;
      valid = visit(descriptor.value);
    }
    if (array && entries !== value.length) valid = false;
    active.delete(value);
    return valid;
  };
  return visit(value);
}
