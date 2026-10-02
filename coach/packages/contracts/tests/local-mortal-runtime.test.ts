import { describe, expect, it } from "vitest";
import { LocalMortalInferenceResponseSchema, ManagedMortalRuntimeManifestSchema } from "../src/index.js";

describe("local Mortal strict contracts", () => {
  it("rejects unknown manifest fields and raw debug prose", () => {
    expect(() => ManagedMortalRuntimeManifestSchema.parse({ debug: "path" })).toThrow();
    expect(() => LocalMortalInferenceResponseSchema.parse({
      protocolVersion: "riichi-local-mortal-jsonl/v1", requestId: "x", status: "error",
      code: "mortal_protocol_invalid", debug: "traceback",
    })).toThrow();
  });
});
