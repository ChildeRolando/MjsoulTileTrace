import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { ReviewReadBackContext } from "@riichi-coach/reasoning";
import { freezeReviewReadBack } from "../src/freeze-review-read-back.js";

describe("repository read-back immutability", () => {
  it("freezes every descendant including shallow-frozen parents, shared values and cycles", () => {
    const child = { evidence: ["original"] };
    const shallow = Object.freeze({ child });
    const padding = Array.from({ length: 70_000 }, (_, index) => ({ index }));
    // Revisit aliases after the completed-object cache has been evicted.
    const root = { shallow, padding, aliases: [child, child], self: null as unknown };
    root.self = root;
    const frozen = freezeReviewReadBack(root as unknown as ReviewReadBackContext);
    expect(frozen).toBe(root);
    for (const value of [root, shallow, child, child.evidence, root.aliases]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(() => child.evidence.push("tampered")).toThrow();
    expect(root.aliases[0]).toBe(root.aliases[1]);
    expect(root.self).toBe(root);
    expect(child.evidence).toEqual(["original"]);
    expect(Object.isFrozen(padding)).toBe(true);
    expect(padding.every((entry, index) => Object.isFrozen(entry) && entry.index === index)).toBe(true);
  });

  it("freezes all records within a bounded heap without retaining a graph-sized visited set", () => {
    const moduleUrl = new URL("../src/freeze-review-read-back.ts", import.meta.url).href;
    const script = `
      import assert from 'node:assert/strict';
      import { freezeReviewReadBack } from ${JSON.stringify(moduleUrl)};
      const count = 2_000_000;
      const records = Array.from({ length: count }, (_, index) => ({ index }));
      const input = Object.freeze({ records });
      assert.equal(freezeReviewReadBack(input), input);
      assert.ok(Object.isFrozen(records));
      assert.equal(records.length, count);
      for (let index = 0; index < count; index++) {
        assert.ok(Object.isFrozen(records[index]));
        assert.equal(records[index].index, index);
      }
      console.log('all-records-immutable');
    `;
    const result = spawnSync(process.execPath, ["--max-old-space-size=128", "--experimental-strip-types", "--input-type=module", "--eval", script], {
      encoding: "utf8", timeout: 30_000, windowsHide: true,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("all-records-immutable");
  }, 35_000);
});
