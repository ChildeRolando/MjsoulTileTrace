const TABLE = "storageReferences";
const REF = "storageReference";
type Tables = { evidenceSets: string[][]; events: Array<{ eventRef: string; json: string }>; histories: Array<[number, number]> };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** RCPKG03 is a storage codec, not a new analysis schema. Evidence sets and
 * event history prefixes are stored once; public packages retain their exact
 * logical fields and semantic hash. Metadata paths remain at the root. */
export function encodeSharedPackageStorage(input: unknown): unknown {
  const tables: Tables = { evidenceSets: [], events: [], histories: [] };
  const sets = new Map<string, number>();
  const events = new Map<string, number>();
  const histories = new Map<string, number>();
  const copied = new WeakMap<object, Map<string, unknown>>();
  const visit = (value: unknown, key = ""): unknown => {
    if (value === null || typeof value !== "object") return value;
    const context = key === "evidenceIds" || key === "sourceRefs" ? "evidence" : key === "events" ? "events" : "";
    const previous = copied.get(value)?.get(context);
    if (previous !== undefined) return previous;
    let result: unknown;
    if (Array.isArray(value) && (key === "evidenceIds" || key === "sourceRefs") && value.every(item => typeof item === "string")) {
      const identity = JSON.stringify(value);
      let id = sets.get(identity);
      if (id === undefined) { id = tables.evidenceSets.length; sets.set(identity, id); tables.evidenceSets.push(value); }
      result = { [REF]: ["evidence", id] };
    } else if (Array.isArray(value) && key === "events" && value.length > 0 && value.every(item => record(item) &&
      Object.keys(item).length === 2 && typeof item.eventRef === "string" && typeof item.json === "string")) {
      let parent = -1;
      for (const item of value as Tables["events"]) {
        const identity = JSON.stringify([item.eventRef, item.json]);
        let event = events.get(identity);
        if (event === undefined) { event = tables.events.length; events.set(identity, event); tables.events.push(item); }
        const path = `${parent}:${event}`;
        let id = histories.get(path);
        if (id === undefined) { id = tables.histories.length; histories.set(path, id); tables.histories.push([parent, event]); }
        parent = id;
      }
      result = { [REF]: ["history", parent] };
    } else if (record(value) && context !== "" && Object.hasOwn(value, REF)) result = { [REF]: ["literal", visit(value)] };
    else if (Array.isArray(value)) result = value.map(child => visit(child));
    else result = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, visit(child, name)]));
    let byContext = copied.get(value);
    if (byContext === undefined) { byContext = new Map(); copied.set(value, byContext); }
    byContext.set(context, result);
    return result;
  };
  if (!record(input) || Object.hasOwn(input, TABLE)) throw new Error("package_storage_references_invalid");
  return { ...(visit(input) as object), [TABLE]: tables };
}

export function decodeSharedPackageStorage(input: unknown): unknown {
  const invalid = (): never => { throw new Error("package_storage_references_invalid"); };
  if (!record(input) || !record(input[TABLE])) return invalid();
  const raw = input[TABLE];
  if (Object.keys(raw).sort().join() !== "events,evidenceSets,histories" || !Array.isArray(raw.evidenceSets) || !Array.isArray(raw.events) || !Array.isArray(raw.histories)) return invalid();
  const tables = raw as Tables;
  for (const set of tables.evidenceSets) if (!Array.isArray(set) || !set.every(id => typeof id === "string")) return invalid();
  for (const event of tables.events) if (!record(event) || Object.keys(event).sort().join() !== "eventRef,json" || typeof event.eventRef !== "string" || typeof event.json !== "string") return invalid();
  tables.histories.forEach((node, id) => {
    if (!Array.isArray(node) || node.length !== 2 || !Number.isSafeInteger(node[0]) || node[0] < -1 || node[0] >= id ||
      !Number.isSafeInteger(node[1]) || node[1] < 0 || node[1] >= tables.events.length) invalid();
  });
  const histories = new Map<number, Tables["events"]>();
  const history = (id: number): Tables["events"] => {
    const existing = histories.get(id);
    if (existing !== undefined) return existing;
    const result: Tables["events"] = [];
    for (let cursor = id; cursor !== -1; cursor = tables.histories[cursor]![0]) result.push(tables.events[tables.histories[cursor]![1]]!);
    result.reverse();
    histories.set(id, result);
    return result;
  };
  const visit = (value: unknown, key = ""): unknown => {
    if (Array.isArray(value)) return value.map(child => visit(child));
    if (!record(value)) return value;
    // References are interpreted only in encoded array positions. Arbitrary
    // evidence payload objects with this spelling are ordinary logical data.
    if ((key === "evidenceIds" || key === "sourceRefs" || key === "events") && Object.hasOwn(value, REF)) {
      const ref = value[REF];
      if (Object.keys(value).length !== 1 || !Array.isArray(ref) || ref.length !== 2) return invalid();
      if (ref[0] === "literal" && record(ref[1])) return visit(ref[1]);
      if (!Number.isSafeInteger(ref[1]) || ref[1] < 0) return invalid();
      if (ref[0] === "evidence" && key !== "events" && ref[1] < tables.evidenceSets.length) return tables.evidenceSets[ref[1]];
      if (ref[0] === "history" && key === "events" && ref[1] < tables.histories.length) return history(ref[1]);
      return invalid();
    }
    return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, visit(child, name)]));
  };
  const { [TABLE]: _, ...root } = input;
  return visit(root);
}
