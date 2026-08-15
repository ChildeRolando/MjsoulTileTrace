import { z } from "zod";

// Fixed diagnostic vocabulary for the privileged Mortal (mjai-reviewer)
// source boundary. Callers switch on `code`; the human-facing `message`
// never interpolates the result URL, raw JSON, or any fetched bytes.
export const MortalSourceErrorCodeSchema = z.enum([
  "mortal_result_url_invalid",
  "mortal_result_fetch_failed",
  "mortal_result_redirect_rejected",
  "mortal_result_size_exceeded",
  "mortal_result_content_type_rejected",
  "mortal_result_invalid_json",
  "mortal_report_schema_unsupported",
  "mortal_report_perspective_mismatch",
  "mortal_report_game_fingerprint_mismatch",
  "mortal_decision_anchor_not_found",
  "mortal_decision_anchor_ambiguous",
  "mortal_decision_actual_mismatch",
  "mortal_decision_unsupported_entry",
]);
export type MortalSourceErrorCode = z.infer<
  typeof MortalSourceErrorCodeSchema
>;

export class MortalSourceError extends Error {
  readonly code: MortalSourceErrorCode;

  constructor(code: MortalSourceErrorCode) {
    if (
      arguments.length !== 1
      || !MortalSourceErrorCodeSchema.safeParse(code).success
    ) {
      throw new TypeError("mortal_source_error_code_invalid");
    }
    super(code);
    this.name = "MortalSourceError";
    this.code = code;
    Object.freeze(this);
  }
}
