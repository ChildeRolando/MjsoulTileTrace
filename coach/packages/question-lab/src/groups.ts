import { digest } from "./config.js";
export type Split = {
  schemaVersion: "question-lab-split/v1";
  testGroups: string[];
  initialGroups: string[];
  groupMap: Record<string, string>;
  familyMap: Record<string, string>;
};
export function groupedSplit(
  rows: { groupId: string; family: string }[],
  prior?: Split | null,
): Split {
  const parent = new Map<string, string>(),
    find = (key: string): string => {
      const p = parent.get(key);
      if (!p) {
        parent.set(key, key);
        return key;
      }
      if (p === key) return p;
      const root = find(p);
      parent.set(key, root);
      return root;
    };
  const union = (a: string, b: string) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent.set(a > b ? a : b, a > b ? b : a);
  };
  const first = new Map<string, string>();
  for (const row of rows) {
    const group = prior?.groupMap[row.groupId] ?? row.groupId;
    find(group);
    if (first.has(row.family)) union(group, first.get(row.family)!);
    else first.set(row.family, group);
  }
  const groups = [
    ...new Set(rows.map((r) => find(prior?.groupMap[r.groupId] ?? r.groupId))),
  ].sort((a, b) =>
    digest([a, "holdout"]).localeCompare(digest([b, "holdout"])),
  );
  const testGroups = prior
    ? [...new Set(prior.testGroups.map(find))]
    : groups.slice(
        0,
        groups.length >= 5 ? Math.max(1, Math.round(groups.length * 0.2)) : 0,
      );
  if (prior)
    for (const row of rows) {
      const previous = prior.groupMap[row.groupId] ?? row.groupId;
      if (
        !prior.testGroups.includes(previous) &&
        testGroups.includes(find(previous))
      )
        throw new Error("holdout_family_collision");
    }
  return {
    schemaVersion: "question-lab-split/v1",
    testGroups,
    initialGroups: prior?.initialGroups ?? groups,
    groupMap: {
      ...prior?.groupMap,
      ...Object.fromEntries(
        rows.map((r) => [
          r.groupId,
          find(prior?.groupMap[r.groupId] ?? r.groupId),
        ]),
      ),
    },
    familyMap: {
      ...prior?.familyMap,
      ...Object.fromEntries(
        rows.map((r) => [
          r.family,
          find(prior?.groupMap[r.groupId] ?? r.groupId),
        ]),
      ),
    },
  };
}
