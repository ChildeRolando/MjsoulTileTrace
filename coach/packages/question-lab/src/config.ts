import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseDocument } from "yaml";
import {
  QuestionLabConfigSchema,
  libriichiRuleCanonicalJson,
  type QuestionLabConfig,
  type LabCondition,
} from "@riichi-coach/contracts";

export const digest = (value: unknown): string =>
  createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");
export async function readLabConfig(file: string): Promise<QuestionLabConfig> {
  const text = await readFile(file, "utf8");
  if (Buffer.byteLength(text) > 1024 * 1024)
    throw new Error("config_too_large");
  const doc = parseDocument(text, { uniqueKeys: true });
  if (doc.errors.length) throw new Error("config_invalid_yaml");
  const raw: unknown = doc.toJS({ maxAliasCount: 0 });
  const depth = (v: unknown, n = 0): void => {
    if (n > 32) throw new Error("config_too_deep");
    if (v && typeof v === "object")
      for (const child of Object.values(v)) depth(child, n + 1);
  };
  depth(raw);
  return QuestionLabConfigSchema.parse(raw);
}
export class Random {
  constructor(private value: number) {}
  next() {
    this.value = (this.value + 0x6d2b79f5) | 0;
    let t = Math.imul(this.value ^ (this.value >>> 15), 1 | this.value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number) {
    if (n < 1) throw new Error("empty_domain");
    return Math.floor(this.next() * n);
  }
  shuffle<T>(source: readonly T[]): T[] {
    const a = [...source];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }
}
export function choose<T>(
  value:
    | { fixed: T }
    | { oneOf: T[]; weights?: number[] | undefined }
    | { range: [number, number]; step: number },
  rng: Random,
): T {
  if ("fixed" in value) return structuredClone(value.fixed);
  if ("range" in value)
    return (value.range[0] +
      rng.int(Math.floor((value.range[1] - value.range[0]) / value.step) + 1) *
        value.step) as T;
  if (!value.weights)
    return structuredClone(value.oneOf[rng.int(value.oneOf.length)]!);
  let cursor = rng.next() * value.weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < value.weights.length; i++) {
    cursor -= value.weights[i]!;
    if (cursor < 0) return structuredClone(value.oneOf[i]!);
  }
  return structuredClone(value.oneOf.at(-1)!);
}
export function condition(
  rule: LabCondition | undefined,
  features: Record<string, unknown>,
): boolean {
  return evaluateCondition(rule, features) === true;
}
function evaluateCondition(
  rule: LabCondition | undefined,
  features: Record<string, unknown>,
): boolean | null {
  if (!rule) return true;
  if ("all" in rule) {
    const rows = rule.all.map((r) => evaluateCondition(r, features));
    return rows.includes(false) ? false : rows.includes(null) ? null : true;
  }
  if ("any" in rule) {
    const rows = rule.any.map((r) => evaluateCondition(r, features));
    return rows.includes(true) ? true : rows.includes(null) ? null : false;
  }
  if ("not" in rule) {
    const value = evaluateCondition(rule.not, features);
    return value === null ? null : !value;
  }
  const value = features[rule.field];
  if (rule.field === "valueEstimateMax" && features.valueEstimateKnown === 0)
    return null;
  if (value === null || value === undefined) return null;
  switch (rule.op) {
    case "eq":
      return value === rule.value;
    case "ne":
      return value !== rule.value;
    case "in":
      return Array.isArray(rule.value) && rule.value.includes(value as never);
    case "lt":
      return (
        typeof value === "number" &&
        typeof rule.value === "number" &&
        value < rule.value
      );
    case "lte":
      return (
        typeof value === "number" &&
        typeof rule.value === "number" &&
        value <= rule.value
      );
    case "gt":
      return (
        typeof value === "number" &&
        typeof rule.value === "number" &&
        value > rule.value
      );
    case "gte":
      return (
        typeof value === "number" &&
        typeof rule.value === "number" &&
        value >= rule.value
      );
  }
}
export function scanChoice(
  selector: unknown,
  base: unknown,
  index: number,
): { value: unknown; size: number } {
  const s = selector as {
    fixed?: unknown;
    oneOf?: unknown[];
    range?: [number, number];
    step?: number;
  };
  const values =
    "fixed" in s
      ? [s.fixed]
      : (s.oneOf ??
        (s.range
          ? Array.from(
              {
                length:
                  Math.floor((s.range[1] - s.range[0]) / (s.step ?? 1)) + 1,
              },
              (_, i) => s.range![0] + i * (s.step ?? 1),
            )
          : []));
  if (!values.length || values.length > 100000)
    throw new Error("scan_domain_invalid");
  const start = values.findIndex((v) => digest(v) === digest(base));
  return {
    value: structuredClone(
      values[((start < 0 ? 0 : start) + index) % values.length],
    ),
    size: values.length,
  };
}
