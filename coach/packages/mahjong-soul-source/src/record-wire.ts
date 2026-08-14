import { parse as parseProtobuf } from "protobufjs";
import { MahjongSoulSourceError } from "./errors.js";
import type { MahjongSoulProtocolBundle } from "./protocol-bundle.js";

const RECORD_CONTAINER_INVALID = "mahjong_soul_record_container_invalid" as const;

// The fetchGameRecord `data` field (inline) is the OUTER transport Wrapper:
//
//   lq.Wrapper { name: ".lq.GameDetailRecords", data: <lq.GameDetailRecords> }
//
// This is the transport/ingestion boundary. Strictly validate the wrapper name
// and return the inner GameDetailRecords bytes, which become the unified
// `recordBytes` used for sha256 and the mapper's sourceRecordHash. Fails closed
// on any mismatch — never "peel until it decodes", because that turns protocol
// drift into implicit compatibility.
export function unwrapGameDetailRecords(
  bundle: MahjongSoulProtocolBundle,
  data: Uint8Array,
): Uint8Array {
  if (!(data instanceof Uint8Array) || data.length === 0) {
    throw new MahjongSoulSourceError(RECORD_CONTAINER_INVALID);
  }
  try {
    const root = parseProtobuf(bundle.protoText, { keepCase: true }).root;
    const wrapperType = root.lookupType("lq.Wrapper");
    const projected = wrapperType.toObject(wrapperType.decode(data), {
      defaults: true,
      bytes: Uint8Array,
    }) as { name?: unknown; data?: unknown };
    if (
      projected.name !== ".lq.GameDetailRecords"
      || !(projected.data instanceof Uint8Array)
      || projected.data.length === 0
    ) {
      throw new MahjongSoulSourceError(RECORD_CONTAINER_INVALID);
    }
    return Uint8Array.from(projected.data);
  } catch (error) {
    if (error instanceof MahjongSoulSourceError) throw error;
    throw new MahjongSoulSourceError(RECORD_CONTAINER_INVALID);
  }
}
