import {
  SourceActionAdaptationResultSchema,
  SourceAdapterContextSchema,
  type SourceActionAdaptationResult,
  type SourceAdapterContext,
  type TypedActionAdapterPort,
} from "@riichi-coach/contracts";

export function runTypedActionAdapter<RawAction>(
  port: TypedActionAdapterPort<RawAction>,
  rawAction: RawAction,
  rawContext: SourceAdapterContext,
): SourceActionAdaptationResult {
  if (port.sourceType.length === 0) {
    throw new Error("Typed adapter source identity must be non-empty");
  }
  const result = SourceActionAdaptationResultSchema.parse(
    port.adapt(rawAction, SourceAdapterContextSchema.parse(rawContext)),
  );
  if (result.sourceType !== port.sourceType) {
    throw new Error(
      `Typed adapter source identity mismatch: ${port.sourceType} != ` +
      result.sourceType,
    );
  }
  return result;
}
