import {
  AnalyzableRecordSummarySchema,
  type AnalyzableRecordSummary,
} from "@riichi-coach/contracts";
import { z } from "zod";

const CatalogMethodSchema = z.function()
  .args()
  .returns(z.promise(z.array(AnalyzableRecordSummarySchema)));

export const MahjongSoulCatalogApiSchema = z.object({
  syncAnalyzableRecords: CatalogMethodSchema,
  listAnalyzableRecords: CatalogMethodSchema,
}).strict();

export interface MahjongSoulCatalogApi {
  syncAnalyzableRecords(): Promise<AnalyzableRecordSummary[]>;
  listAnalyzableRecords(): Promise<AnalyzableRecordSummary[]>;
}

export function parseAnalyzableRecordSummaries(
  value: unknown,
): AnalyzableRecordSummary[] {
  const parsed = z.array(AnalyzableRecordSummarySchema).parse(value);
  return parsed.map((entry) => Object.freeze(entry));
}
